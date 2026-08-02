"""議事録自動生成API(FastAPI)。Next.jsフロントエンドから呼び出される。"""
from __future__ import annotations

import asyncio
import json
import os
import tempfile
import time
from collections.abc import AsyncIterator

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import config
from core import dictionary
from core.audio_utils import probe_duration_seconds, split_audio
from core.extract import ExtractionError, extract_minutes
from core.markdown import render_minutes, render_statement_log
from core.progress import ProgressEstimator
from core.transcribe import ChunkResult, transcribe_chunks

app = FastAPI(title="議事録自動生成API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[config.FRONTEND_ORIGIN],
    allow_methods=["*"],
    allow_headers=["*"],
)


class DictionaryEntry(BaseModel):
    wrong: str
    correct: str


class HealthResponse(BaseModel):
    openai_configured: bool
    anthropic_configured: bool
    ffmpeg_available: bool


class TodoItem(BaseModel):
    task: str
    owner: str | None = None
    due: str | None = None


class MinutesData(BaseModel):
    summary: str
    decisions: list[str]
    todos: list[TodoItem]


class GenerateMinutesResponse(BaseModel):
    markdown: str
    minutes: MinutesData
    statement_log_markdown: str
    failed_chunk_count: int
    replaced_terms: list[dict]
    whisper_cost_estimate_usd: float
    claude_cost_estimate_usd: float


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """APIキー・ffmpegの準備状況をフロントエンドが確認するためのエンドポイント。"""
    return HealthResponse(
        openai_configured=bool(config.OPENAI_API_KEY),
        anthropic_configured=bool(config.ANTHROPIC_API_KEY),
        ffmpeg_available=config.ffmpeg_available(),
    )


@app.get("/api/dictionary", response_model=list[DictionaryEntry])
def get_dictionary() -> list[dict]:
    return dictionary.load_dictionary()


@app.put("/api/dictionary", response_model=list[DictionaryEntry])
def put_dictionary(entries: list[DictionaryEntry]) -> list[dict]:
    cleaned = [e.model_dump() for e in entries if e.wrong]
    dictionary.save_dictionary(cleaned)
    return cleaned


