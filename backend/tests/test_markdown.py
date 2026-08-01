from core.markdown import format_timestamp, render_minutes, render_statement_log
from core.transcribe import ChunkResult, Segment


def test_format_timestamp():
    assert format_timestamp(0) == "00:00:00"
    assert format_timestamp(3_723_000) == "01:02:03"


def test_render_statement_log_includes_timestamps():
    results = [
        ChunkResult(
            index=0,
            start_offset_ms=0,
            segments=[Segment(start_ms=1000, end_ms=2000, text="こんにちは")],
        )
    ]

    log = render_statement_log(results)

    assert "[00:00:01] こんにちは" in log


def test_render_statement_log_marks_failed_chunk():
    results = [ChunkResult(index=0, start_offset_ms=60_000, segments=[], error="timeout")]

    log = render_statement_log(results)

    assert "文字起こし失敗" in log
    assert "00:01:00" in log


def test_render_statement_log_empty_returns_placeholder():
    assert render_statement_log([]) == "(発言ログなし)"


def test_render_minutes_handles_empty_todos_and_decisions():
    extraction = {"summary": "概要です", "decisions": [], "todos": []}

    md = render_minutes(extraction, "(発言ログなし)")

    assert "概要です" in md
    assert md.count("- (なし)") == 2


def test_render_minutes_formats_todo_with_owner_and_due():
    extraction = {
        "summary": "概要",
        "decisions": ["予算を承認した"],
        "todos": [{"task": "資料作成", "owner": "田中", "due": "来週金曜"}],
    }

    md = render_minutes(extraction, "(発言ログなし)")

    assert "- 予算を承認した" in md
    assert "資料作成(担当: 田中 / 期限: 来週金曜)" in md


def test_render_minutes_todo_missing_owner_and_due_shows_placeholder():
    extraction = {
        "summary": "概要",
        "decisions": [],
        "todos": [{"task": "議事録確認", "owner": None, "due": None}],
    }

    md = render_minutes(extraction, "(発言ログなし)")

    assert "議事録確認(担当: 未定 / 期限: 未定)" in md
