// GRIDA-SEC-004 — queued previews never confer transcript, filesystem or mutation authority.
import { describe, expect, it } from "vitest";
import { NativeQueuedMessages } from "./native-queued-messages";

const URI = "urn:grida:retained-attachment:retained-image";
const prompt = (mimeType = "image/jpeg", size = 3) => ({
  inputId: "queued",
  prompt: [
    { type: "text", text: "Full text\nsecond line" },
    {
      type: "resource_link",
      name: "original.jpg",
      uri: URI,
      mimeType,
      size,
      _meta: {
        "co.grida/image-attachment": { sourcePath: "/private/never-publish" },
      },
    },
  ] as const,
});

describe("NativeQueuedMessages", () => {
  it("publishes text edit eligibility only for a negotiated replacement host", () => {
    const messages = new NativeQueuedMessages();
    const input = { ...prompt(), textOnly: false, textEditable: true };
    expect(
      messages.describe("chat", 1, "queued", input).textEditable
    ).toBeUndefined();
    const supported = messages.describe("chat", 1, "queued", input, true);
    expect(supported.textEditable).toBe(true);
    expect(supported.textOnly).toBe(false);
    expect(
      messages.describe(
        "chat",
        1,
        "queued",
        { ...input, textEditable: false },
        true
      ).textEditable
    ).toBe(false);
    expect(() =>
      messages.describe(
        "chat",
        1,
        "queued",
        { ...input, textEditable: "true" },
        true
      )
    ).toThrow("queued_message_unavailable");
  });
  it("returns an empty text for an image-only input without inventing a placeholder", () => {
    const images = new NativeQueuedMessages();
    const input = prompt();
    const message = images.describe("chat", 1, "queued", {
      ...input,
      prompt: [input.prompt[1]],
    });
    expect(message.text).toBe("");
    expect(message.attachments).toHaveLength(1);
    expect(message.attachments![0].previewId).toMatch(/^[a-f0-9-]{36}$/);
  });
  it("preserves factual text-only eligibility without inferring it from a display marker", () => {
    const images = new NativeQueuedMessages();
    const marker = {
      inputId: "queued",
      textOnly: false,
      prompt: [{ type: "text", text: "Selected skill." }],
    };
    expect(images.describe("chat", 1, "queued", marker).textOnly).toBe(false);
    expect(
      images.describe("chat", 1, "queued", { ...marker, textOnly: true })
        .textOnly
    ).toBe(true);
    expect(
      images.describe("chat", 1, "queued", { ...marker, textOnly: undefined })
        .textOnly
    ).toBeUndefined();
    expect(() =>
      images.describe("chat", 1, "queued", { ...marker, textOnly: "true" })
    ).toThrow("queued_message_unavailable");
  });
  it("keeps full multiline display text and bounded metadata with only opaque selectors", () => {
    const images = new NativeQueuedMessages();
    const message = images.describe("chat", 4, "queued", prompt());
    expect(message.text).toBe("Full text\nsecond line");
    expect(message.attachments).toEqual([
      {
        name: "original.jpg",
        mimeType: "image/jpeg",
        size: 3,
        previewId: expect.stringMatching(/^[a-f0-9-]{36}$/),
      },
    ]);
    expect(JSON.stringify(message)).not.toContain(URI);
    expect(JSON.stringify(message)).not.toContain("/private/");
    expect(images.describe("chat", 4, "queued", prompt())).toEqual(message);
    const token = message.attachments![0].previewId!;
    expect(images.require("chat", 4, "queued", token).inputId).toBe("queued");
    for (const basis of [
      ["other-chat", 4, "queued"],
      ["chat", 5, "queued"],
      ["chat", 4, "other-input"],
    ] as const)
      expect(() => images.require(basis[0], basis[1], basis[2], token)).toThrow(
        "queued_message_unavailable"
      );
    expect(() => images.require("chat", 4, "queued", URI)).toThrow(
      "queued_message_unavailable"
    );
    images.clear();
    expect(() => images.require("chat", 4, "queued", token)).toThrow(
      "queued_message_unavailable"
    );
  });

  it("never offers remote, arbitrary, unbounded or non-image bytes as retained previews", () => {
    const images = new NativeQueuedMessages();
    for (const uri of [
      "file:///private/image.jpg",
      "https://remote/image.jpg",
      "data:image/png;base64,YWJj",
      `${URI}\n`,
    ]) {
      const input = prompt();
      const changed = {
        ...input,
        prompt: [input.prompt[0], { ...input.prompt[1], uri }],
      };
      expect(
        images.describe("chat", 1, "queued", changed).attachments![0].previewId
      ).toBeUndefined();
    }
    expect(
      images.describe(
        "chat",
        1,
        "queued",
        prompt("image/jpeg", 20 * 1024 * 1024 + 1)
      ).attachments![0].previewId
    ).toBeUndefined();
    expect(
      images.describe("chat", 1, "queued", prompt("application/pdf"))
        .attachments![0].previewId
    ).toBeUndefined();
    expect(() =>
      images.describe("chat", 1, "queued", { ...prompt(), inputId: "other" })
    ).toThrow("queued_message_unavailable");
    expect(() =>
      images.describe("chat", 1, "queued", {
        inputId: "queued",
        prompt: [{ type: "text", text: "x".repeat(512 * 1024 + 1) }],
      })
    ).toThrow("queued_message_unavailable");
  });

  it.each(["image/png", "image/jpeg", "image/webp", "image/gif"])(
    "reads exact bounded original %s chunks without a sent-message identity",
    async (mimeType) => {
      const images = new NativeQueuedMessages();
      const bytes = Buffer.concat([
        Buffer.alloc(256 * 1024, 7),
        Buffer.from("original-tail"),
      ]);
      const token = images.describe(
        "chat",
        1,
        "queued",
        prompt(mimeType, bytes.length)
      ).attachments![0].previewId!;
      const offsets: number[] = [];
      const result = await images.read(
        images.require("chat", 1, "queued", token),
        async (offset) => {
          offsets.push(offset);
          const chunk = bytes.subarray(offset, offset + 256 * 1024);
          const next = offset + chunk.length;
          return {
            inputId: "queued",
            attachmentUri: URI,
            mimeType,
            totalBytes: bytes.length,
            offset,
            data: chunk.toString("base64"),
            nextOffset: next === bytes.length ? null : next,
          };
        }
      );
      expect(offsets).toEqual([0, 256 * 1024]);
      expect(Buffer.from(result)).toEqual(bytes);
    }
  );

  it("refuses changed ownership, bytes, size, MIME and chunk progress", async () => {
    const images = new NativeQueuedMessages();
    const token = images.describe("chat", 1, "queued", prompt()).attachments![0]
      .previewId!;
    const image = images.require("chat", 1, "queued", token);
    const good = {
      inputId: "queued",
      attachmentUri: URI,
      mimeType: "image/jpeg",
      totalBytes: 3,
      offset: 0,
      data: "YWJj",
      nextOffset: null,
    };
    for (const change of [
      { inputId: "another" },
      { attachmentUri: URI + "other" },
      { mimeType: "image/png" },
      { totalBytes: 4 },
      { totalBytes: 20 * 1024 * 1024 + 1 },
      { data: "YWJj\n" },
      { data: "" },
      { offset: 1 },
      { nextOffset: 0 },
    ])
      await expect(
        images.read(image, async () => ({ ...good, ...change }))
      ).rejects.toThrow("queued_message_unavailable");
  });
});
