import type { NativeChatMessage } from "@grida/desktop-bridge";
import { chat_vocabulary } from "./chat-vocabulary";
import type { ChatMessage } from "./types";
import { video_attachment } from "./video-attachment";

/**
 * A native chat message as the chat kit's text, editor context and attachments.
 * Retained PNGs carry only an opaque preview selector;
 * references keep their bounded poster and dimensions from the composer.
 */
export namespace native_message_parts {
  export function of(message: NativeChatMessage): ChatMessage["parts"] {
    const parts: ChatMessage["parts"] = [];
    if (message.role === "user" && message.questionReply)
      parts.push({
        type: chat_vocabulary.CONTEXT_PARTS.questionReply,
        data: message.questionReply.question,
      });
    if (message.role === "user" && message.svgSelection)
      parts.push({
        type: chat_vocabulary.CONTEXT_PARTS.svgSelection,
        data: true,
      });
    else if (message.role === "user" && message.svgTextSelection)
      parts.push({
        type: chat_vocabulary.CONTEXT_PARTS.svgTextSelection,
        data: true,
      });
    if (message.role === "user" && message.displayParts?.length)
      parts.push({
        type: chat_vocabulary.CONTEXT_PARTS.messageContext,
        data: message.displayParts,
      });
    if (message.role === "user" && message.attachments?.length)
      parts.push({
        type: chat_vocabulary.CONTEXT_PARTS.files,
        // The chip names each file; the bytes stay with the host.
        data: {
          files: message.attachments.map(
            ({ name, mimeType, preview, previewId }) =>
              mimeType === "inode/directory"
                ? { name, kind: "directory" }
                : {
                    name,
                    ...(mimeType &&
                      /^image\/(?:png|jpeg|webp|gif)$/.test(mimeType) && {
                        mimeType,
                      }),
                    ...(previewId &&
                      mimeType &&
                      /^image\/(?:png|jpeg|webp|gif)$/.test(mimeType) && {
                        previewId,
                      }),
                    ...(preview?.poster && { poster: preview.poster }),
                    ...(preview && {
                      caption: video_attachment.caption(preview),
                    }),
                  }
          ),
        },
      });
    parts.push({ type: "text", text: message.text });
    if (message.role === "assistant") {
      for (const [index, citation] of (message.citations ?? []).entries()) {
        const url = URL.parse(citation.url);
        if (
          !url ||
          (url.protocol !== "https:" && url.protocol !== "http:") ||
          url.username ||
          url.password
        )
          continue;
        parts.push({
          type: "source-url",
          sourceId: String(index + 1),
          url: url.href,
          title: citation.title || url.hostname,
        });
      }
    }
    return parts;
  }
}
