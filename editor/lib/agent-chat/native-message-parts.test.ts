import { describe, expect, it } from "vitest";
import { native_message_parts } from "./native-message-parts";

describe("native_message_parts", () => {
  it("forwards only retained PNG preview selectors, excluding folders and other media", () => {
    const parts = native_message_parts.of({
      messageId: "ask",
      role: "user",
      text: "Inspect these.",
      attachments: [
        { name: "original.png", mimeType: "image/png", previewId: "opaque" },
        { name: "folder", mimeType: "inode/directory", previewId: "ignored" },
        {
          name: "document.pdf",
          mimeType: "application/pdf",
          previewId: "ignored",
        },
      ],
    });
    expect(parts[0]).toEqual({
      type: "data-user_file_attachments",
      data: {
        files: [
          { name: "original.png", mimeType: "image/png", previewId: "opaque" },
          { name: "folder", kind: "directory" },
          { name: "document.pdf" },
        ],
      },
    });
  });
  it("shows a person's attachments as the kit's file chip, without placeholder text", () => {
    expect(
      native_message_parts.of({
        messageId: "ask",
        role: "user",
        text: "What colour is it?",
        attachments: [{ name: "image.png", mimeType: "image/png", size: 179 }],
      })
    ).toEqual([
      {
        type: "data-user_file_attachments",
        data: { files: [{ name: "image.png", mimeType: "image/png" }] },
      },
      { type: "text", text: "What colour is it?" },
    ]);
  });

  it("keeps a video's poster frame and caption on its chip after reload", () => {
    const poster = "data:image/jpeg;base64,/9j/4AAQ";
    expect(
      native_message_parts.of({
        messageId: "cut",
        role: "user",
        text: "Make a short cut.",
        attachments: [
          {
            name: "clip.mov",
            mimeType: "video/quicktime",
            size: 3_000_000_000,
            preview: { poster, durationMs: 12_500, width: 1920, height: 1080 },
          },
        ],
      })[0]
    ).toEqual({
      type: "data-user_file_attachments",
      data: {
        files: [{ name: "clip.mov", poster, caption: "0:13 · 1920×1080" }],
      },
    });
  });

  it("keeps a replayed folder as a folder resource without a size or media preview", () => {
    expect(
      native_message_parts.of({
        messageId: "folder",
        role: "user",
        text: "Inspect these sources.",
        attachments: [{ name: "sources", mimeType: "inode/directory" }],
      })[0]
    ).toEqual({
      type: "data-user_file_attachments",
      data: { files: [{ name: "sources", kind: "directory" }] },
    });
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
