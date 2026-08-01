"""議事録Markdownの整形。"""
from __future__ import annotations

from core.transcribe import ChunkResult


def format_timestamp(ms: int) -> str:
    """ミリ秒を HH:MM:SS 形式に変換する。"""
    total_seconds = ms // 1000
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


def render_statement_log(chunk_results: list[ChunkResult]) -> str:
    """タイムスタンプ付きの発言ログをMarkdownの箇条書きとして生成する(話者分離なし)。

    Whisperのsegmentsをそのまま機械的に整形するため、Claudeによる要約・
    言い換え・タイムスタンプの誤生成が起きない。
    """
    lines: list[str] = []
    for result in chunk_results:
        if result.error:
            lines.append(
                f"- **[{format_timestamp(result.start_offset_ms)}] ⚠️ 文字起こし失敗:** {result.error}"
            )
            continue
        for segment in result.segments:
            if segment.text:
                lines.append(f"- [{format_timestamp(segment.start_ms)}] {segment.text}")
    return "\n".join(lines) if lines else "(発言ログなし)"


def render_minutes(extraction: dict, statement_log_md: str) -> str:
    """抽出結果(決定事項/TODO/要約)と発言ログを1つのMarkdown議事録にまとめる。"""
    decisions = extraction.get("decisions") or []
    decisions_md = "\n".join(f"- {d}" for d in decisions) if decisions else "- (なし)"

    todos = extraction.get("todos") or []
    if todos:
        todo_lines = []
        for todo in todos:
            owner = todo.get("owner") or "未定"
            due = todo.get("due") or "未定"
            todo_lines.append(f"- {todo['task']}(担当: {owner} / 期限: {due})")
        todos_md = "\n".join(todo_lines)
    else:
        todos_md = "- (なし)"

    summary = extraction.get("summary", "")

    return f"""# 議事録

## 会議概要
{summary}

## 決定事項
{decisions_md}

## TODO
{todos_md}

## 発言ログ(タイムスタンプ付き・話者分離なし)
{statement_log_md}
"""
