import type { NativeChatMessage } from "@grida/desktop-bridge";
import { chat_vocabulary } from "./chat-vocabulary";
import type { ChatMessage } from "./types";
import { video_attachment } from "./video-attachment";

/**
 * A native chat message as the chat kit's message parts: its text, and the
 * files a person attached, shown with the kit's sent-attachment chip. A file
 * attached by reference with a preview (a video) keeps its poster frame and
 * caption, so the chip matches the card the composer showed.
 */
export namespace native_message_parts {
  export function of(message: NativeChatMessage): ChatMessage["parts"] {
    const parts = [
      { type: "text", text: message.text },
    ] as ChatMessage["parts"];
    if (message.role !== "user" || !message.attachments?.length) return parts;
    return [
      {
        type: chat_vocabulary.CONTEXT_PARTS.files,
        // The chip names each file; the bytes stay with the host.
        data: {
          files: message.attachments.map(({ name, preview }) => ({
            name,
            ...(preview?.poster && { poster: preview.poster }),
            ...(preview && { caption: video_attachment.caption(preview) }),
          })),
        },
      } as unknown as ChatMessage["parts"][number],
      ...parts,
    ];
  }
}
