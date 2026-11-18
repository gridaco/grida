import type { NativeChatMessageContext } from "@grida/desktop-bridge";
import { xmlAttribute } from "./message-context";

export type WorkflowMessageReference = Readonly<{
  number: number;
  title: string;
  showcaseUrl: string;
  sourceUrl: string;
  templateId?: string;
  posterUrl?: string;
}>;

type WorkflowReferencePreview = Pick<
  WorkflowMessageReference,
  "number" | "title" | "showcaseUrl" | "posterUrl"
>;

export const WORKFLOW_REFERENCE_PART = {
  kind: "fx.workflow-references",
  version: 1,
} as const;

/** Freeze one selection into its model and transcript projections. */
export function workflowMessageContext(
  references: readonly WorkflowMessageReference[]
): NativeChatMessageContext {
  const entries = references.map((reference) => {
    const attributes = [
      xmlAttribute("number", reference.number),
      xmlAttribute("title", reference.title),
      ...(reference.templateId
        ? [xmlAttribute("template-id", reference.templateId)]
        : []),
      xmlAttribute("showcase", reference.showcaseUrl),
      xmlAttribute("source", reference.sourceUrl),
    ];
    return `      <reference ${attributes.join(" ")} />`;
  });
  const modelText = [
    "<grida-desktop-context>",
    "  <fx>",
    ...(entries.length
      ? ["    <references>", ...entries, "    </references>"]
      : []),
    "    <reminder>Use Grida FX for this request. Follow the desktop-fx skill if available.</reminder>",
    "  </fx>",
    "</grida-desktop-context>",
  ].join("\n");
  const displayParts = references.length
    ? [
        {
          ...WORKFLOW_REFERENCE_PART,
          data: {
            references: references.map(
              ({ number, title, showcaseUrl, posterUrl }) => ({
                number,
                title,
                showcaseUrl,
                ...(posterUrl ? { posterUrl } : {}),
              })
            ),
          },
        },
      ]
    : [];
  return { modelText, displayParts };
}

const SHOWCASE_URL = /^https:\/\/grida\.co\/fx\/workflows\/[a-z0-9-]+\/?$/;
const POSTER_URL =
  /^https:\/\/fx-cdn\.grida\.co\/showcase\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:png|webp|jpe?g)$/;

/** Validate the Desktop projection before using it for links or image loads. */
export function readWorkflowReferencePreviews(
  data: unknown
): WorkflowReferencePreview[] {
  if (!data || typeof data !== "object" || !("references" in data)) return [];
  const { references } = data;
  if (!Array.isArray(references)) return [];
  return references.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== "object") return [];
    const { number, title, showcaseUrl, posterUrl } = entry as Record<
      string,
      unknown
    >;
    if (
      typeof number !== "number" ||
      !Number.isSafeInteger(number) ||
      number < 1 ||
      typeof title !== "string" ||
      !title.trim() ||
      typeof showcaseUrl !== "string" ||
      !SHOWCASE_URL.test(showcaseUrl)
    )
      return [];
    return [
      {
        number,
        title,
        showcaseUrl,
        ...(typeof posterUrl === "string" && POSTER_URL.test(posterUrl)
          ? { posterUrl }
          : {}),
      },
    ];
  });
}
