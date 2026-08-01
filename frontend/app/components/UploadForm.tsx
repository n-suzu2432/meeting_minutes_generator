"use client";

import { useRef, useState } from "react";
import { generateMinutes, type GenerateMinutesResponse } from "@/lib/api";

const ACCEPTED_EXTENSIONS = [".mp3", ".mp4", ".wav", ".m4a", ".webm"];

type Props = {
  disabled?: boolean;
  onResult: (result: GenerateMinutesResponse) => void;
};

export function UploadForm({ disabled, onResult }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-800">
        音声/動画ファイルをアップロード
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        対応形式: {ACCEPTED_EXTENSIONS.join(", ")}
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(",")}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={disabled || isLoading}
          className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
        />
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
