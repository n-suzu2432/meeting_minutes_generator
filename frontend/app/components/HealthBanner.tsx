"use client";

import { AlertIcon } from "@/app/components/icons";
import type { HealthStatus } from "@/lib/api";

export function HealthBanner({ health }: { health: HealthStatus | null }) {
  if (!health) return null;

  const problems: string[] = [];
  if (!health.openai_configured) problems.push("OPENAI_API_KEY が未設定です");
  if (!health.anthropic_configured) problems.push("ANTHROPIC_API_KEY が未設定です");
  if (!health.ffmpeg_available) problems.push("ffmpeg が見つかりません");

  if (problems.length === 0) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl bg-alert-soft px-4 py-3 text-sm text-alert"
    >
      <AlertIcon className="mt-0.5 size-5 shrink-0" />
      <div>
        <p className="font-bold">
          サーバーの設定が終わっていないため、まだ議事録を作れません。
        </p>
        <p className="mt-1">管理者の方は次の項目を確認してください。</p>
        <ul className="mt-1 list-disc pl-5">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
