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

# アップロード上限(無料ホスティングのメモリ・処理時間制約に収めるための保険)
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_MB", 200)) * 1024 * 1024
MAX_DURATION_SECONDS = int(os.getenv("MAX_DURATION_MINUTES", 120)) * 60

# 長時間かかる処理中に定期的に進捗イベントを送る間隔(プロキシのタイムアウト対策)
HEARTBEAT_INTERVAL_SECONDS = int(os.getenv("HEARTBEAT_INTERVAL_SECONDS", 10))

# 進捗表示: 音声の長さ(秒)から各段階の目安所要時間を見積もる際の係数。
# 実測データではなく目安。実際の所要時間の傾向が分かってきたら調整する。
MIN_STAGE_ESTIMATE_SECONDS = 5
SPLIT_ESTIMATE_RATIO = 0.05
TRANSCRIBE_ESTIMATE_RATIO = 0.35
DICTIONARY_ESTIMATE_SECONDS = 3
EXTRACT_ESTIMATE_RATIO = 0.04
EXTRACT_ESTIMATE_BASE_SECONDS = 15
FORMAT_ESTIMATE_SECONDS = 3

# フロントエンド(Next.js)のオリジン。CORS許可先。
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")

# 概算コスト(USD、目安表示用)
WHISPER_COST_PER_MINUTE = 0.006
CLAUDE_INPUT_COST_PER_MTOK = 3.0
CLAUDE_OUTPUT_COST_PER_MTOK = 15.0


def ffmpeg_available() -> bool:
    """ffmpegがPATH上に存在するか確認する。"""
    return shutil.which("ffmpeg") is not None
