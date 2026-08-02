"""音声の長さから各段階の目安所要時間を見積もり、経過時間ベースの全体進捗(%)を計算する。

各段階の所要時間は実測データではなく音声の長さからの目安(config.pyの比率)。
音声分割・Claude抽出は実測値がないためヒートビート中の経過時間から進捗を補間し、
文字起こしはチャンク完了数という実測値をそのまま使う。
"""
from __future__ import annotations

from dataclasses import dataclass

import config

STAGE_KEYS = ["splitting", "transcribing", "dictionary", "extracting", "formatting"]


def _estimate_stage_seconds(key: str, duration_seconds: float) -> float:
    if key == "splitting":
        return max(config.MIN_STAGE_ESTIMATE_SECONDS, duration_seconds * config.SPLIT_ESTIMATE_RATIO)
    if key == "transcribing":
        return max(config.MIN_STAGE_ESTIMATE_SECONDS, duration_seconds * config.TRANSCRIBE_ESTIMATE_RATIO)
    if key == "dictionary":
        return config.DICTIONARY_ESTIMATE_SECONDS
    if key == "extracting":
        return config.EXTRACT_ESTIMATE_BASE_SECONDS + duration_seconds * config.EXTRACT_ESTIMATE_RATIO
    if key == "formatting":
        return config.FORMAT_ESTIMATE_SECONDS
    raise ValueError(f"unknown stage: {key}")


@dataclass
class _StageEstimate:
    estimated_seconds: float
    cumulative_before: float


class ProgressEstimator:
    """音声の長さ(duration_seconds)を基準に、各段階の目安所要時間を事前計算するクラス。"""

    def __init__(self, duration_seconds: float):
        self._stages: dict[str, _StageEstimate] = {}
        cumulative = 0.0
        for key in STAGE_KEYS:
            seconds = _estimate_stage_seconds(key, duration_seconds)
            self._stages[key] = _StageEstimate(estimated_seconds=seconds, cumulative_before=cumulative)
            cumulative += seconds
        self.total_estimated_seconds = cumulative

    def stage_seconds(self, stage: str) -> float:
        return self._stages[stage].estimated_seconds

    def overall_percent(self, stage: str, stage_fraction: float) -> int:
        """指定ステージ内の進捗割合(0〜1)を、全体に対する経過時間ベースの%に変換する。"""
        est = self._stages[stage]
        stage_fraction = min(max(stage_fraction, 0.0), 1.0)
        elapsed_estimate = est.cumulative_before + est.estimated_seconds * stage_fraction
        if self.total_estimated_seconds <= 0:
            return 1
        pct = 100 * elapsed_estimate / self.total_estimated_seconds
        return min(99, max(1, round(pct)))

    def step_number(self, stage: str) -> int:
        if stage not in STAGE_KEYS:
            return len(STAGE_KEYS)
        return STAGE_KEYS.index(stage) + 1

    @property
    def total_steps(self) -> int:
        return len(STAGE_KEYS)
