import { describe, expect, it } from "vitest";
import { USER_FILE_ATTACHMENTS } from "@grida/agent";
import { native_message_parts } from "./native-message-parts";

describe("native_message_parts", () => {
  it("shows a person's attachments as the kit's file chip, without placeholder text", () => {
    expect(
      native_message_parts.of({
        messageId: "ask",
        role: "user",
        text: "What colour is it?",
        attachments: [{ name: "image.png", mimeType: "image/png", size: 179 }],
      })
    ).toEqual([
      { type: USER_FILE_ATTACHMENTS, data: { files: [{ name: "image.png" }] } },
      { type: "text", text: "What colour is it?" },
    ]);
  });

  it("keeps a message without attachments as its text", () => {
    expect(
      native_message_parts.of({
        messageId: "done",
        role: "assistant",
        text: "Coral.",
      })
    ).toEqual([{ type: "text", text: "Coral." }]);
  });
});
