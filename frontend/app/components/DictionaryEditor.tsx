"use client";

import { useState } from "react";
import { saveDictionary, type DictionaryEntry } from "@/lib/api";

type Props = {
  initialEntries: DictionaryEntry[];
};

export function DictionaryEditor({ initialEntries }: Props) {
  const [entries, setEntries] = useState<DictionaryEntry[]>(
    initialEntries.length > 0 ? initialEntries : [{ wrong: "", correct: "" }]
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function updateEntry(index: number, field: keyof DictionaryEntry, value: string) {
    setEntries((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry))
    );
  }

  function addRow() {
    setEntries((prev) => [...prev, { wrong: "", correct: "" }]);
  }

  function removeRow(index: number) {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const cleaned = entries.filter((entry) => entry.wrong.trim().length > 0);
      const saved = await saveDictionary(cleaned);
      setEntries(saved.length > 0 ? saved : [{ wrong: "", correct: "" }]);
      setMessage("辞書を保存しました。");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm open:shadow-md">
      <summary className="cursor-pointer list-none font-medium text-slate-800">
        <span className="mr-2 inline-block transition-transform group-open:rotate-90">
          ▶
        </span>
        誤字置換辞書(社名・商品名)
      </summary>
      <p className="mt-2 text-sm text-slate-500">
        文字起こし結果に含まれる誤表記を、正しい表記に一括置換します。
      </p>

      <div className="mt-4 space-y-2">
        {entries.map((entry, index) => (
          <div key={index} className="flex gap-2">
            <input
              className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
              placeholder="誤(文字起こしの表記)"
              value={entry.wrong}
              onChange={(e) => updateEntry(index, "wrong", e.target.value)}
            />
            <input
              className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
              placeholder="正(正しい表記)"
              value={entry.correct}
              onChange={(e) => updateEntry(index, "correct", e.target.value)}
            />
            <button
              type="button"
              onClick={() => removeRow(index)}
              className="rounded-md px-2 text-sm text-slate-400 hover:text-red-600"
              aria-label="この行を削除"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={addRow}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          + 行を追加
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? "保存中..." : "辞書を保存"}
        </button>
        {message && <span className="text-sm text-slate-500">{message}</span>}
      </div>
    </details>
  );
}
