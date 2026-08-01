"""誤字置換辞書(社名・商品名)の読み込み・保存・適用。"""
from __future__ import annotations

import json
import re
from pathlib import Path

import config

DictEntry = dict[str, str]


def load_dictionary(path: Path | None = None) -> list[DictEntry]:
    """辞書ファイルを読み込む。存在しない場合は空リストを返す。"""
    if path is None:
        path = config.DICTIONARY_PATH
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def save_dictionary(entries: list[DictEntry], path: Path | None = None) -> None:
    """辞書ファイルを保存する。"""
    if path is None:
        path = config.DICTIONARY_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")


def apply_dictionary(text: str, entries: list[DictEntry]) -> tuple[str, list[dict]]:
    """誤字を辞書に基づいて置換する。

    日本語は単語境界がないため正規表現の\\bは使えない。また、逐次
    str.replace()で長い語から順に処理しても、ある置換の「置換後」の文字列が
    別ルールの「誤」に偶然一致すると二重置換されてしまう
    (例: "AIツール"→"AI Tool" の後に "AI"→"人工知能" を適用すると
    "AI Tool" 内の "AI" まで置換されてしまう)。
    これを避けるため、全ルールを1つの正規表現(長い語を優先する交互パターン)に
    まとめ、元のテキストに対して1回のパスで置換する。

    戻り値は (置換後テキスト, 置換件数レポート)。
    """
    valid_entries = [e for e in entries if e.get("wrong")]
    if not valid_entries:
        return text, []

    # 交互パターンは記述順を優先して最初にマッチした選択肢を採用するため、
    # 長い語を先に並べることで短い語による部分マッチを防ぐ。
    sorted_entries = sorted(valid_entries, key=lambda e: len(e["wrong"]), reverse=True)
    mapping = {e["wrong"]: e.get("correct", "") for e in sorted_entries}
    pattern = re.compile("|".join(re.escape(e["wrong"]) for e in sorted_entries))

    counts: dict[str, int] = {}

    def _replace(match: re.Match[str]) -> str:
        wrong = match.group(0)
        counts[wrong] = counts.get(wrong, 0) + 1
        return mapping[wrong]

    result = pattern.sub(_replace, text)

    report = [
        {"誤": e["wrong"], "正": e.get("correct", ""), "件数": counts[e["wrong"]]}
        for e in sorted_entries
        if e["wrong"] in counts
    ]
    return result, report
