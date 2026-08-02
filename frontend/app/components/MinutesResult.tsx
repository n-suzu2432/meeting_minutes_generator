"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { GenerateMinutesResponse } from "@/lib/api";
import { buildMinutesDocxBlob } from "@/lib/docx-export";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadMarkdown(markdown: string) {
  downloadBlob(new Blob([markdown], { type: "text/markdown" }), "minutes.md");
}

export function MinutesResult({ result }: { result: GenerateMinutesResponse }) {
  const [isBuildingDocx, setIsBuildingDocx] = useState(false);

  async function handleDownloadDocx() {
    setIsBuildingDocx(true);
    try {
      const blob = await buildMinutesDocxBlob(result);
      downloadBlob(blob, "minutes.docx");
    } finally {
      setIsBuildingDocx(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-800">議事録</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => downloadMarkdown(result.markdown)}
            className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Markdownでダウンロード
          </button>
          <button
            type="button"
            onClick={handleDownloadDocx}
            disabled={isBuildingDocx}
            className="rounded-md border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {isBuildingDocx ? "作成中..." : "Wordでダウンロード"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span>Whisper概算コスト: ${result.whisper_cost_estimate_usd.toFixed(3)}</span>
        <span>Claude概算コスト: ${result.claude_cost_estimate_usd.toFixed(4)}</span>
        {result.failed_chunk_count > 0 && (
          <span className="font-medium text-red-600">
            {result.failed_chunk_count}個のチャンクで文字起こしに失敗しました
          </span>
        )}
      </div>

      {result.replaced_terms.length > 0 && (
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <p className="font-medium text-slate-700">辞書による置換結果</p>
          <ul className="mt-1 space-y-0.5 text-slate-600">
            {result.replaced_terms.map((term) => (
              <li key={term.誤}>
                {term.誤} → {term.正}({term.件数}件)
              </li>
            ))}
          </ul>
        </div>
      )}

      <article className="prose prose-sm prose-slate max-w-none prose-headings:font-semibold">
        <ReactMarkdown>{result.markdown}</ReactMarkdown>
      </article>
    </div>
  );
}
