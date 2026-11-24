import { afterEach, describe, expect, it, vi } from "vitest";
import { ComposerHistory } from "@/kits/composer/composer-history";
import {
  ComposerDrafts,
  type ComposerDraftBlob,
} from "@/lib/agent-chat/composer-drafts";
import { NativeChatController } from "@/lib/agent-chat/native-chat-controller";
import { DesktopChatFixture } from "./desktop-chat-fixture";

it("admits manual compaction and starts a queued follow-up when it settles", async () => {
  const server = new DesktopChatFixture("compaction", false);
  const controller = new NativeChatController(server.bridge);
  try {
    await controller.select(server.sessionId);
    await expect(controller.dispatchCompaction()).resolves.toBe("accepted");
    expect(server.compaction.read().pending).toBe(true);
    expect(controller.canSubmit).toBe(true);
    expect(controller.read().turnRecords.at(-1)?.compactions).toMatchObject([
      { status: "running", automatic: false },
    ]);
    expect(
      controller.submitOptimistically(
        "Use the summary for the next message.",
        controller.read().scope
      )
    ).toBe(true);
    await vi.waitFor(() =>
      expect(controller.read().queue?.items).toMatchObject([
        { preview: "Use the summary for the next message." },
      ])
    );
    server.compaction.accept();
    await vi.waitFor(() =>
      expect(controller.read().turnRecords).toContainEqual(
        expect.objectContaining({
          compactions: [
            expect.objectContaining({ status: "succeeded", automatic: false }),
          ],
        })
      )
    );
    expect(controller.read().messages).toContainEqual(
      expect.objectContaining({ text: "Use the summary for the next message." })
    );
  } finally {
    server.compaction.reset();
    controller.disconnect();
  }
});

it.each([
  { description: "captioned", text: "Compare these two images." },
  { description: "image-only", text: "" },
])(
  "reopens a $description image send with the next draft intact",
  async ({ text }) => {
    const server = new DesktopChatFixture("attachments", false);
    const controller = new NativeChatController(server.bridge);
    const reopened = new NativeChatController(server.bridge);
    const rows = new Map<string, ComposerDraftBlob>();
    const drafts = new ComposerDrafts(null, {
      get: async (key) => rows.get(key) ?? null,
      put: async (key, value) => {
        rows.set(key, value);
      },
      delete: async (key) => {
        rows.delete(key);
      },
    });
    const sampleImage = (name: string) =>
      new File([new Uint8Array([137, 80, 78, 71])], name, {
        type: "image/png",
      });
    const nextDraft = "Start the next draft.";
    try {
      controller.keepDrafts(drafts, "standalone");
      await controller.select(server.sessionId);
      const { scope } = controller.read();
      const { key } = controller.composerDraft()!;
      drafts.write(key, text || null);
      await controller.pickTransferredAttachment(scope, [
        { kind: "file", file: sampleImage("one.png") },
        { kind: "file", file: sampleImage("two.png") },
      ]);
      server.submission.hold(true);
      expect(
        controller.submitOptimistically(text, scope, text || undefined)
      ).toBe(true);
      await vi.waitFor(() =>
        expect(server.submission.read().pending).toBe(true)
      );
      expect(drafts.read(key)).toBeNull();

      drafts.write(key, nextDraft);
      server.submission.refuse();
      await vi.waitFor(() =>
        expect(controller.read().outgoing[0]).toMatchObject({
          text,
          status: "failed",
          attachments: [{ name: "one.png" }, { name: "two.png" }],
        })
      );
      await controller.pickFile(scope, sampleImage("next.png"));
      expect(controller.read().batchAttachments).toMatchObject([
        { card: { name: "next.png" } },
      ]);
      const inputId = controller.read().outgoing[0].id;
      controller.retryOutgoing(inputId);
      await vi.waitFor(() =>
        expect(server.submission.read().pending).toBe(true)
      );
      server.submission.accept();
      await vi.waitFor(() =>
        expect(controller.read().outgoing).toHaveLength(0)
      );
      controller.disconnect();

      reopened.keepDrafts(drafts, "standalone");
      await reopened.select(server.sessionId);
      const next = reopened.composerDraft()!;
      expect(next.store.read(next.key)).toBe(nextDraft);
      await vi.waitFor(() =>
        expect(reopened.read().batchAttachments).toMatchObject([
          { card: { name: "next.png" } },
        ])
      );
      const messages = reopened
        .read()
        .messages.filter((message) => message.inputId === inputId);
      expect(messages).toMatchObject([
        { text, attachments: [{ name: "one.png" }, { name: "two.png" }] },
      ]);
      for (const image of messages[0].attachments!)
        await expect(
          reopened.readAttachmentPreview(image.previewId!)
        ).resolves.toMatchObject({ size: 4, type: "image/png" });
    } finally {
      server.resetRequests();
      controller.disconnect();
      reopened.disconnect();
    }
  }
);

