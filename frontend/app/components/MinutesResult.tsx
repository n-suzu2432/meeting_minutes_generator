"use client";

import { useState } from "react";
import {
  AlertIcon,
  CheckIcon,
  ChevronIcon,
  CopyIcon,
  DownloadIcon,
} from "@/app/components/icons";
import type { GenerateMinutesResponse } from "@/lib/api";
import { buildMinutesDocxBlob } from "@/lib/docx-export";

type LogLine = { time: string | null; text: string; failed: boolean };

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// バックエンドは発言ログを「- [HH:MM:SS] 本文」のMarkdown箇条書きで返す。
// 文字起こしに失敗した区間だけ「- **[HH:MM:SS] ⚠️ 文字起こし失敗:** 理由」の形になる。
function parseStatementLog(markdown: string): LogLine[] {
  return markdown
    .split("\n")
    .map((line) => line.replace(/^-\s*/, "").trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const failed = line.startsWith("**[");
      const cleaned = line.replace(/\*\*/g, "");
      const match = cleaned.match(/^\[(\d{2}:\d{2}:\d{2})\]\s*(.*)$/);
      return match
        ? { time: match[1], text: match[2], failed }
        : { time: null, text: cleaned, failed };
    });
}

type Props = {
  result: GenerateMinutesResponse;
  fileName: string;
  onRestart: () => void;
};

