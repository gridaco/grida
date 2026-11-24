import type {
  DesktopNativeChat,
  NativeChatDraftAttachment,
  NativeChatPermissionMode,
  NativeChatPermissionState,
  NativeChatProfileCatalog,
  NativeChatSelection,
  NativeChatSelectionState,
  NativeChatSelectionTarget,
} from "@grida/desktop-bridge";

type SettingsBridge = Required<
  Pick<
    DesktopNativeChat,
    | "profiles"
    | "selectProfile"
    | "selection"
    | "updateSelection"
    | "turnCapabilities"
    | "acceptsAutomaticApprovalReview"
    | "defaultsToAutomaticReview"
    | "acceptsPermissionMode"
    | "permissionMode"
    | "reviewPermissionMode"
    | "setPermissionMode"
  >
>;

type Options = {
  profiles: NativeChatProfileCatalog;
  initialPermission?: NativeChatPermissionMode;
  readModels?: () => Promise<void>;
  readAccess?: () => Promise<void>;
};

type SelectionState = NativeChatSelectionState & {
  selection: NativeChatSelection;
};

type PermissionReview = {
  reviewId: string;
  requestId: string;
  revision: number;
};

const accessModes = ["restricted", "approve_for_me", "full_access"] as const;

/** In-memory model and access state for the production chat controller. */
export class DesktopChatSettingsFixture {
  private readonly selections = new Map<string, SelectionState>();
  private readonly selectionReceipts = new Map<
    string,
    Readonly<{ operationId: string; revision: number; choice: string }>
  >();
  private readonly drafts = new Map<string, NativeChatDraftAttachment>();
  private readonly permissions = new Map<string, NativeChatPermissionState>();
  private readonly reviews = new Map<string, PermissionReview>();
  private readonly permissionReceipts = new Map<
    string,
    Readonly<{
      requestId: string;
      revision: number;
      mode: NativeChatPermissionMode;
      reviewId: string | undefined;
      state: NativeChatPermissionState;
    }>
  >();
  private active: string | null;
  private defaults: NativeChatSelection;
  private readingAccess?: Promise<void>;

  constructor(private readonly options: Options) {
    this.active = options.profiles.active;
    this.defaults = options.profiles.newChatDefault ?? {
      profileId: this.active,
      modelId: this.modelFor(this.active),
      effort: "medium",
    };
  }

  createFromDraft(
    draftId: string,
    sessionId: string,
    manualApproval?: true
  ): NativeChatDraftAttachment {
    const previous = this.drafts.get(draftId);
    if (previous) return previous;
    const target = { sessionId };
    const { selection } = this.readSelection({ draftId });
    this.selections.set(this.key(target), {
      target,
      revision: 0,
      selection,
      available: true,
    });
    this.permissions.set(sessionId, {
      sessionId,
      revision: 0,
      mode: manualApproval ? "restricted" : "approve_for_me",
      available: accessModes,
    });
    const created = {
      sessionId,
      attachmentId: sessionId,
      firstInputId: crypto.randomUUID(),
    };
    this.drafts.set(draftId, created);
    return created;
  }

  model(sessionId: string): string {
    return this.readSelection({ sessionId }).selection.modelId;
  }

