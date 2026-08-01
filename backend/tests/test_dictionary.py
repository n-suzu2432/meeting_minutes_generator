from core.dictionary import apply_dictionary


def test_apply_dictionary_replaces_and_reports():
    entries = [{"wrong": "アンソロピック", "correct": "Anthropic"}]
    text = "今日はアンソロピックについて話します。アンソロピックは便利です。"

    result, report = apply_dictionary(text, entries)

    assert "Anthropic" in result
    assert "アンソロピック" not in result
    assert report == [{"誤": "アンソロピック", "正": "Anthropic", "件数": 2}]


def test_apply_dictionary_longest_first_avoids_nested_break():
    entries = [
        {"wrong": "AI", "correct": "人工知能"},
        {"wrong": "AIツール", "correct": "AI Tool"},
    ]

    result, _ = apply_dictionary("AIツールを使う", entries)

    assert result == "AI Toolを使う"


def test_apply_dictionary_no_match_returns_original_and_empty_report():
    result, report = apply_dictionary("テストです", [{"wrong": "存在しない語", "correct": "X"}])

    assert result == "テストです"
    assert report == []


def test_apply_dictionary_empty_entries():
    result, report = apply_dictionary("そのまま", [])

    assert result == "そのまま"
    assert report == []
