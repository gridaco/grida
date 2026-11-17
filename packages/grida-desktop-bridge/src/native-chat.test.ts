// GRIDA-SEC-004 — typed public identities and renderer-owned File input only.
import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  DesktopNativeChat,
  NativeChatAcceptance,
  NativeChatAttachment,
  NativeChatDraftAttachment,
  NativeChatEffort,
  NativeChatFileInput,
  NativeChatFileReferenceInput,
  NativeChatGoal,
  NativeChatGoalRequest,
  NativeChatImageInput,
  NativeChatProfileChoice,
  NativeChatProfileCatalog,
  NativeChatQueuedMessage,
  NativeChatQueueItem,
  NativeChatQueueAction,
  NativeChatMessageAttachment,
  NativeChatSelectedImageInput,
  NativeChatSelection,
  NativeChatSelectionState,
  NativeChatSelectionTarget,
  NativeChatActivity,
  NativeChatToolImage,
} from "./index";

describe("DesktopNativeChat retained tool images", () => {
  it("keeps the dedicated reader optional and carries only opaque display metadata", () => {
    const older: Pick<DesktopNativeChat, "readToolImage"> = {};
    expect(older.readToolImage).toBeUndefined();
    expectTypeOf<
      NonNullable<NativeChatActivity["output"]>["images"]
    >().toEqualTypeOf<readonly NativeChatToolImage[] | undefined>();
    expectTypeOf<
      Parameters<NonNullable<DesktopNativeChat["readToolImage"]>>
    >().toEqualTypeOf<[attachmentId: string, previewId: string]>();
    expectTypeOf<
      Awaited<ReturnType<NonNullable<DesktopNativeChat["readToolImage"]>>>
    >().toEqualTypeOf<ArrayBuffer>();
  });
});

describe("DesktopNativeChat queued inspection", () => {
  it("keeps read-only queued inspection optional for older hosts", () => {
    const older: Pick<
      DesktopNativeChat,
      | "queuedMessage"
      | "readQueuedAttachmentPreview"
      | "acceptsQueuedTextReplacement"
    > = {};
    expect(older.queuedMessage).toBeUndefined();
    expect(older.readQueuedAttachmentPreview).toBeUndefined();
    expect(older.acceptsQueuedTextReplacement).toBeUndefined();
    const olderItem: NativeChatQueueItem = {
      inputId: "input",
      preview: "Text",
    };
    expect(olderItem.attachments).toBeUndefined();
    expect(olderItem.textOnly).toBeUndefined();
    expect(olderItem.textEditable).toBeUndefined();
    expectTypeOf<NativeChatQueueItem["textOnly"]>().toEqualTypeOf<
      boolean | undefined
    >();
    expectTypeOf<NativeChatQueuedMessage["attachments"]>().toEqualTypeOf<
      readonly NativeChatMessageAttachment[] | undefined
    >();
  });

  it("separates text-preserving queue replacement from strict text-only operations", () => {
    const image: NativeChatQueueItem = {
      inputId: "image",
      preview: "Caption",
      textOnly: false,
      textEditable: true,
      attachments: [{ name: "original.png", mimeType: "image/png" }],
    };
    const edit: NativeChatQueueAction = {
      action: "replaceText",
      inputId: image.inputId,
      text: "",
    };
    expect(edit.text).toBe("");
    expect(image.textOnly).toBe(false);
    expect(image.textEditable).toBe(true);
    expectTypeOf<NativeChatQueuedMessage["textEditable"]>().toEqualTypeOf<
      boolean | undefined
    >();
    expectTypeOf<
      Parameters<NonNullable<DesktopNativeChat["acceptsQueuedTextReplacement"]>>
    >().toEqualTypeOf<[]>();
    expectTypeOf<
      Awaited<
        ReturnType<
          NonNullable<DesktopNativeChat["acceptsQueuedTextReplacement"]>
        >
      >
    >().toEqualTypeOf<boolean>();
  });

  it("binds full text and byte reads to an attachment, observation and exact queued input", () => {
    expectTypeOf<
      Parameters<NonNullable<DesktopNativeChat["queuedMessage"]>>
    >().toEqualTypeOf<
      [attachmentId: string, observationId: string, inputId: string]
    >();
    expectTypeOf<
      Awaited<ReturnType<NonNullable<DesktopNativeChat["queuedMessage"]>>>
    >().toEqualTypeOf<NativeChatQueuedMessage>();
    expectTypeOf<
      Parameters<NonNullable<DesktopNativeChat["readQueuedAttachmentPreview"]>>
    >().toEqualTypeOf<
      [
        attachmentId: string,
        observationId: string,
        inputId: string,
        previewId: string,
      ]
    >();
    expectTypeOf<
      Awaited<
        ReturnType<
          NonNullable<DesktopNativeChat["readQueuedAttachmentPreview"]>
        >
      >
    >().toEqualTypeOf<ArrayBuffer>();
  });
});

