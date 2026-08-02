export type DictionaryEntry = {
  wrong: string;
  correct: string;
};

export type HealthStatus = {
  openai_configured: boolean;
  anthropic_configured: boolean;
  ffmpeg_available: boolean;
};

export type TodoItem = {
  task: string;
  owner: string | null;
  due: string | null;
};

export type MinutesData = {
  summary: string;
  decisions: string[];
  todos: TodoItem[];
};

export type ReplacedTerm = {
  誤: string;
  正: string;
  件数: number;
};

export type GenerateMinutesResponse = {
  markdown: string;
  minutes: MinutesData;
  statement_log_markdown: string;
  failed_chunk_count: number;
  replaced_terms: ReplacedTerm[];
  whisper_cost_estimate_usd: number;
  claude_cost_estimate_usd: number;
};

export type MinutesProgressStage =
  | "splitting"
  | "transcribing"
  | "dictionary"
  | "extracting"
  | "formatting"
  | "done"
  | "error";

export type MinutesProgressEvent = {
  stage: MinutesProgressStage;
  progress: number;
  message: string;
  result?: GenerateMinutesResponse;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function parseErrorDetail(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (typeof data?.detail === "string") return data.detail;
  } catch {
    // レスポンスがJSONでない場合はステータスコードのみ返す
  }
  return `リクエストに失敗しました(status: ${response.status})`;
}

export async function fetchHealth(): Promise<HealthStatus> {
  const res = await fetch(`${API_URL}/api/health`, { cache: "no-store" });
  if (!res.ok) throw new Error(await parseErrorDetail(res));
  return res.json();
}

export async function fetchDictionary(): Promise<DictionaryEntry[]> {
  const res = await fetch(`${API_URL}/api/dictionary`, { cache: "no-store" });
  if (!res.ok) throw new Error(await parseErrorDetail(res));
  return res.json();
}

export async function saveDictionary(
  entries: DictionaryEntry[]
): Promise<DictionaryEntry[]> {
  const res = await fetch(`${API_URL}/api/dictionary`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entries),
  });
  if (!res.ok) throw new Error(await parseErrorDetail(res));
  return res.json();
}

export async function generateMinutes(
  file: File,
  onProgress?: (event: MinutesProgressEvent) => void
): Promise<GenerateMinutesResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_URL}/api/minutes`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok || !res.body) throw new Error(await parseErrorDetail(res));

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: GenerateMinutesResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as MinutesProgressEvent;
      onProgress?.(event);
      if (event.stage === "error") throw new Error(event.message);
      if (event.stage === "done" && event.result) finalResult = event.result;
    }
  }

  if (!finalResult) {
    throw new Error("議事録の生成に失敗しました(サーバーからの応答が不完全です)。");
  }
  return finalResult;
}
