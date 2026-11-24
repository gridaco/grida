import {
  NATIVE_CHAT_MAX_ATTACHMENTS,
  parseNativeChatMessageContext,
  type DesktopNativeChat,
  type NativeChatEffort,
  type NativeChatPermissionMode,
  type NativeChatPermissionReview,
  type NativeChatSpeed,
  type NativeChatTurnCapabilities,
} from "@grida/desktop-bridge";
import { AttachmentBatch } from "@/lib/agent-chat/attachment-batch";
import { ComposerDrafts } from "@/lib/agent-chat/composer-drafts";
import { image_attachment_preview } from "@/lib/agent-chat/image-attachment-preview";
import type { ComposerHistory, ComposerTransfer } from "@/kits/composer";
import type { PermissionReviewProject } from "../shared/agent-permission-confirmation";
import type { Workspace } from "@/lib/desktop/bridge";
import { slidesTemplateMessageContext } from "@/lib/desktop/slides-message-context";
import {
  welcome_message,
  WelcomeFollowupDraft,
  type WelcomeMessage,
  type WelcomeTemplate,
} from "@/lib/desktop/welcome-message";

type CapturedRequest = {
  readonly id: string;
  readonly input: HomeComposer.Input;
  readonly document: unknown;
  readonly documentRevision?: string;
  readonly access: NativeChatPermissionMode;
  readonly speed: HomeComposer.View["speed"];
  readonly recoveryKey?: string;
  readonly effort?: NativeChatEffort;
  readonly plan: boolean;
  readonly goal: boolean;
  readonly manualApproval: boolean;
  readonly source?: HomeComposer.DraftSource;
  readonly followup?: WelcomeFollowupDraft;
  handedOff?: boolean;
  attachments: AttachmentBatch.Draft;
  workspace?: Workspace;
};

type RecoverableRequest = Readonly<{
  requestId: string;
  workspaceId?: string;
  text: string;
  document: unknown;
  documentRevision?: string;
  attachmentNames?: readonly string[];
  attachmentIds?: readonly string[];
}>;

/** Unsent intent and the exact workspace chat reserved for its selected access. */
export class HomeComposer {
  static readonly key = "desktop-home";
  private static readonly drafts = new ComposerDrafts();
  private listeners = new Set<() => void>();
  private attachmentRevision = 0;
  private historyAttachmentRevision = 0;
  private restoration?: Promise<void>;
  private effortChosen = false;
  private effortInitialized = false;
  private capabilityTarget?: Readonly<{
    workspaceId: string;
    profileId: string | null;
    read: HomeComposer.CapabilityRead;
  }>;
  private capabilityRead?: Promise<void>;
  private turnRoute?: Pick<
    HomeComposer.CapabilityPreview,
    "profileId" | "modelId"
  >;
  private approvalProbe?: () => Promise<void>;
  private defaultsToAutomaticReview = false;
  private manualApproval = false;
  private permissionDecision?: PromiseWithResolvers<boolean>;
  private approvedAccess?: Readonly<{
    mode: "full_access" | "approve_for_me";
    host: HomeComposer.AccessHost;
    reviewId: string;
    workspaceId: string;
    request?: HomeComposer.AccessRequest;
    prepared?: HomeComposer.PreparedChat;
  }>;
  private copiedTemplate?: Readonly<{
    workspaceId: string;
    name: string;
    copy: WelcomeTemplate;
  }>;
  private captured?: CapturedRequest;
  private recovery?: {
    key: string;
    request: RecoverableRequest;
    attachments?: Promise<AttachmentBatch.Draft | null>;
  };
  private view: HomeComposer.View;

  constructor(readonly drafts = HomeComposer.drafts) {
    const modes = drafts.readModes(HomeComposer.key);
    this.view = {
      effort: "standard",
      speed: undefined,
      turnCapabilities: null,
      automaticReviewAvailable: false,
      permissionMode: "restricted",
      permissionReview: null,
      permissionBusy: false,
      permissionError: null,
      plan: !!modes.plan,
      goal: !!modes.goal,
      attachments: AttachmentBatch.empty,
      notice: null,
      busy: false,
      draftKey: null,
      outgoing: null,
    };
  }

  read = (): HomeComposer.View => this.view;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Relative workspace mentions must never follow a different destination. */
  draftFor(destination: string) {
    const key = `${HomeComposer.key}:${destination}`;
    return {
      key,
      store: this.drafts,
      onWrite: (document: unknown, revision?: string) => {
        const capture = this.captured;
        if (capture?.source?.key === key)
          capture.followup?.observe(document, revision);
      },
    };
  }

  restore(): Promise<void> {
    return (this.restoration ??= this.restoreAttachment());
  }