describe("DesktopNativeChat saved selection", () => {
  it("keeps the saved new-chat default optional and distinct from offered recommendations", () => {
    expectTypeOf<NativeChatProfileCatalog["newChatDefault"]>().toEqualTypeOf<
      NativeChatSelection | undefined
    >();
    const old: NativeChatProfileCatalog = {
      active: null,
      choices: [],
      saved: [],
    };
    const unavailable: NativeChatProfileCatalog = {
      ...old,
      newChatDefault: {
        profileId: "saved",
        modelId: "wire-model",
        effort: "high",
      },
    };
    expect(old.newChatDefault).toBeUndefined();
    expect(unavailable.choices).toEqual([]);
    expect(unavailable.newChatDefault?.profileId).toBe("saved");
  });
  it("keeps selection, durable draft creation, and selected-image intake optional", () => {
    const older: Pick<
      DesktopNativeChat,
      | "selection"
      | "updateSelection"
      | "createFromDraft"
      | "acceptsSelectedImage"
      | "submitSelectedImage"
    > = {};
    expect(older.selection).toBeUndefined();
    expect(older.updateSelection).toBeUndefined();
    expect(older.createFromDraft).toBeUndefined();
    expect(older.acceptsSelectedImage).toBeUndefined();
    expect(older.submitSelectedImage).toBeUndefined();
  });

  it("addresses exactly one saved chat or stable draft using public identities", () => {
    const chat: NativeChatSelectionTarget = { sessionId: "saved-chat" };
    const draft: NativeChatSelectionTarget = { draftId: "stable-draft" };
    const selection: NativeChatSelection = {
      profileId: null,
      modelId: "wire-model",
      effort: "high",
    };
    const unavailable: NativeChatSelectionState = {
      target: chat,
      revision: 3,
      selection,
      available: false,
    };
    const unresolved: NativeChatSelectionState = {
      target: draft,
      revision: 0,
      selection: null,
      available: false,
    };
    expect(unavailable.selection).toEqual(selection);
    expect(unresolved.selection).toBeNull();
    expectTypeOf<
      Parameters<NonNullable<DesktopNativeChat["selection"]>>
    >().toEqualTypeOf<[target: NativeChatSelectionTarget]>();
    expectTypeOf<
      Awaited<ReturnType<NonNullable<DesktopNativeChat["selection"]>>>
    >().toEqualTypeOf<NativeChatSelectionState>();
    // @ts-expect-error A target cannot name both a saved chat and a draft.
    const ambiguous: NativeChatSelectionTarget = {
      sessionId: "chat",
      draftId: "draft",
    };
    // @ts-expect-error A target must name a chat or a draft.
    const missing: NativeChatSelectionTarget = {};
    const invalid = { ...selection, effort: "maximum" } as const;
    // @ts-expect-error Effort is a closed set, not a settings bag.
    const invalidEffort: NativeChatSelection = invalid;
    void [ambiguous, missing, invalidEffort];
  });

  it("requires explicit compare-and-save identity and lets Main resolve the model", () => {
    expectTypeOf<
      Parameters<NonNullable<DesktopNativeChat["updateSelection"]>>
    >().toEqualTypeOf<
      [
        target: NativeChatSelectionTarget,
        expectedRevision: number,
        operationId: string,
        choice: Readonly<{
          profileId: string | null;
          effort: NativeChatEffort;
        }>,
      ]
    >();
    expectTypeOf<
      Awaited<ReturnType<NonNullable<DesktopNativeChat["updateSelection"]>>>
    >().toEqualTypeOf<NativeChatSelectionState>();
  });

  it("returns the native-bound first-input identity with the draft attachment", () => {
    expectTypeOf<
      Parameters<NonNullable<DesktopNativeChat["createFromDraft"]>>
    >().toEqualTypeOf<[draftId: string]>();
    expectTypeOf<
      Awaited<ReturnType<NonNullable<DesktopNativeChat["createFromDraft"]>>>
    >().toEqualTypeOf<NativeChatDraftAttachment>();
    expectTypeOf<NativeChatDraftAttachment>().toEqualTypeOf<
      NativeChatAttachment & Readonly<{ firstInputId: string }>
    >();
    // @ts-expect-error A draft attachment must carry the durable first input.
    const missingInput: NativeChatDraftAttachment = {
      attachmentId: "a",
      sessionId: "s",
    };
    void missingInput;
  });
});

