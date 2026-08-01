"""Whisper APIによる並列文字起こし。"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

from openai import AsyncOpenAI

import config
from core.audio_utils import AudioChunk


@dataclass
class Segment:
    """タイムスタンプ付きの文字起こしセグメント(発話区間)。"""

    start_ms: int
    end_ms: int
    text: str


@dataclass
class ChunkResult:
    """1チャンク分の文字起こし結果。失敗時はerrorに理由が入りsegmentsは空になる。"""

    index: int
    start_offset_ms: int
    segments: list[Segment] = field(default_factory=list)
    error: str | None = None


async def _transcribe_chunk(
    client: AsyncOpenAI,
    index: int,
    chunk: AudioChunk,
    semaphore: asyncio.Semaphore,
) -> ChunkResult:
    async with semaphore:
        last_error: Exception | None = None
        for attempt in range(config.MAX_RETRIES):
            try:
                response = await client.audio.transcriptions.create(
                    model=config.WHISPER_MODEL,
                    file=(f"chunk_{index}.mp3", chunk.audio_bytes, "audio/mpeg"),
                    language="ja",
                    response_format="verbose_json",
                )
                segments = [
                    Segment(
                        start_ms=chunk.start_offset_ms + int(seg.start * 1000),
                        end_ms=chunk.start_offset_ms + int(seg.end * 1000),
                        text=seg.text.strip(),
                    )
                    for seg in (response.segments or [])
                ]
                return ChunkResult(index=index, start_offset_ms=chunk.start_offset_ms, segments=segments)
            except Exception as exc:  # noqa: BLE001 - Whisper呼び出し失敗は種類を問わずリトライする
                last_error = exc
                await asyncio.sleep(min(2**attempt, 20))

        return ChunkResult(
            index=index,
            start_offset_ms=chunk.start_offset_ms,
            segments=[],
            error=str(last_error),
        )


async def transcribe_chunks(chunks: list[AudioChunk], api_key: str) -> list[ChunkResult]:
    """複数の音声チャンクを並列にWhisper APIへ送信し、時系列順の結果を返す。

    同時実行数はconfig.CONCURRENCYで制御し、レート制限による失敗を抑える。
    """
    client = AsyncOpenAI(api_key=api_key)
    semaphore = asyncio.Semaphore(config.CONCURRENCY)

    tasks = [
        _transcribe_chunk(client, index, chunk, semaphore)
        for index, chunk in enumerate(chunks)
    ]
    results = await asyncio.gather(*tasks)
    return sorted(results, key=lambda r: r.index)
