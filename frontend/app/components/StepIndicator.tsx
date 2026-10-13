import { CheckIcon } from "@/app/components/icons";

export type Phase = "select" | "working" | "done";

const STEPS: { key: Phase; label: string }[] = [
  { key: "select", label: "ファイルを選ぶ" },
  { key: "working", label: "作成中" },
  { key: "done", label: "議事録" },
];

export function StepIndicator({ phase }: { phase: Phase }) {
  const currentIdx = STEPS.findIndex((step) => step.key === phase);

  return (
    <ol aria-label="進み具合" className="flex items-center gap-2 text-sm sm:gap-3">
      {STEPS.map((step, idx) => {
        const state = idx < currentIdx ? "done" : idx === currentIdx ? "current" : "upcoming";
        return (
          <li
            key={step.key}
            aria-current={state === "current" ? "step" : undefined}
            className="flex items-center gap-2 sm:gap-3"
          >
            {idx > 0 && (
              <span
                aria-hidden
                className={`h-0.5 w-4 rounded-full sm:w-8 ${
                  state === "upcoming" ? "bg-line-strong" : "bg-ink"
                }`}
              />
            )}
            <span
              className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
                state === "current"
                  ? "bg-ink text-white"
                  : state === "done"
                    ? "bg-marker text-ink"
                    : "border-2 border-line-strong text-ink-faint"
              }`}
            >
              {state === "done" ? <CheckIcon className="size-4" /> : idx + 1}
            </span>
            <span
              className={`${state === "current" ? "font-bold text-ink" : "hidden text-ink-faint sm:inline"}`}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