def _progress_event(
    stage: str,
    progress: int,
    message: str,
    *,
    start_time: float | None = None,
    estimator: ProgressEstimator | None = None,
    **extra: object,
) -> bytes:
    payload = {
        "stage": stage,
        "progress": progress,
        "message": message,
        "elapsed_seconds": int(time.monotonic() - start_time) if start_time is not None else 0,
        "step": estimator.step_number(stage) if estimator is not None else None,
        "total_steps": estimator.total_steps if estimator is not None else None,
        **extra,
    }
    return (json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8")


async def _wait_with_heartbeat(
    coro, stage: str, estimator: ProgressEstimator, message: str, start_time: float
):
    """coroの完了を待つ間、HEARTBEAT_INTERVAL_SECONDSごとに進捗イベントをyieldする。

    音声分割(ffmpeg変換+無音検出)やClaude抽出など、単一の処理が長時間かかる
    可能性がある箇所で使う。無通信状態が続くとRenderなどのリバースプロキシに
    タイムアウトされるため、完了を待つ間も定期的にイベントを送って接続を維持する。
    進捗%は、このステージの目安所要時間に対する経過時間の割合を、全体推定時間に
    換算して算出する(実測ではなく音声の長さからの目安)。
    最後にyieldする値がcoroの結果(またはraiseされた例外)。
    """
    task = asyncio.ensure_future(coro)
    stage_start = time.monotonic()
    stage_estimate = estimator.stage_seconds(stage)
    while not task.done():
        try:
            await asyncio.wait_for(asyncio.shield(task), timeout=config.HEARTBEAT_INTERVAL_SECONDS)
        except asyncio.TimeoutError:
            stage_elapsed = time.monotonic() - stage_start
            # 完了前に100%へ到達しないよう、ステージ内進捗は95%までに留める
            stage_fraction = min(stage_elapsed / stage_estimate, 0.95) if stage_estimate else 0.95
            pct = estimator.overall_percent(stage, stage_fraction)
            total_elapsed = int(time.monotonic() - start_time)
            yield _progress_event(
                stage,
                pct,
                f"{message}({total_elapsed}秒経過)",
                start_time=start_time,
                estimator=estimator,
            )
    yield task.result()


async def _generate_minutes_stream(tmp_path: str) -> AsyncIterator[bytes]:
    """議事録生成の各段階の進捗を、1行1JSONのNDJSONとして順次yieldする。

    音声分割→Whisper並列文字起こし→辞書置換→Claude構造化抽出→Markdown整形の
    各段階でstage/progress/messageを通知し、最後にstage="done"でresultを返す。
    途中で失敗した場合はstage="error"を送る(この時点でHTTPステータスは既に200を
    返し始めているため、HTTPExceptionではなくイベントとしてエラーを表現する)。
    """
    if not config.OPENAI_API_KEY or not config.ANTHROPIC_API_KEY:
        yield _progress_event("error", 0, ".envにOPENAI_API_KEYとANTHROPIC_API_KEYを設定してください。")
        return
    if not config.ffmpeg_available():
        yield _progress_event("error", 0, "ffmpegが見つかりません。")
        return

    try:
        duration_seconds = await asyncio.to_thread(probe_duration_seconds, tmp_path)
        if duration_seconds is not None and duration_seconds > config.MAX_DURATION_SECONDS:
            yield _progress_event(
                "error",
                0,
                f"音声が長すぎます(約{int(duration_seconds // 60)}分)。"
                f"{config.MAX_DURATION_SECONDS // 60}分以内のファイルをご利用ください。",
            )
            return

        start_time = time.monotonic()
        estimator = ProgressEstimator(duration_seconds or config.MIN_STAGE_ESTIMATE_SECONDS)

        yield _progress_event(
            "splitting",
            estimator.overall_percent("splitting", 0),
            "音声を分割しています...",
            start_time=start_time,
            estimator=estimator,
        )
        chunks: list = []
        async for event in _wait_with_heartbeat(
            asyncio.to_thread(split_audio, tmp_path), "splitting", estimator, "音声を分割しています", start_time
        ):
            if isinstance(event, bytes):
                yield event
            else:
                chunks = event

        whisper_cost_estimate_usd = (
            sum(len(c.audio_bytes) for c in chunks) / (64_000 / 8) / 60 * config.WHISPER_COST_PER_MINUTE
        )

        yield _progress_event(
            "transcribing",
            estimator.overall_percent("transcribing", 0),
            f"文字起こし中 (0/{len(chunks)})",
            start_time=start_time,
            estimator=estimator,
        )
        chunk_results: list[ChunkResult] = []
        async for event in transcribe_chunks(chunks, config.OPENAI_API_KEY):
            if isinstance(event, list):
                chunk_results = event
            else:
                stage_fraction = event.done / max(event.total, 1)
                pct = estimator.overall_percent("transcribing", stage_fraction)
                yield _progress_event(
                    "transcribing",
                    pct,
                    f"文字起こし中 ({event.done}/{event.total})",
                    start_time=start_time,
                    estimator=estimator,
                )
        failed_chunk_count = sum(1 for r in chunk_results if r.error)

        yield _progress_event(
            "dictionary",
            estimator.overall_percent("dictionary", 0),
            "誤字辞書を適用しています...",
            start_time=start_time,
            estimator=estimator,
        )
        dict_entries = dictionary.load_dictionary()
        aggregated_report: dict[str, dict] = {}
        for result in chunk_results:
            for segment in result.segments:
                segment.text, seg_report = dictionary.apply_dictionary(segment.text, dict_entries)
                for item in seg_report:
                    key = item["誤"]
                    if key in aggregated_report:
                        aggregated_report[key]["件数"] += item["件数"]
                    else:
                        aggregated_report[key] = item

        full_transcript = "\n".join(
            segment.text for result in chunk_results for segment in result.segments
        )

        yield _progress_event(
            "extracting",
            estimator.overall_percent("extracting", 0),
            "Claudeで構造化抽出しています...",
            start_time=start_time,
            estimator=estimator,
        )
        extraction_result = None
        try:
            async for event in _wait_with_heartbeat(
                asyncio.to_thread(extract_minutes, full_transcript, config.ANTHROPIC_API_KEY),
                "extracting",
                estimator,
                "Claudeで構造化抽出しています",
                start_time,
            ):
                if isinstance(event, bytes):
                    yield event
                else:
                    extraction_result = event
        except ExtractionError as exc:
            yield _progress_event(
                "error", 0, str(exc), start_time=start_time, estimator=estimator
            )
            return

        claude_cost_estimate_usd = (
            extraction_result.input_tokens * config.CLAUDE_INPUT_COST_PER_MTOK
            + extraction_result.output_tokens * config.CLAUDE_OUTPUT_COST_PER_MTOK
        ) / 1_000_000

        yield _progress_event(
            "formatting",
            estimator.overall_percent("formatting", 0),
            "Markdownを整形しています...",
            start_time=start_time,
            estimator=estimator,
        )
        statement_log_md = render_statement_log(chunk_results)
        minutes_md = render_minutes(extraction_result.data, statement_log_md)

        result = GenerateMinutesResponse(
            markdown=minutes_md,
            minutes=MinutesData(**extraction_result.data),
            statement_log_markdown=statement_log_md,
            failed_chunk_count=failed_chunk_count,
            replaced_terms=list(aggregated_report.values()),
            whisper_cost_estimate_usd=whisper_cost_estimate_usd,
            claude_cost_estimate_usd=claude_cost_estimate_usd,
        )
        yield _progress_event(
            "done",
            100,
            "完了しました",
            start_time=start_time,
            estimator=estimator,
            result=result.model_dump(),
        )
    except Exception as exc:  # noqa: BLE001 - ストリーム開始後の予期しない失敗もイベントとして通知する
        yield _progress_event("error", 0, f"予期しないエラーが発生しました: {exc}")
    finally:
        os.remove(tmp_path)


@app.post("/api/minutes")
async def generate_minutes(file: UploadFile = File(...)) -> StreamingResponse:
    """音声/動画ファイルを受け取り、一時ファイルへ保存してからストリーミング処理を開始する。

    ファイルサイズの上限チェックはストリームを開始する前に行い、超過時は
    NDJSONイベントではなく通常のHTTPエラー(413)として返す
    (フロントエンドは!res.okの時点でエラーとして扱えるため)。
    """
    content = await file.read()
    if len(content) > config.MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=(
                f"ファイルサイズが大きすぎます({len(content) / 1024 / 1024:.1f}MB)。"
                f"{config.MAX_UPLOAD_BYTES // (1024 * 1024)}MB以内のファイルをご利用ください。"
            ),
        )

    suffix = os.path.splitext(file.filename or "")[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    return StreamingResponse(
        _generate_minutes_stream(tmp_path), media_type="application/x-ndjson"
    )
