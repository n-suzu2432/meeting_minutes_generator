import { Document, HeadingLevel, Packer, Paragraph } from "docx";
import type { GenerateMinutesResponse } from "@/lib/api";

function bulletedOrPlaceholder(items: string[]): Paragraph[] {
  if (items.length === 0) {
    return [new Paragraph({ text: "(なし)", bullet: { level: 0 } })];
  }
  return items.map((item) => new Paragraph({ text: item, bullet: { level: 0 } }));
}

function statementLogLines(statementLogMarkdown: string): string[] {
  return statementLogMarkdown
    .split("\n")
    .map((line) => line.replace(/^-\s*/, "").trim())
    .filter((line) => line.length > 0);
}

/** 議事録データからWord(.docx)のBlobを生成する。 */
export async function buildMinutesDocxBlob(
  result: GenerateMinutesResponse
): Promise<Blob> {
  const { minutes } = result;

  const todoLines = minutes.todos.map((todo) => {
    const owner = todo.owner || "未定";
    const due = todo.due || "未定";
    return `${todo.task}(担当: ${owner} / 期限: ${due})`;
  });

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: "議事録", heading: HeadingLevel.TITLE }),

          new Paragraph({ text: "会議概要", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: minutes.summary }),

          new Paragraph({ text: "決定事項", heading: HeadingLevel.HEADING_1 }),
          ...bulletedOrPlaceholder(minutes.decisions),

          new Paragraph({ text: "TODO", heading: HeadingLevel.HEADING_1 }),
          ...bulletedOrPlaceholder(todoLines),

          new Paragraph({
            text: "発言ログ(タイムスタンプ付き・話者分離なし)",
            heading: HeadingLevel.HEADING_1,
          }),
          ...bulletedOrPlaceholder(statementLogLines(result.statement_log_markdown)),
        ],
      },
    ],
  });

  return Packer.toBlob(doc);
}