  private async restoreAttachment(): Promise<void> {
    const revision = this.attachmentRevision;
    let attachments = await this.drafts.readAttachmentBatch(HomeComposer.key);
    if (!attachments) {
      const stored = await this.drafts.readAttachment(HomeComposer.key);
      if (stored) {
        const file =
          stored.kind === "image" || stored.kind === "reference"
            ? stored.file
            : new File([stored.bytes], stored.name, {
                type: stored.kind === "png" ? "image/png" : "",
              });
        attachments = [
          HomeComposer.attachmentEntry({
            kind:
              stored.kind === "reference" &&
              stored.mimeType === "inode/directory"
                ? "directory"
                : "file",
            file,
          }),
        ];
      } else {
        const missing = await this.drafts.readMissingAttachment(
          HomeComposer.key
        );
        if (missing) attachments = [HomeComposer.missingAttachment(missing)];
      }
    }
    if (!attachments?.length || revision !== this.attachmentRevision) return;
    if (this.captured) {
      if (!this.captured.attachments.length)
        this.captured.attachments = attachments;
      this.update({ goal: false });
      this.showOutgoing(this.captured);
    } else if (!this.recovery) this.update({ goal: false, attachments });
  }

  selectEffort = (effort: NativeChatEffort): void => {
    if (this.view.busy) return;
    this.effortChosen = true;
    this.update({ effort });
  };

  connectTurnCapabilities(
    workspaceId: string | undefined,
    profileId: string | null,
    read: HomeComposer.CapabilityRead | undefined
  ): () => void {
    const target =
      workspaceId && read ? { workspaceId, profileId, read } : undefined;
    this.capabilityTarget = target;
    this.capabilityRead = undefined;
    this.turnRoute = undefined;
    this.update({ speed: undefined, turnCapabilities: null });
    void this.refreshTurnCapabilities();
    return () => {
      if (this.capabilityTarget === target) this.capabilityTarget = undefined;
    };
  }

  refreshTurnCapabilities = (): Promise<void> => {
    if (this.capabilityRead) return this.capabilityRead;
    const target = this.capabilityTarget;
    if (!target) return Promise.resolve();
    const request = target
      .read(target.workspaceId, target.profileId)
      .then(
        (preview) => {
          if (this.capabilityTarget !== target) return;
          const previous = this.turnRoute;
          const changed =
            previous &&
            preview &&
            (previous.profileId !== preview.profileId ||
              previous.modelId !== preview.modelId);
          if (preview) this.turnRoute = preview;
          this.update({
            turnCapabilities: preview,
            ...(changed && { speed: undefined }),
          });
        },
        () => {
          if (this.capabilityTarget === target)
            this.update({
              turnCapabilities: {
                status: "unavailable",
                speeds: [],
                webSearch: false,
              },
            });
        }
      )
      .finally(() => {
        if (this.capabilityRead === request) this.capabilityRead = undefined;
      });
    this.capabilityRead = request;
    return request;
  };

