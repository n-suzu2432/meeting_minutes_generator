"use client";

import { useEffect, useRef, useState } from "react";
import { AlertIcon, AudioFileIcon, UploadIcon } from "@/app/components/icons";

const ACCEPTED_EXTENSIONS = [".mp3", ".mp4", ".wav", ".m4a", ".webm"];
const ACCEPTED_LABEL = ACCEPTED_EXTENSIONS.map((ext) => ext.slice(1)).join(" / ");

type Props = {
  file: File | null;
  disabled?: boolean;
  error: string | null;
  onFileChange: (file: File | null) => void;
  onError: (message: string | null) => void;
  onSubmit: () => void;
};

function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadForm({ file, disabled, error, onFileChange, onError, onSubmit }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function acceptFile(candidate: File) {
    if (!isAcceptedFile(candidate)) {
      onError(`この形式は使えません。${ACCEPTED_LABEL} のいずれかを選んでください。`);
      return;
    }
    onError(null);
    onFileChange(candidate);
  }

  // ページ内のどこにドロップしても受け付けられるよう、window全体でドラッグ&ドロップを処理する。
  // preventDefaultしないとブラウザがファイルを別タブで開こうとしてしまう。
  useEffect(() => {
    function handleWindowDragOver(e: DragEvent) {
      e.preventDefault();
      if (disabled) return;
      setIsDragging(true);
    }
    function handleWindowDragLeave(e: DragEvent) {
      if (!e.relatedTarget) setIsDragging(false);
    }
    function handleWindowDrop(e: DragEvent) {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      const dropped = e.dataTransfer?.files?.[0];
      if (!dropped) return;
      acceptFile(dropped);
    }

    window.addEventListener("dragover", handleWindowDragOver);
    window.addEventListener("dragleave", handleWindowDragLeave);
    window.addEventListener("drop", handleWindowDrop);
    return () => {
      window.removeEventListener("dragover", handleWindowDragOver);
      window.removeEventListener("dragleave", handleWindowDragLeave);
      window.removeEventListener("drop", handleWindowDrop);
    };
    // acceptFileは毎レンダーで作り直されるが、参照するpropsはdisabledと同じタイミングでしか変わらない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  function openPicker() {
    if (!disabled) inputRef.current?.click();
  }

  return (
    <section aria-labelledby="upload-heading">
      {isDragging && !disabled && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-ink/85 p-6">
          <div className="flex flex-col items-center gap-4 rounded-sheet border-4 border-dashed border-marker px-10 py-12 text-center text-white">
            <UploadIcon className="size-12 text-marker" />
            <p className="text-2xl font-bold">ここで離すと、このファイルを使います</p>
          </div>
        </div>
      )}

      <h2 id="upload-heading" className="sr-only">
        ファイルを選ぶ
      </h2>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(",")}
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) acceptFile(picked);
          // 同じファイルを選び直してもchangeが発火するようにする
          e.target.value = "";
        }}
        disabled={disabled}
        className="hidden"
      />

      {file ? (
        <div className="flex flex-wrap items-center gap-4 rounded-sheet border-2 border-ink bg-paper p-5 sm:p-6">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-marker text-ink">
            <AudioFileIcon className="size-7" />
          </span>
          <div className="min-w-0 flex-1 basis-48">
            <p className="text-sm text-ink-soft">このファイルから議事録を作ります</p>
            <p className="mt-0.5 truncate text-lg font-bold" title={file.name}>
              {file.name}
            </p>
            <p className="text-sm text-ink-faint tabular-nums">{formatFileSize(file.size)}</p>
          </div>
          <button
            type="button"
            onClick={openPicker}
            disabled={disabled}
            className="w-full rounded-full border-2 border-line-strong px-4 py-2 text-sm font-bold text-ink-soft hover:border-ink hover:text-ink disabled:opacity-50 sm:w-auto"
          >
            別のファイルにする
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={openPicker}
          disabled={disabled}
          className="group flex min-h-60 w-full flex-col items-center justify-center gap-3 rounded-sheet border-2 border-dashed border-line-strong bg-paper px-6 py-10 text-center transition-colors hover:border-ink hover:bg-marker-soft disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-line-strong disabled:hover:bg-paper"
        >
          <span className="flex size-16 items-center justify-center rounded-full bg-desk text-ink transition-colors group-hover:bg-marker group-disabled:bg-desk">
            <UploadIcon className="size-8" />
          </span>
          <span className="text-xl font-bold">
            <span className="inline-block">会議の録音・録画ファイルを、</span>
            <span className="inline-block">ここにドロップ</span>
          </span>
          <span className="rounded-full bg-ink px-5 py-2 text-sm font-bold text-white">
            パソコンから選ぶ
          </span>
          <span className="text-sm text-ink-faint">使える形式: {ACCEPTED_LABEL}</span>
        </button>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-xl bg-alert-soft px-4 py-3 text-sm font-medium text-alert"
        >
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      <div className="mt-6 flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || !file}
          className="w-full rounded-full bg-ink px-8 py-4 text-lg font-bold text-white shadow-sheet transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-line-strong disabled:shadow-none sm:w-auto sm:min-w-80"
        >
          議事録を作成する
        </button>
        <p className="text-sm text-ink-faint">
          {file
            ? "1時間の録音で、数分ほどかかります。"
            : "ファイルを選ぶと、ボタンが押せるようになります。"}
        </p>
      </div>
    </section>
  );
}
