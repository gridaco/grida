import type { NativeChatMessageContext } from "@grida/desktop-bridge";
import type { chat_vocabulary } from "@/lib/agent-chat/chat-vocabulary";
import { LibraryStorage } from "@/lib/library/storage";
import { xmlAttribute } from "./message-context";

type ImageReference = Pick<chat_vocabulary.DesignReference, "title" | "url">;

export const IMAGE_REFERENCE_PART = {
  kind: "images.references",
  version: 1,
} as const;

export function imagesMessageContext(
  references: readonly chat_vocabulary.DesignReference[]
): NativeChatMessageContext {
  const images = references.map(({ title, url }) => ({ title, url }));
  const modelText = [
    "<grida-desktop-context>",
    "  <images>",
    ...(images.length
      ? [
          "    <references>",
          ...images.map(
            ({ title, url }) =>
              `      <reference ${xmlAttribute("title", title)} ${xmlAttribute("url", url)} />`
          ),
          "    </references>",
        ]
      : []),
    "    <reminder>Create an image for this request.</reminder>",
    "  </images>",
    "</grida-desktop-context>",
  ].join("\n");
  return {
    modelText,
    displayParts: images.length
      ? [{ ...IMAGE_REFERENCE_PART, data: { references: images } }]
      : [],
  };
}

export function readImageReferencePreviews(data: unknown): ImageReference[] {
  if (!data || typeof data !== "object" || !("references" in data)) return [];
  const { references } = data;
  if (!Array.isArray(references)) return [];
  return references.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== "object") return [];
    const { title, url } = entry as Record<string, unknown>;
    if (
      typeof title !== "string" ||
      typeof url !== "string" ||
      !LibraryStorage.isPublicAssetUrl(url)
    )
      return [];
    return [{ title, url }];
  });
}
