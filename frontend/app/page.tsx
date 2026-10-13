"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { DictionaryEditor } from "@/app/components/DictionaryEditor";
import { HealthBanner } from "@/app/components/HealthBanner";
import { AlertIcon } from "@/app/components/icons";
import { MinutesResult } from "@/app/components/MinutesResult";
import { ProgressView } from "@/app/components/ProgressView";
import { StepIndicator, type Phase } from "@/app/components/StepIndicator";
import { UploadForm } from "@/app/components/UploadForm";
import {
  fetchDictionary,
  fetchHealth,
  generateMinutes,
  type DictionaryEntry,
  type GenerateMinutesResponse,
  type HealthStatus,
  type MinutesProgressEvent,
} from "@/lib/api";

export default function Home() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  // nullは読み込み前。読み込み後にDictionaryEditorをマウントし、登録済みの内容を初期値にする
  const [dictionaryEntries, setDictionaryEntries] = useState<DictionaryEntry[] | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>("select");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<MinutesProgressEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateMinutesResponse | null>(null);

  useEffect(() => {
    Promise.all([fetchHealth(), fetchDictionary()])
      .then(([healthStatus, entries]) => {
        setHealth(healthStatus);
        setDictionaryEntries(entries);
      })
      .catch(() => {
        setInitError(
          "サーバーにつながりませんでした。少し待ってからページを再読み込みしてください。"
        );
      });
  }, []);

  // ファイル選択の画面以外(作成中・完成)でファイルを落とされても、ブラウザがそのファイルを
  // タブで開いて画面が消えないようにする。選択画面でのドロップ受付はUploadFormが担当する。
  useEffect(() => {
    function preventFileNavigation(e: DragEvent) {
      e.preventDefault();
    }
    window.addEventListener("dragover", preventFileNavigation);
    window.addEventListener("drop", preventFileNavigation);
    return () => {
      window.removeEventListener("dragover", preventFileNavigation);
      window.removeEventListener("drop", preventFileNavigation);
    };
  }, []);

  // 作成中にタブを閉じる・再読み込みすると処理が中断されるため、ブラウザの確認を出す
  useEffect(() => {
    if (phase !== "working") return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [phase]);

  const isReady =
    health !== null &&
    health.openai_configured &&
    health.anthropic_configured &&
    health.ffmpeg_available;

  async function handleSubmit() {
    if (!file) return;
    setPhase("working");
    setError(null);
    setProgress(null);
    window.scrollTo({ top: 0 });
    try {
      const generated = await generateMinutes(file, setProgress);
      setResult(generated);
      setPhase("done");
    } catch (err) {
      setError(
        err instanceof Error
          ? `議事録を作れませんでした: ${err.message}`
          : "議事録を作れませんでした。もう一度お試しください。"
      );
      setPhase("select");
    }
  }

  function handleRestart() {
    setFile(null);
    setResult(null);
    setError(null);
    setProgress(null);
    setPhase("select");
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
          <p className="text-lg font-black">
            <span className="marker">自動議事録</span>
          </p>
          <StepIndicator phase={phase} />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
        {phase === "select" && (
          <>
            <div className="grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
              <div>
                <h1 className="text-3xl leading-tight font-black sm:text-5xl sm:leading-tight">
                  会議の録音を、
                  <br />
                  <span className="marker marker-draw">そのまま議事録に。</span>
                </h1>
                <p className="mt-4 max-w-[28em] leading-7 text-ink-soft">
                  音声か動画のファイルを1つ選ぶだけ。要約・決定事項・やることを自動でまとめ、Wordでも保存できます。
                </p>
              </div>
              <Image
                src="/illustrations/hero.webp"
                alt=""
                width={1200}
                height={509}
                loading="eager"
                className="w-full mix-blend-multiply"
              />
            </div>

            {initError && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-xl bg-alert-soft px-4 py-3 text-sm font-medium text-alert"
              >
                <AlertIcon className="mt-0.5 size-4 shrink-0" />
                <span>{initError}</span>
              </p>
            )}

            <HealthBanner health={health} />

            <UploadForm
              file={file}
              disabled={!isReady}
              error={error}
              onFileChange={setFile}
              onError={setError}
              onSubmit={handleSubmit}
            />

            {dictionaryEntries && (
              <DictionaryEditor
                initialEntries={dictionaryEntries}
                onSaved={setDictionaryEntries}
              />
            )}

            <p className="text-center text-sm text-ink-faint">
              機密情報を含む録音はアップロードしないでください。
            </p>
          </>
        )}

        {phase === "working" && file && <ProgressView fileName={file.name} progress={progress} />}

        {phase === "done" && result && (
          <MinutesResult
            result={result}
            fileName={file?.name ?? ""}
            onRestart={handleRestart}
          />
        )}
      </main>
    </div>
  );
}
