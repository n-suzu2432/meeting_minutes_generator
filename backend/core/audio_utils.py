"""音声/動画ファイルの読み込み・チャンク分割ユーティリティ。"""
from __future__ import annotations

import io
import os
import subprocess
import tempfile
from dataclasses import dataclass

from pydub import AudioSegment
from pydub.silence import detect_silence

import config


@dataclass
class AudioChunk:
    """分割済み音声チャンク(Whisper API送信用)。"""

    audio_bytes: bytes
    start_offset_ms: int


def _downsample_to_temp_wav(file_path: str) -> str:
    """pydubで読み込む前にffmpegで16kHz/モノラルへ変換し、メモリ使用量を抑える。

    元のビットレート(例: 44.1kHz/16bit/ステレオ)のままpydubで読み込むと、
    1時間の音声でPCMが600MB近くになり、メモリ制限の厳しいホスティング環境
    (Render無料プラン等)ではOOMで処理が落ちることがある。事前にffmpegで
    16kHz/モノラルへダウンサンプルしてから読み込むことでメモリ使用量を
    1/5程度に抑えられる(Whisperも内部的に16kHzへリサンプルするため、
    文字起こし精度への影響は実質ない)。
    """
    fd, tmp_path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    subprocess.run(
        ["ffmpeg", "-y", "-i", file_path, "-ar", "16000", "-ac", "1", tmp_path],
        check=True,
        capture_output=True,
    )
    return tmp_path


def probe_duration_seconds(file_path: str) -> float | None:
    """ffprobeで音声/動画の長さ(秒)を取得する。

    ffmpegでの本格的なデコード(ダウンサンプル)を始める前に、長すぎるファイルを
    早期に弾くために使う。取得できない場合はNoneを返し、呼び出し側では
    処理をブロックしない(誤検知でファイルを弾かないためのフェイルオープン)。
    """
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                file_path,
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        return float(result.stdout.strip())
    except (subprocess.CalledProcessError, ValueError, FileNotFoundError):
        return None


def load_audio(file_path: str) -> AudioSegment:
    """音声/動画ファイルを読み込む(mp4等の動画は音声トラックを自動抽出)。

    メモリ使用量を抑えるため、先にffmpegで16kHz/モノラルへ変換してから読み込む。
    """
    downsampled_path = _downsample_to_temp_wav(file_path)
    try:
        return AudioSegment.from_file(downsampled_path)
    finally:
        os.remove(downsampled_path)


def _find_split_points(audio: AudioSegment, target_chunk_ms: int) -> list[int]:
    """target_chunk_ms間隔に近い位置を基準に、可能なら無音区間で分割点を選ぶ。

    無音が見つからない場合は固定位置で分割する(境界での精度劣化はある程度許容)。
    """
    duration = len(audio)
    if duration <= target_chunk_ms:
        return []

    split_points: list[int] = []
    pos = target_chunk_ms
    while pos < duration:
        window_start = max(0, pos - config.SEARCH_WINDOW_MS // 2)
        window_end = min(duration, pos + config.SEARCH_WINDOW_MS // 2)
        window = audio[window_start:window_end]
        silence_thresh = audio.dBFS + config.SILENCE_THRESH_OFFSET_DB
        silences = detect_silence(
            window,
            min_silence_len=config.MIN_SILENCE_LEN_MS,
            silence_thresh=silence_thresh,
        )
        if silences:
            candidates = [window_start + (s + e) // 2 for s, e in silences]
            split_at = min(candidates, key=lambda c: abs(c - pos))
        else:
            split_at = pos
        split_points.append(split_at)
        pos = split_at + target_chunk_ms

    return split_points


def _export_chunk(chunk: AudioSegment) -> bytes:
    """16kHzモノラル/64kbpsのmp3に変換して書き出す。

    Whisperは内部的に16kHzへリサンプルするため音質劣化は実質なく、
    25MB上限に対して十分な余裕を持たせつつアップロード量も削減できる。
    """
    buf = io.BytesIO()
    chunk.set_frame_rate(16000).set_channels(1).export(buf, format="mp3", bitrate="64k")
    return buf.getvalue()


def split_audio(file_path: str, target_chunk_ms: int | None = None) -> list[AudioChunk]:
    """音声ファイルを無音区間を優先して分割し、並列文字起こし用のチャンク列を返す。"""
    if target_chunk_ms is None:
        target_chunk_ms = config.TARGET_CHUNK_MS

    audio = load_audio(file_path)
    split_points = _find_split_points(audio, target_chunk_ms)

    boundaries = [0, *split_points, len(audio)]
    chunks: list[AudioChunk] = []
    for start, end in zip(boundaries[:-1], boundaries[1:]):
        segment = audio[start:end]
        chunks.append(AudioChunk(audio_bytes=_export_chunk(segment), start_offset_ms=start))

    return chunks