export function MinutesResult({ result, fileName, onRestart }: Props) {
  const [isBuildingDocx, setIsBuildingDocx] = useState(false);
  const [copied, setCopied] = useState(false);
  const { minutes } = result;
  const logLines = parseStatementLog(result.statement_log_markdown);
  const baseName = fileName.replace(/\.[^.]+$/, "") || "minutes";

  async function handleDownloadDocx() {
    setIsBuildingDocx(true);
    try {
      const blob = await buildMinutesDocxBlob(result);
      downloadBlob(blob, `${baseName}_議事録.docx`);
    } finally {
      setIsBuildingDocx(false);
    }
  }

  function handleDownloadMarkdown() {
    downloadBlob(new Blob([result.markdown], { type: "text/markdown" }), `${baseName}_議事録.md`);
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(result.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-black sm:text-3xl">
            <span className="marker marker-draw">議事録ができました</span>
          </h1>
          <p className="mt-2 truncate text-sm text-ink-soft" title={fileName}>
            {fileName}
          </p>
        </div>
        <button
          type="button"
          onClick={onRestart}
          className="rounded-full border-2 border-line-strong px-4 py-2 text-sm font-bold text-ink-soft hover:border-ink hover:text-ink"
        >
          別の会議の議事録を作る
        </button>
      </header>

      <div className="flex flex-wrap gap-3 rounded-sheet bg-ink p-4 sm:items-center sm:p-5">
        <p className="w-full text-sm font-bold text-white sm:w-auto sm:flex-1">
          保存して、チームに共有しましょう
        </p>
        <button
          type="button"
          onClick={handleDownloadDocx}
          disabled={isBuildingDocx}
          className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-marker px-5 py-2.5 text-sm font-bold text-ink hover:bg-white disabled:opacity-60 sm:flex-none"
        >
          <DownloadIcon className="size-4" />
          {isBuildingDocx ? "Wordを準備中…" : "Wordで保存"}
        </button>
        <button
          type="button"
          onClick={handleDownloadMarkdown}
          className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full border-2 border-white/40 px-5 py-2.5 text-sm font-bold text-white hover:border-white sm:flex-none"
        >
          <DownloadIcon className="size-4" />
          Markdownで保存
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full border-2 border-white/40 px-5 py-2.5 text-sm font-bold text-white hover:border-white sm:flex-none"
        >
          {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
          <span aria-live="polite">{copied ? "コピーしました" : "全文をコピー"}</span>
        </button>
      </div>

      {result.failed_chunk_count > 0 && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-alert-soft px-4 py-3 text-sm font-medium text-alert"
        >
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          <span>
            音声の一部({result.failed_chunk_count}区間)を文字に起こせませんでした。
            その部分は議事録に含まれていません。発言ログで該当の時間を確認できます。
          </span>
        </p>
      )}

      <article className="rounded-sheet bg-paper shadow-sheet">
        <section className="border-b border-line p-6 sm:p-8">
          <h2 className="text-lg font-black">会議の要約</h2>
          <p className="mt-3 max-w-[40em] leading-8 text-ink">{minutes.summary}</p>
        </section>

        <section className="border-b border-line p-6 sm:p-8">
          <h2 className="flex items-baseline gap-2 text-lg font-black">
            決定事項
            <span className="text-sm font-medium text-ink-faint tabular-nums">
              {minutes.decisions.length}件
            </span>
          </h2>
          {minutes.decisions.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {minutes.decisions.map((decision, idx) => (
                <li key={idx} className="flex gap-3 leading-7">
                  <CheckIcon className="mt-1.5 size-4 shrink-0 text-ink" />
                  <span className="max-w-[40em]">
                    <span className="marker font-medium">{decision}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-ink-faint">
              この会議では、はっきり決まった事項は見つかりませんでした。
            </p>
          )}
        </section>

        <section className="p-6 sm:p-8">
          <h2 className="flex items-baseline gap-2 text-lg font-black">
            やること(TODO)
            <span className="text-sm font-medium text-ink-faint tabular-nums">
              {minutes.todos.length}件
            </span>
          </h2>
          {minutes.todos.length > 0 ? (
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {minutes.todos.map((todo, idx) => (
                <li
                  key={idx}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="flex flex-1 gap-3">
                    <span
                      aria-hidden
                      className="mt-1 size-4 shrink-0 rounded border-2 border-ink"
                    />
                    <span className="leading-7">{todo.task}</span>
                  </div>
                  <dl className="flex shrink-0 gap-2 pl-7 text-sm sm:pl-0">
                    <div className="flex items-center gap-1.5 rounded-full bg-desk px-3 py-1">
                      <dt className="text-ink-faint">担当</dt>
                      <dd className={todo.owner ? "font-bold" : "text-ink-faint"}>
                        {todo.owner ?? "未定"}
                      </dd>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-full bg-desk px-3 py-1">
                      <dt className="text-ink-faint">期限</dt>
                      <dd className={todo.due ? "font-bold" : "text-ink-faint"}>
                        {todo.due ?? "未定"}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-ink-faint">
              この会議では、やることは見つかりませんでした。
            </p>
          )}
        </section>
      </article>

      <details className="group rounded-sheet bg-paper shadow-sheet">
        <summary className="flex cursor-pointer list-none items-center gap-3 p-5 font-bold sm:px-8 [&::-webkit-details-marker]:hidden">
          <ChevronIcon className="size-5 shrink-0 transition-transform group-open:rotate-90" />
          発言ログを見る
          <span className="text-sm font-medium text-ink-faint">
            時刻つきの文字起こし全文({logLines.length}行)
          </span>
        </summary>
        <ol className="max-h-[32rem] space-y-2 overflow-y-auto border-t border-line px-5 py-5 text-sm sm:px-8">
          {logLines.map((line, idx) => (
            <li key={idx} className={`flex gap-4 ${line.failed ? "text-alert" : ""}`}>
              <span className="w-16 shrink-0 pt-0.5 text-xs text-ink-faint tabular-nums">
                {line.time ?? ""}
              </span>
              <span className="leading-6">{line.text}</span>
            </li>
          ))}
        </ol>
      </details>

      {result.replaced_terms.length > 0 && (
        <section className="rounded-sheet border border-line bg-paper p-5 text-sm sm:px-8">
          <h2 className="font-bold">登録した表記に直した箇所</h2>
          <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-ink-soft">
            {result.replaced_terms.map((term) => (
              <li key={term.誤}>
                {term.誤} → <span className="font-bold text-ink">{term.正}</span>
                <span className="tabular-nums">({term.件数}件)</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-ink-faint tabular-nums">
        今回の概算コスト: 文字起こし ${result.whisper_cost_estimate_usd.toFixed(3)} / 要点の抽出 $
        {result.claude_cost_estimate_usd.toFixed(4)}
      </p>
    </div>
  );
}