describe("DesktopNativeChat input capture", () => {
  it("keeps exact-binding image eligibility optional and factual", () => {
    expectTypeOf<NativeChatProfileChoice["imageInput"]>().toEqualTypeOf<
      true | undefined
    >();
    const older: NativeChatProfileChoice = {
      id: "profile",
      connection: "Connection",
      model: "Model",
    };
    const supported: NativeChatProfileChoice = { ...older, imageInput: true };
    expect(older.imageInput).toBeUndefined();
    expect(supported.imageInput).toBe(true);
  });
  it("adds optional selection revisions while preserving older request shapes", () => {
    expectTypeOf<
      Parameters<NonNullable<DesktopNativeChat["submitInRegime"]>>[7]
    >().toEqualTypeOf<number | undefined>();
    expectTypeOf<
      Parameters<
        NonNullable<DesktopNativeChat["submitWithLibrarySelection"]>
      >[5]
    >().toEqualTypeOf<number | undefined>();
    type Request =
      | NativeChatImageInput
      | NativeChatSelectedImageInput
      | NativeChatFileInput
      | NativeChatFileReferenceInput
      | NativeChatGoalRequest;
    expectTypeOf<Request["selectionRevision"]>().toEqualTypeOf<
      number | undefined
    >();
    const legacy: NativeChatImageInput = {
      action: "submit",
      inputId: "input",
      text: "Inspect this",
      png: new ArrayBuffer(0),
      operatingRegime: "act",
    };
    expect(legacy.selectionRevision).toBeUndefined();
    expectTypeOf<
      Extract<keyof NativeChatGoal, "selectionRevision">
    >().toEqualTypeOf<never>();
  });

  it("accepts the selected File independently from inline PNG and exposes no source path", () => {
    expectTypeOf<
      Parameters<NonNullable<DesktopNativeChat["acceptsSelectedImage"]>>
    >().toEqualTypeOf<[]>();
    expectTypeOf<
      Awaited<
        ReturnType<NonNullable<DesktopNativeChat["acceptsSelectedImage"]>>
      >
    >().toEqualTypeOf<boolean>();
    expectTypeOf<
      Parameters<NonNullable<DesktopNativeChat["submitSelectedImage"]>>
    >().toEqualTypeOf<
      [attachmentId: string, input: NativeChatSelectedImageInput]
    >();
    expectTypeOf<
      Awaited<ReturnType<NonNullable<DesktopNativeChat["submitSelectedImage"]>>>
    >().toEqualTypeOf<NativeChatAcceptance>();
    expectTypeOf<NativeChatSelectedImageInput["file"]>().toEqualTypeOf<File>();
    expectTypeOf<NativeChatSelectedImageInput["originalFile"]>().toEqualTypeOf<
      File | undefined
    >();
    expectTypeOf<
      Extract<
        keyof NativeChatSelectedImageInput,
        "path" | "bytes" | "png" | "preview"
      >
    >().toEqualTypeOf<never>();
  });
});
