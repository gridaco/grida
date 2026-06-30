/**
 * `hoistToolResultImages` — deliver tool-produced images to the model as a
 * user-message image part instead of a tool-result media block.
 *
 * WHY (gridaco/grida#923): on the OpenAI Chat Completions / openai-compatible
 * wire (OpenRouter, Ollama, custom endpoints — the dominant BYOK path), a
 * `role:"tool"` message's content is **text-only**. The AI SDK's
 * `@ai-sdk/openai-compatible` adapter therefore `JSON.stringify`s a tool
 * result whose `toModelOutput` produced an image media block — the base64
 * lands in the prompt as undecodable text. The model cannot see the pixels
 * (it guesses) and the string inflates the text-token count (context
 * overflow). A user-message image part is the universal vision input: it
 * routes through the provider's image encoder (tiled) on every provider,
 * including Anthropic-native where the tool-result block would also have
 * worked.
 *
 * This is the AI-SDK realization of the neutral "stage-and-reattach" lowering
 * strategy. Doctrine + reasoning live in the WG docs:
 *   docs/wg/ai/agent/ai-sdk/vision-lowering.md  (the SDK-specific workaround)
 *   docs/wg/ai/agent/vision.md                  (the neutral contract)
 *
 * Wired into the run loop via `prepareStep` (see `agent/index.ts`), which
 * receives `[...rebuiltHistory, ...inLoopSteps]` each step — so this one
 * transform covers both cross-turn and same-turn perception. At `prepareStep`
 * time `toModelOutput` has already run (the bytes are a structured media
 * block) but the provider stringify has NOT — so the image is intact and
 * matchable here.
 *
 * It is **shape-keyed, not tool-keyed**: any tool result carrying an inline
 * image is hoisted, robust to future image-producing tools. It is a pure view
 * transform — never persisted; the durable record keeps the original
 * tool-result shape and the lowering reproduces from storage every turn. It
 * composes below the retention pass (`runtime/message-view.ts`): stale
 * perceptions arrive here already lowered to text, so only live-window images
 * still carry a media block and get hoisted.
 */

import type { ImagePart, ModelMessage, ToolResultPart } from "ai";

/**
 * Text left in the tool result after its image is hoisted out, so the model
 * sees a non-empty result and knows where the pixels went. The tool-call ↔
 * tool-result pairing the protocol requires is preserved.
 */
export const HOISTED_IMAGE_PLACEHOLDER =
  "[image shown in the following message]";

type ToolResultOutput = ToolResultPart["output"];
type ContentOutput = Extract<ToolResultOutput, { type: "content" }>;
type ContentItem = ContentOutput["value"][number];

/** An inline base64 image item the openai-compatible wire would stringify. */
type ImageContentItem = ContentItem & { data: string; mediaType: string };

function isImageItem(item: ContentItem): item is ImageContentItem {
  if (
    item.type !== "media" &&
    item.type !== "image-data" &&
    item.type !== "file-data"
  ) {
    return false;
  }
  const { data, mediaType } = item as { data?: unknown; mediaType?: unknown };
  return (
    typeof data === "string" &&
    typeof mediaType === "string" &&
    mediaType.startsWith("image/")
  );
}

function toImagePart(item: ImageContentItem): ImagePart {
  return { type: "image", image: item.data, mediaType: item.mediaType };
}

/**
 * Rewrite image-bearing tool results into a following user-message image part.
 * Pure, order-preserving, and idempotent: a second pass finds no image items
 * (already hoisted) and returns an equivalent array.
 */
export function hoistToolResultImages(
  messages: ModelMessage[]
): ModelMessage[] {
  const out: ModelMessage[] = [];
  let changed = false;

  for (const message of messages) {
    if (message.role !== "tool") {
      out.push(message);
      continue;
    }

    const hoisted: ImagePart[] = [];
    const content = message.content.map((part) => {
      if (part.type !== "tool-result" || part.output.type !== "content") {
        return part;
      }
      // Partition the result's content in one pass: images to hoist, the rest
      // kept in place.
      const kept: ContentItem[] = [];
      const images: ImageContentItem[] = [];
      for (const item of part.output.value) {
        if (isImageItem(item)) images.push(item);
        else kept.push(item);
      }
      if (images.length === 0) return part;
      hoisted.push(...images.map(toImagePart));
      // Drop the image items and append a marker pointing at the re-attached
      // image so the result is never empty.
      const value: ContentItem[] = [
        ...kept,
        { type: "text", text: HOISTED_IMAGE_PLACEHOLDER },
      ];
      return {
        ...part,
        output: { ...part.output, value },
      } satisfies ToolResultPart;
    });

    if (hoisted.length === 0) {
      // No image in this result — keep the original message, don't clone it.
      out.push(message);
      continue;
    }
    changed = true;
    out.push({ ...message, content }, { role: "user", content: hoisted });
  }

  // The common case is a turn with no image tool result: hand back the input
  // array untouched rather than an allocated copy (this runs on every step).
  return changed ? out : messages;
}
