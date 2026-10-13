"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { CheckIcon } from "@/app/components/icons";
import type { MinutesProgressEvent, MinutesProgressStage } from "@/lib/api";

const STAGE_STEPS: { key: MinutesProgressStage; label: string }[] = [
  { key: "splitting", label: "音声を分ける" },
  { key: "transcribing", label: "文字に起こす" },
  { key: "dictionary", label: "表記を直す" },
  { key: "extracting", label: "要点をまとめる" },
  { key: "formatting", label: "議事録に整える" },
];

function stageIndex(stage: MinutesProgressStage): number {
  // 完了イベントでは全ステップをチェック済みのまま見せる
  if (stage === "done") return STAGE_STEPS.length;
  return STAGE_STEPS.findIndex((step) => step.key === stage);
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}分${s.toString().padStart(2, "0")}秒` : `${s}秒`;
}

type Props = {
  fileName: string;
  progress: MinutesProgressEvent | null;
};

export function ProgressView({ fileName, progress }: Props) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // 段階(stage)が切り替わってもタイマーが途切れないよう、バックエンドのイベント頻度に
  // 依存せずフロント側で1秒ごとに経過時間を刻む。
  useEffect(() => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const percent = progress?.progress ?? 0;
  // 最初の進捗イベントが届くまではファイルの送信中
  const currentIdx = progress ? stageIndex(progress.stage) : -1;
  const message = progress?.message ?? "ファイルを送っています…";

  return (
    <section
      aria-labelledby="progress-heading"
      className="rounded-sheet bg-paper p-6 shadow-sheet sm:p-10"
    >
      <div className="grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <Image
            src="/illustrations/working.webp"
            alt=""
            width={720}
            height={437}
            loading="eager"
            className="mx-auto w-full max-w-sm"
          />
        </div>

        <div>
          <h1 id="progress-heading" className="text-2xl font-black sm:text-3xl">
            <span className="marker">議事録を作っています</span>
          </h1>
          <p className="mt-2 truncate text-sm text-ink-soft" title={fileName}>
            {fileName}
          </p>

          <div className="mt-6 flex items-end justify-between gap-4">
            <p aria-live="polite" className="text-base font-bold">
              {message}
            </p>
            <p className="text-4xl leading-none font-black tabular-nums">
              {percent}
              <span className="text-lg">%</span>
            </p>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label="作成の進み具合"
            className="mt-3 h-3 w-full overflow-hidden rounded-full bg-desk"
          >
            <div
              className="h-full rounded-full bg-ink transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-ink-faint tabular-nums">
            {formatElapsed(elapsedSeconds)} 経過
            {progress?.step != null && progress.total_steps != null && (
              <>
                {" "}
                (ステップ {progress.step}/{progress.total_steps})
              </>
            )}
          </p>

          <ol className="mt-6 space-y-2">
            {STAGE_STEPS.map((step, idx) => {
              const state =
                idx < currentIdx ? "done" : idx === currentIdx ? "current" : "upcoming";
              return (
                <li key={step.key} className="flex items-center gap-3 text-sm">
                  <span
                    className={`flex size-6 shrink-0 items-center justify-center rounded-full ${
                      state === "done"
                        ? "bg-marker text-ink"
                        : state === "current"
                          ? "bg-ink"
                          : "border-2 border-line-strong"
                    }`}
                  >
                    {state === "done" && <CheckIcon className="size-3.5" />}
                    {state === "current" && (
                      <span className="size-2 animate-pulse rounded-full bg-marker" />
                    )}
                  </span>
                  <span
                    className={
                      state === "current"
                        ? "font-bold text-ink"
                        : state === "done"
                          ? "text-ink-soft"
                          : "text-ink-faint"
                    }
                  >
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <p className="mt-8 rounded-xl bg-desk px-4 py-3 text-center text-sm text-ink-soft">
        このページを開いたままお待ちください。閉じたり再読み込みしたりすると、作成が止まります。
      </p>
    </section>
  );
}
