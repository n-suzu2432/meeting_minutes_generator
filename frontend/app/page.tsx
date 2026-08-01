"use client";

import { useEffect, useState } from "react";
import { DictionaryEditor } from "@/app/components/DictionaryEditor";
import { HealthBanner } from "@/app/components/HealthBanner";
import { MinutesResult } from "@/app/components/MinutesResult";
import { UploadForm } from "@/app/components/UploadForm";
import {
  fetchDictionary,
  fetchHealth,
  type DictionaryEntry,
  type GenerateMinutesResponse,
  type HealthStatus,
} from "@/lib/api";

export default function Home() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [dictionaryEntries, setDictionaryEntries] = useState<DictionaryEntry[]>([]);
  const [result, setResult] = useState<GenerateMinutesResponse | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchHealth(), fetchDictionary()])
      .then(([healthStatus, entries]) => {
        setHealth(healthStatus);
        setDictionaryEntries(entries);
      })
      .catch((err) => {
        setInitError(
          err instanceof Error
            ? `バックエンドに接続できませんでした: ${err.message}`
            : "バックエンドに接続できませんでした。"
        );
      });
  }, []);

  const isReady =
    health !== null &&
    health.openai_configured &&
    health.anthropic_configured &&
    health.ffmpeg_available;

  return (
    <div className="flex min-h-full flex-1 justify-center bg-slate-50">
      <main className="flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">自動議事録ツール</h1>
          <p className="mt-1 text-sm text-slate-500">
            Whisper APIで文字起こしし、Claudeで決定事項・TODOを構造化抽出します。
            機密情報は入力しないでください。
          </p>
        </header>

        {initError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {initError}
          </div>
        )}

        <HealthBanner health={health} />

        <DictionaryEditor initialEntries={dictionaryEntries} />

        <UploadForm disabled={!isReady} onResult={setResult} />

        {result && <MinutesResult result={result} />}
      </main>
    </div>
  );
}