describe("DesktopChatFixture queue", () => {
  const fixture = () => {
    const server = new DesktopChatFixture("text", true);
    const controller = new NativeChatController(server.bridge);
    disconnect = () => {
      server.resetRequests();
      controller.disconnect();
    };
    return { server, controller };
  };
  let disconnect: (() => void) | undefined;

  afterEach(() => disconnect?.());

  it("undoes a removal at its surviving queue position with the original attachment", async () => {
    const { server, controller } = fixture();
    await controller.select(server.sessionId);
    const original = controller.read().queue?.items[1];
    const apply = server.captureQueueRemoval("image")!;
    await expect(
      controller.editQueue({ action: "withdraw", inputId: "image" })
    ).resolves.toBe(true);
    apply(true);
    expect(
      controller.read().queue?.items.map(({ inputId }) => inputId)
    ).toEqual(["multiline", "file-only"]);

    server.setRunning(false);
    await vi.waitFor(() => expect(controller.canResumeQueue).toBe(true));
    await controller.editQueue({ action: "resume" });
    apply(false);
    await vi.waitFor(() =>
      expect(controller.read().queue?.items[0]).toEqual(original)
    );
    expect(
      controller.read().queue?.items.map(({ inputId }) => inputId)
    ).toEqual(["image", "file-only"]);

    apply(true);
    await vi.waitFor(() =>
      expect(
        controller.read().queue?.items.map(({ inputId }) => inputId)
      ).toEqual(["file-only"])
    );
  });

  it("queues a normal composer submission with a newly picked file", async () => {
    const { server, controller } = fixture();
    await controller.select(server.sessionId);
    const { scope } = controller.read();
    const file = new File(["Draft notes"], "notes.txt", { type: "text/plain" });
    expect(controller.canAttach("file")).toBe(true);
    await controller.pickFile(scope, file);
    await controller.submitFromComposer("Read these notes.", scope);
    expect(controller.read().queue?.items.at(-1)).toMatchObject({
      preview: "Read these notes.",
      attachments: [{ name: "notes.txt", size: file.size }],
    });
  });

  it.each(["captioned image", "attachment only"] as const)(
    "keeps the staged file when Up targets a queued %s",
    async (target) => {
      const { server, controller } = fixture();
      await controller.select(server.sessionId);
      if (target === "captioned image")
        await controller.editQueue({
          action: "move",
          inputId: "image",
          direction: "down",
        });

      const { scope } = controller.read();
      const file = new File(["My draft"], "my-draft.txt", {
        type: "text/plain",
      });
      await controller.pickFile(scope, file);
      const attachments = controller.composerHistoryAttachments(scope);
      const staged = attachments.read();
      expect(staged).not.toBeNull();
      const queueIds = controller
        .read()
        .queue?.items.map((item) => item.inputId);

      let current: ComposerHistory.Draft = {
        document: null,
        attachment: staged,
      };
      const editor: ComposerHistory.Editor = {
        read: () => current,
        guard: () => () => true,
        materialize: (prompt) => ({ document: prompt.text, attachment: null }),
        replace(draft, applied) {
          current = draft;
          applied(true);
          return true;
        },
      };
      const onRecallBlocked = vi.fn<() => void>();
      const history = new ComposerHistory();
      expect(
        history.move("up", editor, {
          previous: () => [{ id: "older", text: "Older sent text" }],
          beforeRecall: controller.recallQueuedPrompt,
          onRecallBlocked,
        })
      ).toBe(true);

      const expected =
        target === "captioned image"
          ? "Use this image as the visual reference.\nKeep the spacing and the rounded corners consistent."
          : null;
      await vi.waitFor(() => {
        expect(current.document).toBe(expected);
        expect(onRecallBlocked).toHaveBeenCalledTimes(
          expected === null ? 1 : 0
        );
      });
      expect(current.attachment).toBe(staged);
      expect(attachments.read()).toBe(staged);
      expect(controller.read().queueDraft).toBeNull();
      expect(
        controller.read().queue?.items.map((item) => item.inputId)
      ).toEqual(queueIds);
    }
  );

  it("takes the message out of the queue and reinserts it with a staged image", async () => {
    const { server, controller } = fixture();
    await controller.select(server.sessionId);
    await controller.editQueuedText("multiline");
    expect(controller.read().queueDraft).toMatchObject({
      inputId: "multiline",
      checkoutId: expect.any(String),
    });

    const data = new Uint8Array([137, 80, 78, 71]);
    const file = new File([data], "sample.png", { type: "image/png" });
    await controller.pickTransferredAttachment(controller.read().scope, [
      { kind: "file", file },
    ]);
    expect(
      controller.read().queue?.items.map(({ inputId }) => inputId)
    ).toEqual(["image", "file-only"]);

    const scope = controller.read().scope;
    await controller.submitFromComposer("", scope, "multiline", true);
    expect(controller.read().queueDraft).toBeNull();
    const [item, next] = controller.read().queue!.items;
    expect(next.inputId).toBe("image");
    expect(item.preview).toBeNull();
    const [attachment] = item.attachments!;
    expect(attachment).toMatchObject({
      name: "sample.png",
      mimeType: "image/png",
    });
    const preview = await controller.readQueuedAttachmentPreview(
      item.inputId,
      attachment.previewId!
    );
    expect(new Uint8Array(await preview.arrayBuffer())).toEqual(data);
  });

  it("appends and removes individual cards in a send and in a queued edit", async () => {
    const { server, controller } = fixture();
    await controller.select(server.sessionId);
    const { scope } = controller.read();
    const file = (name: string) => ({
      kind: "file" as const,
      file: new File([name], name),
    });
    await controller.pickTransferredAttachment(scope, [
      file("one.txt"),
      file("two.txt"),
    ]);
    await controller.pickTransferredAttachment(scope, [file("three.txt")]);
    const entries = controller.read().batchAttachments!;
    expect(entries.map(({ card }) => card.name)).toEqual([
      "one.txt",
      "two.txt",
      "three.txt",
    ]);
    controller.removeAttachmentEntry(scope, entries[1].id);
    await controller.submitFromComposer("Review these", scope);
    const submitted = controller.read().queue!.items.at(-1)!;
    expect(submitted.attachments?.map(({ name }) => name)).toEqual([
      "one.txt",
      "three.txt",
    ]);
    await vi.waitFor(() => {
      const item = controller
        .read()
        .queue?.items.find(({ inputId }) => inputId === submitted.inputId);
      expect(item && controller.canEditQueuedText(item)).toBe(true);
    });
    await controller.pickTransferredAttachment(scope, [file("next.txt")]);
    await controller.editQueuedText(submitted.inputId);
    const edit = controller.read().queueDraft!;
    controller.removeAttachmentEntry(scope, edit.attachmentEntries![0].id);
    await controller.pickTransferredAttachment(scope, [file("four.txt")]);
    await controller.submitFromComposer(
      "Review this revision",
      scope,
      submitted.inputId
    );
    expect(
      controller
        .read()
        .queue!.items.at(-1)
        ?.attachments?.map(({ name }) => name)
    ).toEqual(["three.txt", "four.txt"]);
    expect(
      controller.read().batchAttachments?.map(({ card }) => card.name)
    ).toEqual(["next.txt"]);
  });

  it("retains the original attachment on cancel and lets a refused save retry", async () => {
    const { server, controller } = fixture();
    await controller.select(server.sessionId);
    await controller.editQueuedText("image");
    controller.removeAttachmentEntry(
      controller.read().scope,
      controller.read().queueDraft!.attachmentEntries![0].id
    );
    controller.closeQueueDraft();
    await vi.waitFor(() => expect(controller.read().acting).toBe(false));
    expect(controller.read().queueDraft).toBeNull();
    expect(controller.read().queue?.items[1]).toMatchObject({
      inputId: "image",
      attachments: [{ name: "reference.jpg" }],
    });

    await controller.editQueuedText("image");
    controller.removeAttachmentEntry(
      controller.read().scope,
      controller.read().queueDraft!.attachmentEntries![0].id
    );
    server.submission.hold(true);
    const scope = controller.read().scope;
    await expect(
      controller.submitFromComposer("", scope, "image", false)
    ).rejects.toThrow("native_chat_queue_edit_unconfirmed");
    expect(server.submission.read().pending).toBe(false);

    const refused = controller.submitFromComposer(
      "New caption",
      scope,
      "image",
      false
    );
    server.submission.refuse();
    await expect(refused).rejects.toThrow("native_chat_queue_edit_unconfirmed");
    expect(controller.read().queueDraft?.inputId).toBe("image");
    expect(controller.read().queueDraft?.attachmentEntries).toEqual([]);
    expect(
      controller.read().queue?.items.some(({ inputId }) => inputId === "image")
    ).toBe(false);
    expect(controller.read().queueDraft?.attachments?.[0].name).toBe(
      "reference.jpg"
    );

    server.submission.hold(false);
    await controller.submitFromComposer("New caption", scope, "image", false);
    const item = controller.read().queue?.items[1];
    expect(item?.preview).toBe("New caption");
    expect(item?.attachments).toEqual([]);
  });

  it("keeps the checkout editable when attachment preparation refuses before dispatch", async () => {
    const { server, controller } = fixture();
    const checkout = server.bridge.queueCheckout!;
    server.bridge.queueCheckout = {
      ...checkout,
      reinsert: async (attachment, request) => {
        if (request.attachments)
          throw new Error("attachment_batch_bytes_limit");
        return checkout.reinsert(attachment, request);
      },
    };
    await controller.select(server.sessionId);
    await controller.editQueuedText("image");
    const { scope, queueDraft } = controller.read();
    controller.removeAttachmentEntry(
      scope,
      queueDraft!.attachmentEntries![0].id
    );
    await expect(controller.saveQueueDraft("Revised caption")).resolves.toBe(
      false
    );
    expect(controller.read().queueEditRecovery).toBeNull();
    expect(controller.read().error).toContain("size or count limit");
    controller.closeQueueDraft();
    await vi.waitFor(() => expect(controller.read().queueDraft).toBeNull());
    expect(controller.read().queue?.items[1]?.attachments?.[0].name).toBe(
      "reference.jpg"
    );
  });

  it("lets a refused optimistic batch return to the composer with every card", async () => {
    const { server, controller } = fixture();
    server.bridge.submitAttachments = async () => {
      throw new Error("native_chat_attachment_preparation_failed");
    };
    await controller.select(server.sessionId);
    const { scope } = controller.read();
    await controller.pickTransferredAttachment(scope, [
      { kind: "file", file: new File(["1"], "first.txt") },
      { kind: "file", file: new File(["2"], "second.txt") },
    ]);
    expect(controller.submitOptimistically("Read these", scope)).toBe(true);
    await vi.waitFor(() =>
      expect(controller.read().outgoing[0]?.status).toBe("failed")
    );
    const { id } = controller.read().outgoing[0];
    await expect(controller.editOutgoing(id, () => true)).resolves.toBe(true);
    expect(
      controller.read().batchAttachments?.map(({ card }) => card.name)
    ).toEqual(["first.txt", "second.txt"]);
  });

  it("runs other queued work while the selected message is in the composer", async () => {
    const { server, controller } = fixture();
    await controller.select(server.sessionId);
    await controller.editQueuedText("image");
    server.setRunning(false);
    await vi.waitFor(() => expect(controller.canResumeQueue).toBe(true));
    await controller.editQueue({ action: "resume" });
    expect(
      controller.read().queue?.items.map(({ inputId }) => inputId)
    ).toEqual(["file-only"]);
    expect(
      controller.read().messages.some(({ messageId }) => messageId === "image")
    ).toBe(false);

    const { scope } = controller.read();
    await controller.submitFromComposer("Revised caption", scope, "image");
    expect(
      controller.read().queue?.items.map(({ preview }) => preview)
    ).toEqual(["Revised caption", null]);
  });

  it("reads a committed checkout receipt when its first reply was lost", async () => {
    const { server, controller } = fixture();
    const checkout = server.bridge.queueCheckout!;
    const read = vi
      .fn<typeof checkout.checkout>(checkout.checkout)
      .mockImplementationOnce(async (...args) => {
        await checkout.checkout(...args);
        throw new Error("lost checkout reply");
      });
    const receipt = vi.fn<NonNullable<typeof checkout.receipt>>(
      checkout.receipt!
    );
    server.bridge.queueCheckout = { ...checkout, checkout: read, receipt };
    await controller.select(server.sessionId);
    await controller.editQueuedText("image");
    expect(controller.read().queueEditRecovery).toBe("checkout");
    expect(controller.read().queueDraft).toBeNull();
    expect(
      controller.read().queue?.items.map(({ inputId }) => inputId)
    ).toEqual(["multiline", "file-only"]);

    await controller.retryQueueEdit();
    expect(read).toHaveBeenCalledOnce();
    expect(receipt).toHaveBeenCalledExactlyOnceWith(
      server.sessionId,
      read.mock.calls[0][1].requestId
    );
    expect(controller.read().queueEditRecovery).toBeNull();
    expect(controller.read().queueDraft?.inputId).toBe("image");
  });

  it("returns the original when the initiating draft changes before checkout is confirmed", async () => {
    const { server, controller } = fixture();
    const checkout = server.bridge.queueCheckout!;
    const confirmation = Promise.withResolvers<void>();
    server.bridge.queueCheckout = {
      ...checkout,
      checkout: async (...args) => {
        const result = await checkout.checkout(...args);
        await confirmation.promise;
        return result;
      },
    };
    await controller.select(server.sessionId);
    let isCurrent = true;
    const opening = controller.recallQueuedPrompt(() => isCurrent);
    isCurrent = false;
    confirmation.resolve();

    await expect(opening).resolves.toBe("blocked");
    expect(controller.read().queueDraft).toBeNull();
    expect(
      controller.read().queue?.items.map(({ inputId }) => inputId)
    ).toEqual(["multiline", "image", "file-only"]);
  });

  it("reads a committed reinsertion receipt before accepting another edit intent", async () => {
    const { server, controller } = fixture();
    const checkout = server.bridge.queueCheckout!;
    const reinsert = vi
      .fn<typeof checkout.reinsert>(checkout.reinsert)
      .mockImplementationOnce(async (...args) => {
        await checkout.reinsert(...args);
        throw new Error("lost reinsertion reply");
      });
    const receipt = vi.fn<NonNullable<typeof checkout.receipt>>(
      checkout.receipt!
    );
    server.bridge.queueCheckout = { ...checkout, reinsert, receipt };
    await controller.select(server.sessionId);
    await controller.editQueuedText("image");
    const { scope } = controller.read();
    await expect(
      controller.submitFromComposer("Committed caption", scope, "image")
    ).rejects.toThrow("native_chat_queue_edit_unconfirmed");
    expect(controller.read().queueEditRecovery).toBe("reinsert");
    controller.closeQueueDraft();
    await expect(
      controller.submitFromComposer("Different caption", scope, "image")
    ).rejects.toThrow("native_chat_queue_edit_unconfirmed");
    expect(reinsert).toHaveBeenCalledOnce();

    await controller.retryQueueEdit();
    expect(reinsert).toHaveBeenCalledOnce();
    expect(receipt).toHaveBeenCalledExactlyOnceWith(
      server.sessionId,
      reinsert.mock.calls[0][1].requestId
    );
    expect(controller.read().queueDraft).toBeNull();
    expect(controller.read().queueEditRecovery).toBeNull();
    expect(controller.read().queue?.items).toHaveLength(3);
    expect(controller.read().queue?.items[1].preview).toBe("Committed caption");
  });

  it.each(["continue", "restore"] as const)(
    "can %s an open checkout after switching away",
    async (action) => {
      const { server, controller } = fixture();
      await controller.select(server.sessionId);
      await controller.editQueuedText("image");
      const original = controller.read().queueDraft;
      expect(original?.attachments?.[0].name).toBe("reference.jpg");
      controller.disconnect();

      const reopened = new NativeChatController(server.bridge);
      try {
        await reopened.select(server.sessionId);
        expect(reopened.read().queueDraft).toBeNull();
        expect(reopened.read().observation?.snapshot.queueCheckout).toEqual({
          checkoutId: original?.checkoutId,
          inputId: "image",
        });
        expect(
          reopened.read().queue?.items.map(({ inputId }) => inputId)
        ).toEqual(["multiline", "file-only"]);
        if (action === "continue") await reopened.continueQueueEdit();
        const resumedDraft = expect.objectContaining({
          checkoutId: original?.checkoutId,
          inputId: "image",
          text: original?.text,
          attachments: original?.attachments,
        });
        expect(reopened.read().queueDraft).toEqual(
          action === "continue" ? resumedDraft : null
        );
        if (action === "continue") reopened.closeQueueDraft();
        else await reopened.restoreQueueEdit();
        await vi.waitFor(() =>
          expect(
            reopened.read().observation?.snapshot.queueCheckout
          ).toBeUndefined()
        );
        expect(reopened.read().queueDraft).toBeNull();
        expect(reopened.read().queue?.items[1]).toMatchObject({
          inputId: "image",
          attachments: [{ name: "reference.jpg" }],
        });
      } finally {
        reopened.disconnect();
      }
    }
  );

  it("reconciles a lost steer reply after reattachment without a second transfer", async () => {
    const { server, controller } = fixture();
    const drafts = new ComposerDrafts(null, null);
    controller.keepDrafts(drafts, "fixture-workspace");
    let attached = 0;
    server.bridge.load = async (sessionId) => ({
      sessionId,
      attachmentId: `attachment-${++attached}`,
    });
    const transfer = server.bridge.steerQueued!;
    const steer = vi
      .fn<typeof transfer>(transfer)
      .mockImplementationOnce(async (...args) => {
        await transfer(...args);
        throw new Error("lost steer reply");
      });
    server.bridge.steerQueued = steer;
    const checkout = server.bridge.queueCheckout!;
    const receipt = vi.fn<NonNullable<typeof checkout.receipt>>(
      checkout.receipt!
    );
    server.bridge.queueCheckout = { ...checkout, receipt };
    await controller.select(server.sessionId);
    const turn = controller.read().observation?.snapshot.current?.turnId;
    await controller.steerQueued("image");
    expect(controller.read().queueEditRecovery).toBe("steer");
    controller.disconnect();

    const reopened = new NativeChatController(server.bridge);
    reopened.keepDrafts(drafts, "fixture-workspace");
    try {
      await reopened.select(server.sessionId);
      expect(reopened.read().queueEditRecovery).toBe("steer");
      await reopened.retryQueueEdit();
      expect(steer).toHaveBeenCalledOnce();
      expect(receipt).toHaveBeenCalledExactlyOnceWith(
        "attachment-2",
        steer.mock.calls[0][1].requestId
      );
      expect(reopened.read().queueEditRecovery).toBeNull();
      expect(
        reopened.read().queue?.items.map(({ inputId }) => inputId)
      ).toEqual(["multiline", "file-only"]);
      const transferred = reopened
        .read()
        .messages.filter(({ messageId }) => messageId === "image");
      expect(transferred).toEqual([
        expect.objectContaining({
          role: "user",
          turnId: turn,
          attachments: [
            {
              name: "reference.jpg",
              mimeType: "image/jpeg",
              previewId: "local-fixture-image",
            },
          ],
        }),
      ]);
    } finally {
      reopened.disconnect();
    }
  });

  it("moves a waiting input into the transcript through Resume queue", async () => {
    const { server, controller } = fixture();
    await controller.select(server.sessionId);
    server.setRunning(false);
    await vi.waitFor(() => expect(controller.canResumeQueue).toBe(true));

    await controller.editQueue({ action: "resume" });

    expect(server.readRunning()).toBe(true);
    expect(controller.read().queue?.items[0].inputId).toBe("image");
    await vi.waitFor(() =>
      expect(controller.read().messages).toContainEqual(
        expect.objectContaining({ messageId: "multiline", role: "user" })
      )
    );
  });
});
