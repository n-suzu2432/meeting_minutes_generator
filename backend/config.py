"""アプリ全体で使う設定値・環境変数。"""
from __future__ import annotations

import os
import shutil
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

WHISPER_MODEL = "whisper-1"
CLAUDE_MODEL = "claude-sonnet-5"

# 音声分割(無音検出ベース)
TARGET_CHUNK_MS = int(os.getenv("TARGET_CHUNK_MS", 6 * 60 * 1000))  # 既定6分
SEARCH_WINDOW_MS = 30_000
MIN_SILENCE_LEN_MS = 500
SILENCE_THRESH_OFFSET_DB = -16

# 並列文字起こし
CONCURRENCY = int(os.getenv("TRANSCRIBE_CONCURRENCY", 4))
MAX_RETRIES = 3

# 誤字置換辞書
DICTIONARY_PATH = BASE_DIR / "data" / "dictionary.json"

# フロントエンド(Next.js)のオリジン。CORS許可先。
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")

# 概算コスト(USD、目安表示用)
WHISPER_COST_PER_MINUTE = 0.006
CLAUDE_INPUT_COST_PER_MTOK = 3.0
CLAUDE_OUTPUT_COST_PER_MTOK = 15.0


def ffmpeg_available() -> bool:
    """ffmpegがPATH上に存在するか確認する。"""
    return shutil.which("ffmpeg") is not None
