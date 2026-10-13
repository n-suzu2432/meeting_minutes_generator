"use client";

import { useState } from "react";
import { ChevronIcon, CloseIcon, PlusIcon } from "@/app/components/icons";
import { saveDictionary, type DictionaryEntry } from "@/lib/api";

type Props = {
  initialEntries: DictionaryEntry[];
  onSaved?: (entries: DictionaryEntry[]) => void;
};

export function DictionaryEditor({ initialEntries, onSaved }: Props) {
  const initialRows = initialEntries.length > 0 ? initialEntries : [{ wrong: "", correct: "" }];
  const [entries, setEntries] = useState<DictionaryEntry[]>(initialRows);
  const [lastSavedEntries, setLastSavedEntries] = useState<DictionaryEntry[]>(initialRows);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const isDirty = JSON.stringify(entries) !== JSON.stringify(lastSavedEntries);
  const savedCount = lastSavedEntries.filter((entry) => entry.wrong.trim().length > 0).length;

  function updateEntry(index: number, field: keyof DictionaryEntry, value: string) {
    setMessage(null);
    setEntries((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry))
    );
  }

  function addRow() {
    setMessage(null);
    setEntries((prev) => [...prev, { wrong: "", correct: "" }]);
  }

  function removeRow(index: number) {
    setMessage(null);
    setEntries((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const cleaned = entries.filter((entry) => entry.wrong.trim().length > 0);
      const saved = await saveDictionary(cleaned);
      const savedRows = saved.length > 0 ? saved : [{ wrong: "", correct: "" }];
      setEntries(savedRows);
      setLastSavedEntries(savedRows);
      onSaved?.(saved);
      setMessage({ kind: "ok", text: "保存しました。次に作る議事録から反映されます。" });
    } catch (err) {
      setMessage({
        kind: "error",
        text: err instanceof Error ? err.message : "保存できませんでした。もう一度お試しください。",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="group rounded-sheet border border-line bg-paper">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 p-5 sm:px-6 [&::-webkit-details-marker]:hidden">
        <ChevronIcon className="size-5 shrink-0 transition-transform group-open:rotate-90" />
        <span className="font-bold">社名や商品名を正しい表記にする</span>
        <span className="rounded-full bg-desk px-2.5 py-0.5 text-xs font-medium text-ink-soft">
          任意
        </span>
        {isDirty ? (
          <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-bold text-warn">
            まだ保存していません
          </span>
        ) : (
          savedCount > 0 && (
            <span className="text-sm text-ink-faint tabular-nums">{savedCount}件 登録済み</span>
          )
        )}
      </summary>

      <div className="border-t border-line p-5 sm:px-6">
        <p className="max-w-[40em] text-sm leading-6 text-ink-soft">
          聞き間違えられやすい言葉を登録しておくと、議事録の中で自動的に直します。
          <span className="block">例:「ケーピーアイ」→「KPI」</span>
        </p>

        <div className="mt-4 space-y-2">
          <div aria-hidden className="hidden gap-2 text-xs font-bold text-ink-faint sm:flex">
            <span className="flex-1">間違って書かれる表記</span>
            <span className="w-5" />
            <span className="flex-1">正しい表記</span>
            <span className="w-9" />
          </div>
          {entries.map((entry, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                className="min-w-0 flex-1 rounded-lg border-2 border-line bg-paper px-3 py-2 text-sm placeholder:text-ink-faint focus:border-ink focus:outline-none"
                placeholder="例: ケーピーアイ"
                aria-label={`${index + 1}行目: 間違って書かれる表記`}
                value={entry.wrong}
                onChange={(e) => updateEntry(index, "wrong", e.target.value)}
              />
              <span aria-hidden className="w-5 text-center text-ink-faint">
                →
              </span>
              <input
                className="min-w-0 flex-1 rounded-lg border-2 border-line bg-paper px-3 py-2 text-sm placeholder:text-ink-faint focus:border-ink focus:outline-none"
                placeholder="例: KPI"
                aria-label={`${index + 1}行目: 正しい表記`}
                value={entry.correct}
                onChange={(e) => updateEntry(index, "correct", e.target.value)}
              />
              <button
                type="button"
                onClick={() => removeRow(index)}
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-faint hover:bg-alert-soft hover:text-alert"
                aria-label={`${index + 1}行目を削除`}
              >
                <CloseIcon className="size-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-1.5 rounded-full border-2 border-line-strong px-4 py-2 text-sm font-bold text-ink-soft hover:border-ink hover:text-ink"
          >
            <PlusIcon className="size-4" />
            行を追加
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="rounded-full bg-ink px-5 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-line-strong"
          >
            {saving ? "保存中…" : "表記を保存"}
          </button>
          <span aria-live="polite" className="text-sm">
            {message ? (
              <span className={message.kind === "ok" ? "text-ok" : "text-alert"}>
                {message.text}
              </span>
            ) : (
              isDirty && (
                <span className="text-warn">「表記を保存」を押すまで反映されません。</span>
              )
            )}
          </span>
        </div>
      </div>
    </details>
  );
}
