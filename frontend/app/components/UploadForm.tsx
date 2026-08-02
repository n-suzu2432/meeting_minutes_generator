"use client";

import { useRef, useState } from "react";
import {
  generateMinutes,
  type GenerateMinutesResponse,
  type MinutesProgressEvent,
  type MinutesProgressStage,
} from "@/lib/api";

const ACCEPTED_EXTENSIONS = [".mp3", ".mp4", ".wav", ".m4a", ".webm"];

const STAGE_STEPS: { key: MinutesProgressStage; label: string }[] = [
  { key: "splitting", label: "音声分割" },
  { key: "transcribing", label: "文字起こし" },
  { key: "dictionary", label: "辞書置換" },
  { key: "extracting", label: "AI抽出" },
  { key: "formatting", label: "整形" },
];

type Props = {
  disabled?: boolean;
  onResult: (result: GenerateMinutesResponse) => void;
};

function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function stageIndex(stage: MinutesProgressStage): number {
  return STAGE_STEPS.findIndex((step) => step.key === stage);
}

export function UploadForm({ disabled, onResult }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState<MinutesProgressEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit() {
    if (!file) return;
    setIsLoading(true);
    setError(null);
    setProgress(null);
    try {
      const result = await generateMinutes(file, setProgress);
      onResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "議事録の生成に失敗しました。");
    } finally {
      setIsLoading(false);
      setProgress(null);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || isLoading) return;
    const dropped = e.dataTransfer.files?.[0];
    if (!dropped) return;
    if (!isAcceptedFile(dropped)) {
      setError(`対応していないファイル形式です。対応形式: ${ACCEPTED_EXTENSIONS.join(", ")}`);
      return;
    }
    setError(null);
    setFile(dropped);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-800">
        音声/動画ファイルをアップロード
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        対応形式: {ACCEPTED_EXTENSIONS.join(", ")}
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !isLoading) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
          isDragging
            ? "border-indigo-400 bg-indigo-50"
            : "border-slate-300 bg-slate-50 hover:bg-slate-100"
        } ${disabled || isLoading ? "cursor-not-allowed opacity-50" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(",")}
          onChange={(e) => {
            setError(null);
            setFile(e.target.files?.[0] ?? null);
          }}
          disabled={disabled || isLoading}
          className="hidden"
        />
        <p className="text-sm text-slate-600">
          {file ? (
            <span className="font-medium text-indigo-700">{file.name}</span>
          ) : (
            <>
              ここにファイルをドラッグ&ドロップ、または
              <span className="text-indigo-600 underline">クリックして選択</span>
            </>
          )}
        </p>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || isLoading || !file}
          className="shrink-0 rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "議事録を作成中..." : "議事録を作成する"}
        </button>
      </div>

      {isLoading && progress && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
            <span>{progress.message}</span>
            <span className="font-medium tabular-nums">{progress.progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-indigo-600 transition-all duration-300"
              style={{ width: `${progress.progress}%` }}
            />
          </div>
          <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {STAGE_STEPS.map((step) => {
              const currentIdx = stageIndex(progress.stage);
              const stepIdx = stageIndex(step.key);
              const state =
                stepIdx < currentIdx ? "done" : stepIdx === currentIdx ? "current" : "upcoming";
              return (
                <li
                  key={step.key}
                  className={
                    state === "current"
                      ? "font-semibold text-indigo-700"
                      : state === "done"
                        ? "text-emerald-600"
                        : "text-slate-400"
                  }
                >
                  {state === "done" ? "✓ " : ""}
                  {step.label}
                </li>
              );
            })}
          </ol>
          <p className="mt-2 text-xs text-slate-400">
            1時間程度の音声でも数分かかる場合があります。
          </p>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
