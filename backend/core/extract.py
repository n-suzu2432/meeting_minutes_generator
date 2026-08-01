"""Claude APIによる議事録の構造化抽出(決定事項/TODO/要約)。

発言の逐語ログはWhisperのセグメントからコード側で機械生成するため、
ここではClaudeに「決定事項/TODO/要約」の抽出のみを行わせる
(全発言をClaudeに再生成させるとトークン増大・タイムスタンプ誤生成のリスクがあるため)。
"""
from __future__ import annotations

import json
from dataclasses import dataclass

import anthropic

import config

EXTRACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string", "description": "会議全体の要約(3〜5文程度)"},
        "decisions": {
            "type": "array",
            "items": {"type": "string"},
            "description": "決定事項のリスト",
        },
        "todos": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "task": {"type": "string"},
                    "owner": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                    "due": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                },
                "required": ["task", "owner", "due"],
                "additionalProperties": False,
            },
            "description": "TODO/アクションアイテムのリスト",
        },
    },
    "required": ["summary", "decisions", "todos"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = """あなたは会議の文字起こしから議事録の要点を抽出するアシスタントです。
以下は会議の文字起こしです。発言の逐語的な書き起こしは別途用意されるため不要です。次の3点だけを抽出してください。
- summary: 会議全体の要約(3〜5文程度)
- decisions: 決定事項のリスト。決定事項がなければ空配列にする
- todos: TODO/アクションアイテムのリスト。担当者・期限が文中に明記されていればowner/dueに記載し、不明ならnullにする
"""


class ExtractionError(RuntimeError):
    """Claude APIによる抽出に失敗した場合の例外。"""


@dataclass
class ExtractionResult:
    data: dict
    input_tokens: int
    output_tokens: int


def extract_minutes(transcript: str, api_key: str) -> ExtractionResult:
    """文字起こしテキストから決定事項/TODO/要約を構造化抽出する。"""
    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model=config.CLAUDE_MODEL,
        max_tokens=8000,
        system=SYSTEM_PROMPT,
        thinking={"type": "disabled"},
        output_config={"format": {"type": "json_schema", "schema": EXTRACTION_SCHEMA}},
        messages=[{"role": "user", "content": f"文字起こし:\n{transcript}"}],
    )

    if response.stop_reason == "refusal":
        raise ExtractionError("Claudeが安全性の理由で応答を拒否しました。")

    text_block = next((b.text for b in response.content if b.type == "text"), None)
    if text_block is None:
        raise ExtractionError("Claudeから構造化テキストが返されませんでした。")

    return ExtractionResult(
        data=json.loads(text_block),
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
    )
