"""議事録自動生成API(FastAPI)。Next.jsフロントエンドから呼び出される。"""
from __future__ import annotations

import asyncio
import os
import tempfile

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import config
from core import dictionary
from core.audio_utils import split_audio
from core.extract import ExtractionError, extract_minutes
from core.markdown import render_minutes, render_statement_log
from core.transcribe import transcribe_chunks

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


@app.post("/api/minutes", response_model=GenerateMinutesResponse)
async def generate_minutes(file: UploadFile = File(...)) -> GenerateMinutesResponse:
    """音声/動画ファイルから議事録を生成する。

    音声分割→Whisper並列文字起こし→辞書置換→Claude構造化抽出→Markdown整形、
    をすべて完了させてから1回のレスポンスで返す(同期処理)。
    """
    if not config.OPENAI_API_KEY or not config.ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=500,
            detail=".envにOPENAI_API_KEYとANTHROPIC_API_KEYを設定してください。",
        )
    if not config.ffmpeg_available():
        raise HTTPException(status_code=500, detail="ffmpegが見つかりません。")

    suffix = os.path.splitext(file.filename or "")[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        chunks = await asyncio.to_thread(split_audio, tmp_path)

        whisper_cost_estimate_usd = (
            sum(len(c.audio_bytes) for c in chunks) / (64_000 / 8) / 60 * config.WHISPER_COST_PER_MINUTE
        )

        chunk_results = await transcribe_chunks(chunks, config.OPENAI_API_KEY)
        failed_chunk_count = sum(1 for r in chunk_results if r.error)

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

        try:
            extraction_result = await asyncio.to_thread(
                extract_minutes, full_transcript, config.ANTHROPIC_API_KEY
            )
        except ExtractionError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        claude_cost_estimate_usd = (
            extraction_result.input_tokens * config.CLAUDE_INPUT_COST_PER_MTOK
            + extraction_result.output_tokens * config.CLAUDE_OUTPUT_COST_PER_MTOK
        ) / 1_000_000

        statement_log_md = render_statement_log(chunk_results)
        minutes_md = render_minutes(extraction_result.data, statement_log_md)

        return GenerateMinutesResponse(
            markdown=minutes_md,
            minutes=MinutesData(**extraction_result.data),
            statement_log_markdown=statement_log_md,
            failed_chunk_count=failed_chunk_count,
            replaced_terms=list(aggregated_report.values()),
            whisper_cost_estimate_usd=whisper_cost_estimate_usd,
            claude_cost_estimate_usd=claude_cost_estimate_usd,
        )
    finally:
        os.remove(tmp_path)
