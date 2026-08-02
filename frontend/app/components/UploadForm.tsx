"use client";

import { useRef, useState } from "react";
import { generateMinutes, type GenerateMinutesResponse } from "@/lib/api";

const ACCEPTED_EXTENSIONS = [".mp3", ".mp4", ".wav", ".m4a", ".webm"];

type Props = {
  disabled?: boolean;
  onResult: (result: GenerateMinutesResponse) => void;
};

function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export function UploadForm({ disabled, onResult }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit() {
    if (!file) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await generateMinutes(file);
      onResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "議事録の生成に失敗しました。");
    } finally {
      setIsLoading(false);
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

      {isLoading && (
        <p className="mt-3 text-sm text-slate-500">
          音声分割 → 並列文字起こし → 構造化抽出の順に処理しています。1時間程度の音声でも数分かかる場合があります。
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