  connectAutomaticReview(
    probe: DesktopNativeChat["acceptsAutomaticApprovalReview"],
    defaultsToAutomaticReview = false
  ): () => void {
    this.defaultsToAutomaticReview = defaultsToAutomaticReview;
    this.update({ automaticReviewAvailable: false });
    if (!probe) return () => {};
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const supported = await probe();
        if (this.approvalProbe === refresh)
          this.update({ automaticReviewAvailable: supported });
      } catch {
        // The first call can precede admission of the new Main document.
      } finally {
        pending = false;
      }
    };
    this.approvalProbe = refresh;
    void refresh();
    return () => {
      if (this.approvalProbe === refresh) this.approvalProbe = undefined;
    };
  }

  refreshAutomaticReview = (): void => {
    void this.approvalProbe?.();
  };

  selectSpeed = (speed: NativeChatSpeed): void => {
    const { busy, permissionBusy, turnCapabilities, goal } = this.view;
    if (busy || permissionBusy || goal || !this.turnRoute) return;
    if (speed === "standard" || turnCapabilities?.speeds.includes(speed))
      this.update({ speed: speed === "standard" ? undefined : speed });
  };

  selectPermissionMode = (
    mode: NativeChatPermissionMode,
    destination: HomeComposer.Destination,
    host: HomeComposer.AccessHost | undefined
  ): void => {
    if (this.view.busy || this.view.permissionBusy) return;
    if (mode === "restricted") {
      this.manualApproval = true;
      this.clearPermissionReview();
      return;
    }
    if (mode === "approve_for_me" && this.defaultsToAutomaticReview) {
      if (!this.view.automaticReviewAvailable) return;
      this.manualApproval = false;
      this.clearPermissionReview();
      return;
    }
    if (!host || mode === this.view.permissionMode) return;
    const prepare =
      mode === "approve_for_me" ? host.prepareAutomatic : host.prepare;
    if (!prepare) return;
    this.clearPermissionReview();
    const decision = Promise.withResolvers<boolean>();
    this.permissionDecision = decision;
    this.update({
      permissionReview:
        mode === "full_access"
          ? {
              workspaceName:
                destination.workspace?.name ?? "your default project",
              workspaceId: destination.workspace?.id,
            }
          : null,
      permissionBusy: true,
      permissionError: null,
    });
    if (mode === "approve_for_me") decision.resolve(true);
    void this.prepareAccess(destination, host, decision, mode, prepare);
  };

  answerPermissionReview = (confirmed: boolean): void => {
    if (!this.view.permissionReview) return;
    if (!confirmed) {
      this.clearPermissionReview();
      return;
    }
    this.permissionDecision?.resolve(true);
    this.update({ permissionReview: null });
  };

  resetPermissionMode = (): void => {
    this.manualApproval = false;
    this.clearPermissionReview();
  };

  private clearPermissionReview(): void {
    this.permissionDecision?.resolve(false);
    this.permissionDecision = undefined;
    const approval = this.approvedAccess;
    this.approvedAccess = undefined;
    if (approval && !approval.prepared)
      void approval.host.answer(approval.reviewId, false).catch(() => {});
    this.update({
      permissionReview: null,
      permissionBusy: false,
      permissionError: null,
    });
  }

  /** A late catalog refresh cannot replace an explicit composer choice. */
  initializeEffort(effort: NativeChatEffort | undefined): void {
    if (effort && !this.effortChosen && !this.view.busy) {
      this.effortInitialized = true;
      this.update({ effort });
    }
  }
  selectPlan = (plan: boolean): void => {
    if (this.view.busy) return;
    this.update({ plan });
    this.saveModes();
  };
  selectGoal = (goal: boolean): void => {
    if (this.view.busy) return;
    if (goal && this.view.attachments.length) {
      this.update({
        notice: "Send or remove the attachments before starting a goal.",
      });
      return;
    }
    this.update({ goal, notice: null });
    this.saveModes();
  };

  transfer = (
    { resources }: Pick<ComposerTransfer.Event, "resources">,
    maxAttachments = NATIVE_CHAT_MAX_ATTACHMENTS
  ): void => {
    if (this.view.busy || this.view.outgoing || !resources.length) return;
    if (this.view.goal) {
      this.update({ notice: "Remove the goal intent to attach a file." });
      return;
    }
    if (this.view.attachments.length + resources.length > maxAttachments) {
      this.update({
        notice:
          maxAttachments === 1
            ? "Update Grida Desktop to attach multiple files."
            : `Attach up to ${maxAttachments} files or folders in one message.`,
      });
      return;
    }
    this.historyAttachmentRevision++;
    this.setAttachments([
      ...this.view.attachments,
      ...resources.map(HomeComposer.attachmentEntry),
    ]);
  };

  private static attachmentEntry(
    resource: HomeComposer.Attachment
  ): AttachmentBatch.Entry {
    const { kind, file } = resource;
    if (kind === "file" && image_attachment_preview.selectedMediaType(file))
      return AttachmentBatch.entry({ kind: "image", file });
    const mimeType = kind === "directory" ? "inode/directory" : file.type;
    return AttachmentBatch.entry(
      { kind: "reference", file, mimeType },
      {
        name: file.name,
        mimeType,
        ...(kind === "file" && { size: file.size }),
      }
    );
  }

  private static missingAttachment(name: string): AttachmentBatch.Entry {
    return { id: crypto.randomUUID(), card: { name } };
  }

  private setAttachments(attachments: AttachmentBatch.Draft): void {
    this.attachmentRevision++;
    this.update({ attachments, notice: null });
    void this.drafts.writeAttachmentBatch(
      HomeComposer.key,
      attachments.length ? attachments : null
    );
  }

  removeAttachment = (id: string): void => {
    if (this.view.busy) return;
    this.historyAttachmentRevision++;
    this.setAttachments(
      this.view.attachments.filter((attachment) => attachment.id !== id)
    );
  };

  private canReplaceHistoryAttachment = (attachment: object | null) =>
    !this.view.busy && !this.view.outgoing && !(attachment && this.view.goal);

  readonly historyAttachments: ComposerHistory.Attachments = {
    read: () => (this.view.attachments.length ? this.view.attachments : null),
    gestureRevision: () => this.historyAttachmentRevision,
    canReplace: this.canReplaceHistoryAttachment,
    replace: (value) => {
      if (!this.canReplaceHistoryAttachment(value)) return false;
      this.setAttachments(
        (value as AttachmentBatch.Draft | null) ?? AttachmentBatch.empty
      );
      return true;
    },
  };

  private async prepareAccess(
    destination: HomeComposer.Destination,
    host: HomeComposer.AccessHost,
    decision: PromiseWithResolvers<boolean>,
    mode: "full_access" | "approve_for_me",
    prepare: HomeComposer.AccessHost["prepare"]
  ): Promise<void> {
    let review: NativeChatPermissionReview | undefined;
    try {
      const workspace =
        destination.workspace ?? (await destination.defaultWorkspace());
      if (this.permissionDecision !== decision) return;
      if (!workspace) throw new Error("No default workspace available.");
      review = await prepare(workspace.id);
      if (this.permissionDecision === decision && this.view.permissionReview)
        this.update({
          permissionReview: {
            workspaceName: review.workspaceName,
            workspaceId: workspace.id,
          },
        });
      if (!(await decision.promise) || this.permissionDecision !== decision)
        return;
      await host.answer(review.reviewId, true);
      if (this.permissionDecision !== decision) return;
      this.approvedAccess = {
        mode,
        host,
        reviewId: review.reviewId,
        workspaceId: workspace.id,
      };
    } catch {
      if (this.permissionDecision === decision)
        this.update({
          permissionError:
            mode === "full_access"
              ? "Couldn't enable Full access for this project."
              : "Couldn't enable Auto for this project.",
        });
    } finally {
      if (review && this.approvedAccess?.reviewId !== review.reviewId)
        void host.answer(review.reviewId, false).catch(() => {});
      if (this.permissionDecision === decision) {
        this.permissionDecision = undefined;
        this.update({ permissionReview: null, permissionBusy: false });
      }
    }
  }

  private requireApprovedAccess(request: HomeComposer.AccessRequest) {
    const approval = this.approvedAccess;
    if (!approval || request.workspaceId !== approval.workspaceId) {
      const name =
        this.view.permissionMode === "approve_for_me" ? "Auto" : "Full access";
      this.resetPermissionMode();
      throw new Error(`Choose ${name} again for this project.`);
    }
    const previous = approval.request;
    if (
      previous &&
      (previous.profileId !== request.profileId ||
        (this.effortChosen && previous.effort !== request.effort))
    )
      throw new Error(
        "Restore the model and effort used to prepare this chat, or choose Ask for approval to start a different chat."
      );
    if (previous && previous.speed !== request.speed)
      throw new Error(
        "Restore the speed used to prepare this chat, or choose Ask for approval to start a different chat."
      );
    return approval;
  }

  private async startApprovedChat(
    request: HomeComposer.AccessRequest
  ): Promise<HomeComposer.PreparedChat> {
    const approval = this.requireApprovedAccess(request);
    if (approval.prepared) return approval.prepared;
    const original = approval.request ?? request;
    const attempt = { ...approval, request: original };
    const mode = approval.mode === "approve_for_me" ? "Auto" : "Full access";
    this.approvedAccess = attempt;
    let chat: HomeComposer.PreparedChat;
    try {
      chat = await attempt.host.start(attempt.reviewId, original);
    } catch (cause) {
      if (
        this.approvedAccess === attempt &&
        cause instanceof Error &&
        cause.message === "native_chat_permission_mode_unverified"
      )
        throw new Error(
          `Couldn't confirm ${mode} yet. Send again to check the same chat.`,
          { cause }
        );
      if (this.approvedAccess === attempt) this.resetPermissionMode();
      throw new Error(
        `Couldn't start the ${mode} chat. Your draft is still here.`,
        { cause }
      );
    }
    if (this.approvedAccess !== attempt)
      throw new Error(`${mode} approval changed. Your draft is still here.`);
    this.approvedAccess = { ...attempt, prepared: chat };
    return chat;
  }

  private async copyTemplate(
    workspaceId: string,
    template: HomeComposer.Template
  ): Promise<WelcomeTemplate> {
    const copied = this.copiedTemplate;
    if (copied?.workspaceId === workspaceId && copied.name === template.name)
      return copied.copy;
    const copy = await template.copy(workspaceId);
    this.copiedTemplate = { workspaceId, name: template.name, copy };
    return copy;
  }

  private turnOptions(
    workspaceId: string,
    profileId: string | null
  ): WelcomeMessage["turnOptions"] {
    const { capabilityTarget: target, turnRoute: route, view } = this;
    const speed = view.goal ? undefined : view.speed;
    if (!speed) return;
    if (target?.workspaceId !== workspaceId || target.profileId !== profileId)
      throw new Error(
        "Choose the message options again for this project and model."
      );
    const capabilities = view.turnCapabilities;
    if (capabilities?.status === "reauthenticationRequired")
      throw new Error(
        "Sign in to ChatGPT again or change your message options."
      );
    if (!route || !capabilities || capabilities.status === "unavailable")
      throw new Error(
        "Couldn’t verify these ChatGPT options. Check availability or change your selection."
      );
    if (!capabilities.speeds.includes(speed))
      throw new Error(
        "This connection cannot use the selected speed. Choose Standard or another model."
      );
    return {
      profileId: route.profileId,
      modelId: route.modelId,
      speed,
    };
  }

  /** Hand a whole request to the transition before preparing its destination. */
  capture(
    input: HomeComposer.Input,
    document: unknown,
    host: HomeComposer.Host,
    source?: HomeComposer.DraftSource
  ): boolean | undefined {
    if (
      this.view.busy ||
      this.view.permissionBusy ||
      this.captured ||
      this.recovery
    )
      return false;
    if (!this.hasRequest(input, this.view.attachments.length)) return undefined;
    HomeComposer.selectedAttachments(this.view.attachments);
    this.checkMessageContext(input);
    const id = crypto.randomUUID();
    const captured: CapturedRequest = {
      id,
      input,
      document,
      documentRevision: source?.store.documentRevision(source.key),
      access: this.view.permissionMode,
      speed: this.view.speed,
      effort:
        this.effortChosen || this.effortInitialized
          ? this.view.effort
          : undefined,
      plan: this.view.plan,
      goal: this.view.goal,
      manualApproval: this.manualApproval,
      attachments: this.view.attachments,
      ...(source && {
        recoveryKey: this.recoveryKey(source.key),
        source,
        followup: new WelcomeFollowupDraft(id, source.key, source),
      }),
    };
    this.keepRecovery(captured);
    // Autosave may not see the editor clear before Home unmounts. Rotate the
    // submitted document now so even identical text typed next is a new draft.
    try {
      source?.store.checkpoint(source.key, null);
    } catch (cause) {
      this.clearRecovery(captured.recoveryKey);
      throw new Error("Couldn't send from Home. Your draft is still here.", {
        cause,
      });
    }
    this.captured = captured;
    this.sendCaptured(captured, host);
    return true;
  }

  /** A navigation or reload can overtake the editor's last passive autosave. */
  flushNextDraft = (): void => {
    this.captured?.followup?.flush();
  };

  retryCaptured(host: HomeComposer.Host): void {
    if (!this.view.busy && this.captured)
      this.sendCaptured(this.captured, host);
  }

  recoverDraft(
    draftKey: string,
    ownsHandoff: (workspaceId: string, requestId: string) => boolean
  ): void {
    if (this.captured) return;
    const key = this.recoveryKey(draftKey);
    const request = this.readRecovery(key);
    if (request?.documentRevision)
      this.drafts.retireDocument(draftKey, request.documentRevision);
    const handedOff =
      request?.workspaceId &&
      ownsHandoff(request.workspaceId, request.requestId);
    if (handedOff) {
      void this.retireSourceAttachments(request.attachmentIds);
      this.clearRecovery(key);
    }
    const recovery = request && !handedOff ? { key, request } : undefined;
    this.recovery =
      recovery && recovery.request.attachmentNames?.length
        ? {
            ...recovery,
            attachments: this.readRecoveryAttachments(key, recovery.request),
          }
        : recovery;
    this.update({
      draftKey,
      outgoing: this.recovery
        ? {
            status: "failed",
            error: "This message was interrupted before opening the workspace.",
            retryable: false,
            handedOff: false,
          }
        : null,
    });
  }

  private async readRecoveryAttachments(
    key: string,
    request: RecoverableRequest
  ): Promise<AttachmentBatch.Draft | null> {
    const retained = await this.drafts
      .readAttachmentBatch(key)
      .catch(() => null);
    const ids = request.attachmentIds;
    if (!ids) return retained;
    if (HomeComposer.matchesAttachments(retained, ids)) return retained;
    // A reload or a refused write can interrupt the copy. Only the exact
    // captured bytes still under the draft key belong to this request.
    const source = await this.drafts
      .readAttachmentBatch(HomeComposer.key)
      .catch(() => null);
    return HomeComposer.matchesAttachments(source, ids) ? source : null;
  }

  private static matchesAttachments(
    entries: AttachmentBatch.Draft | null,
    ids: readonly string[]
  ): boolean {
    return (
      entries?.length === ids.length &&
      entries.every((entry, index) => entry.id === ids[index])
    );
  }

  private async retireSourceAttachments(ids: readonly string[] | undefined) {
    if (!ids?.length) return;
    const revision = this.attachmentRevision;
    const attachments = await this.drafts
      .readAttachmentBatch(HomeComposer.key)
      .catch(() => null);
    if (
      revision === this.attachmentRevision &&
      HomeComposer.matchesAttachments(attachments, ids)
    )
      this.setAttachments(AttachmentBatch.empty);
  }

  /** Return a refused request to an empty editor, preserving any newer draft. */
  async restoreCaptured(
    restoreDocument: (document: unknown) => boolean
  ): Promise<boolean> {
    const { captured, recovery } = this;
    const recovered = recovery?.request;
    if ((!captured && !recovered) || this.view.busy || captured?.handedOff)
      return false;
    const attachments =
      captured?.attachments ??
      (await recovery?.attachments) ??
      recovered?.attachmentNames?.map(HomeComposer.missingAttachment) ??
      AttachmentBatch.empty;
    if (
      this.captured !== captured ||
      this.recovery !== recovery ||
      this.view.busy ||
      captured?.handedOff ||
      this.view.attachments.length ||
      !restoreDocument(captured ? captured.document : recovered?.document)
    )
      return false;
    this.setAttachments(attachments);
    this.clearRecovery(captured?.recoveryKey ?? recovery?.key);
    this.captured = undefined;
    this.recovery = undefined;
    this.update({
      outgoing: null,
      notice: attachments.some(({ input }) => !input)
        ? "Attach the unavailable files again before sending."
        : null,
    });
    return true;
  }

  discardCaptured(): void {
    if (
      (!this.captured && !this.recovery) ||
      this.captured?.handedOff ||
      this.view.busy
    )
      return;
    void this.retireSourceAttachments(
      this.captured?.attachments.map(({ id }) => id) ??
        this.recovery?.request.attachmentIds
    );
    this.clearRecovery(this.captured?.recoveryKey ?? this.recovery?.key);
    this.captured = undefined;
    this.recovery = undefined;
    this.update({ outgoing: null });
  }

  private recoveryKey(draftKey: string): string {
    return `${draftKey}:outgoing`;
  }

  private readRecovery(key: string): RecoverableRequest | undefined {
    const value = this.drafts.read(key) as
      | (Partial<RecoverableRequest> & {
          attachmentName?: unknown;
        })
      | null;
    if (
      !value ||
      typeof value.requestId !== "string" ||
      typeof value.text !== "string"
    )
      return;
    if (
      value.workspaceId !== undefined &&
      typeof value.workspaceId !== "string"
    )
      return;
    const {
      requestId,
      workspaceId,
      text,
      document,
      documentRevision,
      attachmentNames,
      attachmentIds,
      attachmentName,
    } = value;
    if (documentRevision !== undefined && typeof documentRevision !== "string")
      return;
    if (
      attachmentNames !== undefined &&
      (!Array.isArray(attachmentNames) ||
        attachmentNames.length > NATIVE_CHAT_MAX_ATTACHMENTS ||
        attachmentNames.some((name) => typeof name !== "string"))
    )
      return;
    if (attachmentName !== undefined && typeof attachmentName !== "string")
      return;
    if (
      attachmentIds !== undefined &&
      (!Array.isArray(attachmentIds) ||
        attachmentIds.length !== attachmentNames?.length ||
        attachmentIds.some((id) => typeof id !== "string"))
    )
      return;
    return {
      requestId,
      workspaceId,
      text,
      document: document ?? null,
      documentRevision,
      attachmentIds,
      attachmentNames:
        attachmentNames ??
        (typeof attachmentName === "string" ? [attachmentName] : undefined),
    };
  }

  private keepRecovery(captured: CapturedRequest): void {
    if (!captured.recoveryKey) return;
    // Keep the recovery record compatible and bounded. The rich document
    // carries the full draft for restoration.
    const { input } = captured;
    const text = input.text || (!input.template ? input.prompt : "");
    try {
      this.drafts.checkpoint(captured.recoveryKey, {
        requestId: captured.id,
        workspaceId: captured.workspace?.id ?? captured.input.target?.id,
        text: text.length > 1024 ? `${text.slice(0, 1024)}…` : text,
        document: captured.document,
        documentRevision: captured.documentRevision,
        ...(captured.attachments.length && {
          attachmentNames: captured.attachments.map(({ card }) => card.name),
          attachmentIds: captured.attachments.map(({ id }) => id),
        }),
      } satisfies RecoverableRequest);
    } catch (cause) {
      throw new Error(
        "Couldn't keep your message for recovery. Your draft is still here.",
        { cause }
      );
    }
  }

  private clearRecovery(key: string | undefined): void {
    if (key) {
      this.drafts.write(key, null);
      void this.drafts.writeAttachmentBatch(key, null);
    }
  }

  private sendCaptured(captured: CapturedRequest, host: HomeComposer.Host) {
    this.showOutgoing(captured);
    void this.open(captured.input, host, captured).catch((error: unknown) => {
      this.showOutgoing(
        captured,
        error instanceof Error ? error.message : "Couldn't start the chat."
      );
    });
  }

  private showOutgoing(captured: CapturedRequest, error?: string) {
    if (this.captured !== captured) return;
    this.update({
      attachments: AttachmentBatch.empty,
      notice: null,
      outgoing:
        error === undefined
          ? { status: "opening" }
          : {
              status: "failed",
              error,
              retryable: true,
              handedOff: captured.handedOff === true,
            },
    });
  }

  private hasRequest(input: HomeComposer.Input, attachmentCount: number) {
    return !!(
      input.text.trim() ||
      input.template ||
      input.references.length ||
      input.messageContext?.displayParts.length ||
      attachmentCount
    );
  }

  private static selectedAttachments(
    entries: AttachmentBatch.Draft
  ): HomeComposer.Attachment[] {
    return entries.map(({ input, card }) => {
      if (input?.kind !== "image" && input?.kind !== "reference")
        throw new Error(`Attach ${card.name} again before sending.`);
      return {
        kind:
          input.kind === "reference" && input.mimeType === "inode/directory"
            ? "directory"
            : "file",
        file: input.file,
      };
    });
  }

  private checkMessageContext(input: HomeComposer.Input) {
    if (
      input.messageContext &&
      !parseNativeChatMessageContext(input.messageContext)
    )
      throw new Error(
        "The selected references are too large to send together. Remove some and try again."
      );
  }

  /** Prepare one first request before navigating; failures retain the staged draft. */
  submit(input: HomeComposer.Input, host: HomeComposer.Host): Promise<void> {
    return this.open(input, host);
  }

  private async open(
    input: HomeComposer.Input,
    host: HomeComposer.Host,
    captured?: CapturedRequest
  ): Promise<void> {
    if (this.view.busy) throw new Error("A workspace is already opening.");
    if (this.view.permissionBusy)
      throw new Error("Your access selection is still being prepared.");
    const speed = captured ? captured.speed : this.view.speed;
    const manualApproval = captured
      ? captured.manualApproval
      : this.manualApproval;
    this.update({ busy: true, permissionError: null });
    let opened = false;
    try {
      if (captured?.handedOff && captured.workspace) {
        host.open(captured.workspace);
        opened = true;
        this.accepted();
        return;
      }
      await this.restore();
      if (captured?.attachments.length) {
        this.keepRecovery(captured);
        if (captured.recoveryKey) {
          try {
            await this.drafts.writeAttachmentBatch(
              captured.recoveryKey,
              captured.attachments,
              true
            );
            void this.drafts.writeAttachmentBatch(HomeComposer.key, null);
          } catch {
            // The draft still owns its durable attachments until handoff.
          }
        }
      }
      this.checkMessageContext(input);
      const intent = this.view;
      const attachments = HomeComposer.selectedAttachments(
        captured ? captured.attachments : intent.attachments
      );
      const approval = this.approvedAccess;
      const workspace =
        captured?.workspace ?? input.target ?? (await host.defaultWorkspace());
      if (!workspace)
        throw new Error("No default workspace available on this host.");
      if (captured) {
        captured.workspace = workspace;
        this.keepRecovery(captured);
      }
      if (this.hasRequest(input, attachments.length)) {
        if (captured && captured.access !== intent.permissionMode)
          throw new Error(
            "Your chat access changed. Restore the draft and check access before sending."
          );
        if (speed !== this.view.speed || manualApproval !== this.manualApproval)
          throw new Error(
            "Your message options changed. Check them and send again."
          );
        const turnOptions = this.turnOptions(workspace.id, input.profileId);
        const contextRequested = input.messageContext || input.template;
        const goal = captured
          ? captured.goal && !attachments.length
          : intent.goal;
        if (contextRequested && goal && !input.text.trim())
          throw new Error("Write an objective before starting a goal.");
        if (
          contextRequested &&
          attachments.length &&
          !input.text.trim() &&
          attachments.some(
            ({ kind, file }) =>
              kind === "directory" ||
              !image_attachment_preview.selectedMediaType(file)
          )
        )
          throw new Error(
            "Write a message to send this attachment with the selected context."
          );
        const effort = captured ? captured.effort : this.selectedEffort();
        const accessRequest =
          approval || intent.permissionMode === "full_access"
            ? {
                workspaceId: workspace.id,
                profileId: input.profileId,
                ...(effort && { effort }),
                ...(turnOptions?.speed && { speed: turnOptions.speed }),
              }
            : undefined;
        if (accessRequest) this.requireApprovedAccess(accessRequest);
        const template = input.template
          ? await this.copyTemplate(workspace.id, input.template)
          : undefined;
        const messageContext = template
          ? slidesTemplateMessageContext(template)
          : input.messageContext;
        const text = messageContext
          ? input.text
          : (welcome_message.compose({
              text: input.prompt,
              references: input.references,
            }) ??
            (attachments.length > 1
              ? "Inspect the attachments."
              : "Inspect the attached file."));
        const prepared =
          accessRequest && (await this.startApprovedChat(accessRequest));
        if (
          !host.stash(workspace.id, {
            text,
            ...(captured && {
              requestId: captured.id,
              ...(captured.followup && {
                homeDraftKey: captured.source?.key,
                transferNextDraft: captured.followup.transfer,
              }),
            }),
            ...(messageContext && { messageContext }),
            profileId: prepared ? prepared.profileId : input.profileId,
            ...(prepared
              ? {
                  preparedSessionId: prepared.sessionId,
                  ...(intent.permissionMode === "approve_for_me" && {
                    preparedMode: intent.permissionMode,
                  }),
                }
              : {
                  ...(effort && { effort }),
                  ...(manualApproval && { manualApproval: true as const }),
                }),
            operatingRegime: (captured ? captured.plan : intent.plan)
              ? "plan"
              : "act",
            goal,
            ...(turnOptions && { turnOptions }),
            ...(attachments.length === 1 && { attachment: attachments[0] }),
            ...(attachments.length > 1 && { attachments }),
          })
        )
          throw new Error("Couldn't keep your message for the workspace.");
        if (captured) {
          captured.handedOff = true;
          if (captured.attachments.length)
            void this.drafts.writeAttachmentBatch(HomeComposer.key, null);
        }
        captured?.followup?.handoff();
        this.clearRecovery(captured?.recoveryKey);
      }
      host.open(workspace);
      opened = true;
      this.accepted();
    } finally {
      if (!opened) this.update({ busy: false });
    }
  }

  private selectedEffort(): NativeChatEffort | undefined {
    return this.effortChosen || this.effortInitialized
      ? this.view.effort
      : undefined;
  }

  /** The workspace now owns the handed-off request. */
  accepted(): void {
    this.copiedTemplate = undefined;
    if (!this.captured) this.setAttachments(AttachmentBatch.empty);
    this.resetPermissionMode();
    this.update({
      plan: false,
      goal: false,
      speed: undefined,
    });
    this.saveModes();
  }

  private saveModes(): void {
    this.drafts.writeModes(HomeComposer.key, {
      ...(this.view.plan && { plan: true }),
      ...(this.view.goal && { goal: true }),
    });
  }
  private update(patch: Partial<HomeComposer.View>): void {
    const next = { ...this.view, ...patch };
    this.view = {
      ...next,
      permissionMode:
        this.approvedAccess?.mode ??
        (this.defaultsToAutomaticReview &&
        next.automaticReviewAvailable &&
        !this.manualApproval
          ? "approve_for_me"
          : "restricted"),
    };
    this.listeners.forEach((listener) => listener());
  }
}