  readonly bridge: SettingsBridge = {
    profiles: async () => {
      await this.options.readModels?.();
      return {
        ...this.options.profiles,
        active: this.active,
        newChatDefault: this.defaults,
        modelChanges: true,
        inputRoutes: true,
      };
    },
    selectProfile: async (choice) => {
      const id = choice.kind === "default" ? null : choice.id;
      this.modelFor(id);
      this.active = id;
    },
    selection: async (target) => this.readSelection(target),
    updateSelection: async (target, revision, operationId, choice) => {
      const key = this.key(target);
      const head = this.readSelection(target);
      const modelId = this.modelFor(choice.profileId);
      const effort = choice.effort === "standard" ? "medium" : choice.effort;
      const speed = choice.speed ?? head.selection.speed;
      const selection = {
        profileId: choice.profileId,
        modelId,
        effort,
        ...(speed && speed !== "standard" && { speed }),
      };
      const fingerprint = JSON.stringify(selection);
      const prior = this.selectionReceipts.get(key);
      if (prior?.operationId === operationId) {
        if (
          prior.revision !== revision ||
          prior.choice !== fingerprint ||
          head.revision !== revision + 1
        )
          throw new Error("native_chat_selection_invalid");
        return head;
      }
      if (head.revision !== revision)
        throw new Error("selection_revision_changed");

      const next = {
        target,
        revision: revision + 1,
        selection,
        available: true,
      };
      this.selections.set(key, next);
      this.selectionReceipts.set(key, {
        operationId,
        revision,
        choice: fingerprint,
      });
      const old = head.selection;
      if (
        old.profileId !== choice.profileId ||
        old.modelId !== modelId ||
        old.effort !== effort ||
        old.speed === selection.speed
      )
        this.defaults = { profileId: choice.profileId, modelId, effort };
      return next;
    },
    turnCapabilities: async (target) => {
      const id = this.readSelection(target).selection.profileId;
      const subscription =
        this.profile(id)?.connection.toLowerCase() === "chatgpt subscription";
      return subscription
        ? { status: "available", speeds: ["fast"], webSearch: true }
        : { status: "unsupported", speeds: [], webSearch: false };
    },
    acceptsAutomaticApprovalReview: async () => true,
    defaultsToAutomaticReview: true,
    acceptsPermissionMode: async () => true,
    permissionMode: async (attachmentId) => {
      const readAccess = this.options.readAccess;
      if (readAccess) {
        const pending = (this.readingAccess ??= readAccess());
        try {
          await pending;
        } finally {
          if (this.readingAccess === pending) this.readingAccess = undefined;
        }
      }
      return this.readPermission(attachmentId);
    },
    reviewPermissionMode: async (attachmentId, revision, requestId) => {
      if (this.readPermission(attachmentId).revision !== revision)
        throw new Error("permission_mode_revision_changed");
      const reviewId = crypto.randomUUID();
      this.reviews.set(attachmentId, { reviewId, requestId, revision });
      return {
        reviewId,
        chatTitle: "Example chat",
        workspaceName: "Gallery project",
      };
    },
    setPermissionMode: async (
      attachmentId,
      revision,
      requestId,
      mode,
      answer
    ) => {
      const previous = this.permissionReceipts.get(attachmentId);
      if (previous?.requestId === requestId) {
        if (
          previous.revision !== revision ||
          previous.mode !== mode ||
          previous.reviewId !== answer?.reviewId ||
          answer?.confirmed === false
        )
          throw new Error("native_chat_permission_mode_invalid");
        return previous.state;
      }
      const current = this.readPermission(attachmentId);
      if (current.revision !== revision)
        throw new Error("permission_mode_revision_changed");
      const review = this.reviews.get(attachmentId);
      if (
        answer &&
        (!review ||
          review.reviewId !== answer.reviewId ||
          review.requestId !== requestId ||
          review.revision !== revision)
      )
        throw new Error("native_chat_permission_mode_review_changed");
      if (answer?.confirmed === false) {
        this.reviews.delete(attachmentId);
        return null;
      }
      if (mode === "full_access" && current.mode !== mode && !answer?.confirmed)
        throw new Error("native_chat_permission_mode_confirmation_required");
      this.reviews.delete(attachmentId);
      const state = { ...current, mode, revision: revision + 1 };
      this.permissions.set(attachmentId, state);
      this.permissionReceipts.set(attachmentId, {
        requestId,
        revision,
        mode,
        reviewId: answer?.reviewId,
        state,
      });
      return state;
    },
  };

  private key(target: NativeChatSelectionTarget): string {
    return target.sessionId
      ? `chat:${target.sessionId}`
      : `draft:${target.draftId}`;
  }

  private readSelection(target: NativeChatSelectionTarget): SelectionState {
    const key = this.key(target);
    const previous = this.selections.get(key);
    if (previous) return previous;
    const state = {
      target,
      revision: 0,
      selection: this.defaults,
      available: true,
    };
    this.selections.set(key, state);
    return state;
  }

  private profile(id: string | null) {
    return (
      this.options.profiles.choices.find((choice) => choice.id === id) ??
      this.options.profiles.saved.find(
        (choice) => choice.id === id && choice.available
      )
    );
  }

  private modelFor(id: string | null): string {
    if (id === null) return "Default model";
    const profile = this.profile(id);
    if (!profile) throw new Error("native_chat_selection_unavailable");
    return profile.model;
  }

  private readPermission(sessionId: string): NativeChatPermissionState {
    return (
      this.permissions.get(sessionId) ?? {
        sessionId,
        revision: 0,
        mode: this.options.initialPermission ?? "approve_for_me",
        available: accessModes,
      }
    );
  }
}
