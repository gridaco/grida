import type { NativeChatMessage } from "@grida/desktop-bridge";
import { USER_FILE_ATTACHMENTS } from "@grida/agent";
import type { ChatMessage } from "./types";

/**
 * A native chat message as the chat kit's message parts: its text, and the
 * files a person attached, shown with the kit's sent-attachment chip.
 */
export namespace native_message_parts {
  export function of(message: NativeChatMessage): ChatMessage["parts"] {
    const parts = [
      { type: "text", text: message.text },
    ] as ChatMessage["parts"];
    if (message.role !== "user" || !message.attachments?.length) return parts;
    return [
      {
        type: USER_FILE_ATTACHMENTS,
        // The chip names each file; the bytes stay with the host.
        data: { files: message.attachments.map(({ name }) => ({ name })) },
      } as unknown as ChatMessage["parts"][number],
      ...parts,
    ];
  }
}