export namespace HomeComposer {
  export type CapabilityRead = NonNullable<
    DesktopNativeChat["welcomeTurnCapabilities"]
  >;
  export type CapabilityPreview = NonNullable<
    Awaited<ReturnType<CapabilityRead>>
  >;
  export type Attachment = Readonly<{ kind: "file" | "directory"; file: File }>;
  export type AccessHost = Readonly<{
    prepare: NonNullable<DesktopNativeChat["prepareWelcomeFullAccess"]>;
    prepareAutomatic?: DesktopNativeChat["prepareWelcomeAutomaticReview"];
    answer: NonNullable<DesktopNativeChat["answerWelcomeFullAccess"]>;
    start: NonNullable<DesktopNativeChat["startWelcomeFullAccess"]>;
  }>;
  export type AccessRequest = Parameters<AccessHost["start"]>[1];
  export type PreparedChat = Awaited<ReturnType<AccessHost["start"]>>;
  export type Destination = Readonly<{
    workspace: Workspace | null;
    defaultWorkspace(): Promise<Workspace | null>;
  }>;
  export type View = Readonly<{
    effort: NativeChatEffort;
    speed: Exclude<NativeChatSpeed, "standard"> | undefined;
    turnCapabilities: NativeChatTurnCapabilities | null;
    automaticReviewAvailable: boolean;
    permissionMode: NativeChatPermissionMode;
    permissionReview: PermissionReviewProject | null;
    permissionBusy: boolean;
    permissionError: string | null;
    plan: boolean;
    goal: boolean;
    attachments: AttachmentBatch.Draft;
    notice: string | null;
    busy: boolean;
    /** The draft key whose interrupted send has been reconciled. */
    draftKey: string | null;
    /** The workspace chat owns message presentation. */
    outgoing:
      | Readonly<{ status: "opening" }>
      | Readonly<{
          status: "failed";
          error: string;
          retryable: boolean;
          handedOff: boolean;
        }>
      | null;
  }>;
  export type Input = Readonly<{
    text: string;
    prompt: string;
    profileId: string | null;
    target: Workspace | null;
    references: readonly { title: string; url: string }[];
    messageContext?: WelcomeMessage["messageContext"];
    template?: Template;
  }>;
  export type DraftSource = Readonly<{
    store: ComposerDrafts;
    key: string;
    /** The open editor's document, or undefined after it unmounts. */
    read(): unknown;
  }>;
  export type Template = Readonly<{
    name: string;
    copy(workspaceId: string): Promise<WelcomeTemplate>;
  }>;
  export type Host = Readonly<{
    defaultWorkspace(): Promise<Workspace | null>;
    stash(workspaceId: string, message: WelcomeMessage): boolean;
    open(workspace: Workspace): void;
  }>;
}
