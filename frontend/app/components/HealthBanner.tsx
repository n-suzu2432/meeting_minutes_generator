"use client";

import type { HealthStatus } from "@/lib/api";

export function HealthBanner({ health }: { health: HealthStatus | null }) {
  if (!health) return null;

  const problems: string[] = [];
  if (!health.openai_configured) problems.push("OPENAI_API_KEY が未設定です");
  if (!health.anthropic_configured) problems.push("ANTHROPIC_API_KEY が未設定です");
  if (!health.ffmpeg_available) problems.push("ffmpeg が見つかりません");

  if (problems.length === 0) return null;

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <p className="font-medium">バックエンドの設定を確認してください:</p>
      <ul className="mt-1 list-disc pl-5">
        {problems.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>
    </div>
  );
}
