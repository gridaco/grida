import {
  parseNativeChatMessageContext,
  type DesktopNativeChat,
  type NativeChatEffort,
  type NativeChatPermissionMode,
  type NativeChatPermissionReview,
} from "@grida/desktop-bridge";
import { ComposerDrafts } from "@/lib/agent-chat/composer-drafts";
import { image_attachment_preview } from "@/lib/agent-chat/image-attachment-preview";
import type { ComposerTransfer } from "@/kits/composer";
import type { PermissionReviewProject } from "../shared/agent-permission-confirmation";
import type { Workspace } from "@/lib/desktop/bridge";
import { slidesTemplateMessageContext } from "@/lib/desktop/slides-message-context";
import {
  welcome_message,
  type WelcomeMessage,
  type WelcomeTemplate,
} from "@/lib/desktop/welcome-message";

/** Unsent intent and the review required before opening a Full access chat. */
export class HomeComposer {
  static readonly key = "desktop-home";
  private static readonly drafts = new ComposerDrafts();
  private listeners = new Set<() => void>();
  private attachmentRevision = 0;
  private restoration?: Promise<void>;
  private effortChosen = false;
  private effortInitialized = false;
  private permissionDecision?: PromiseWithResolvers<boolean>;
  private approvedAccess?: Readonly<{
    host: HomeComposer.FullAccess;
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
  private view: HomeComposer.View;

  constructor(readonly drafts = HomeComposer.drafts) {
    const modes = drafts.readModes(HomeComposer.key);
    this.view = {
      effort: "standard",
      permissionMode: "restricted",
      permissionReview: null,
      permissionBusy: false,
      permissionError: null,
      plan: !!modes.plan,
      goal: !!modes.goal,
      attachment: null,
      notice: null,
      busy: false,
    };
  }

  read = (): HomeComposer.View => this.view;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Relative workspace mentions must never follow a different destination. */
  draftFor(destination: string): { key: string; store: ComposerDrafts } {
    return { key: `${HomeComposer.key}:${destination}`, store: this.drafts };
  }

  restore(): Promise<void> {
    return (this.restoration ??= this.restoreAttachment());
  }

  private async restoreAttachment(): Promise<void> {
    const revision = this.attachmentRevision;
    const stored = await this.drafts.readAttachment(HomeComposer.key);
    if (!stored || revision !== this.attachmentRevision) return;
    const file =
      stored.kind === "image" || stored.kind === "reference"
        ? stored.file
        : new File([stored.bytes], stored.name, {
            type: stored.kind === "png" ? "image/png" : "",
          });
    this.update({
      goal: false,
      attachment: {
        kind:
          stored.kind === "reference" && stored.mimeType === "inode/directory"
            ? "directory"
            : "file",
        file,
      },
    });
  }

  selectEffort = (effort: NativeChatEffort): void => {
    if (this.view.busy) return;
    this.effortChosen = true;
    this.update({ effort });
  };

  selectPermissionMode = (
    mode: NativeChatPermissionMode,
    destination: HomeComposer.Destination,
    host: HomeComposer.FullAccess | undefined
  ): void => {
    if (this.view.busy || this.view.permissionBusy) return;
    if (mode === "restricted") {
      this.resetPermissionMode();
      return;
    }
    if (!host || this.approvedAccess) return;
    const decision = Promise.withResolvers<boolean>();
    this.permissionDecision = decision;
    this.update({
      permissionReview: {
        workspaceName: destination.workspace?.name ?? "your default project",
        workspaceId: destination.workspace?.id,
      },
      permissionBusy: true,
      permissionError: null,
    });
    void this.reviewFullAccess(destination, host, decision);
  };

  answerPermissionReview = (confirmed: boolean): void => {
    if (!this.view.permissionReview) return;
    if (!confirmed) {
      this.resetPermissionMode();
      return;
    }
    this.permissionDecision?.resolve(true);
    this.update({ permissionReview: null });
  };

  resetPermissionMode = (): void => {
    this.permissionDecision?.resolve(false);
    this.permissionDecision = undefined;
    const approval = this.approvedAccess;
    this.approvedAccess = undefined;
    if (approval && !approval.prepared)
      void approval.host.answer(approval.reviewId, false).catch(() => {});
    if (
      this.view.permissionBusy ||
      this.view.permissionError ||
      this.view.permissionMode !== "restricted"
    ) {
      this.update({
        permissionMode: "restricted",
        permissionReview: null,
        permissionBusy: false,
        permissionError: null,
      });
    }
  };

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
    if (goal && this.view.attachment) {
      this.update({
        notice: "Send or remove the attachment before starting a goal.",
      });
      return;
    }
    this.update({ goal, notice: null });
    this.saveModes();
  };

  transfer = ({
    resources,
  }: Pick<ComposerTransfer.Event, "resources">): void => {
    if (this.view.busy || !resources.length) return;
    if (resources.length !== 1) {
      this.update({ notice: "Attach one file at a time." });
      return;
    }
    if (this.view.goal) {
      this.update({ notice: "Remove the goal intent to attach a file." });
      return;
    }
    const resource = resources[0];
    this.attachmentRevision++;
    this.update({ attachment: resource, notice: null });
    const image =
      resource.kind === "file" &&
      /^image\/(png|jpeg|webp|gif)$/.test(resource.file.type);
    void this.drafts.writeAttachment(
      HomeComposer.key,
      image
        ? { kind: "image", name: resource.file.name, file: resource.file }
        : {
            kind: "reference",
            name: resource.file.name,
            file: resource.file,
            mimeType:
              resource.kind === "directory"
                ? "inode/directory"
                : resource.file.type,
          }
    );
  };

  removeAttachment = (): void => {
    if (!this.view.busy) this.clearAttachment();
  };

  private clearAttachment(): void {
    this.attachmentRevision++;
    this.update({ attachment: null, notice: null });
    void this.drafts.writeAttachment(HomeComposer.key, null);
  }

  private async reviewFullAccess(
    destination: HomeComposer.Destination,
    host: HomeComposer.FullAccess,
    decision: PromiseWithResolvers<boolean>
  ): Promise<void> {
    let review: NativeChatPermissionReview | undefined;
    try {
      const workspace =
        destination.workspace ?? (await destination.defaultWorkspace());
      if (this.permissionDecision !== decision) return;
      if (!workspace) throw new Error("No default workspace available.");
      review = await host.prepare(workspace.id);
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
        host,
        reviewId: review.reviewId,
        workspaceId: workspace.id,
      };
      this.update({ permissionMode: "full_access" });
    } catch {
      if (this.permissionDecision === decision)
        this.update({
          permissionError: "Couldn't enable Full access for this project.",
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
      this.resetPermissionMode();
      throw new Error("Choose Full access again for this project.");
    }
    const previous = approval.request;
    if (
      previous &&
      (previous.profileId !== request.profileId ||
        (this.effortChosen && previous.effort !== request.effort))
    )
      throw new Error(
        "Restore the model and effort used to prepare this Full access chat, or choose Default to start a different chat."
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
          "Couldn't confirm Full access yet. Send again to check the same chat.",
          { cause }
        );
      if (this.approvedAccess === attempt) this.resetPermissionMode();
      throw new Error(
        "Couldn't start the Full access chat. Your draft is still here.",
        { cause }
      );
    }
    if (this.approvedAccess !== attempt)
      throw new Error(
        "Full access approval changed. Your draft is still here."
      );
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

  /** Prepare one first request before navigating; failures retain the staged draft. */
  async submit(
    input: HomeComposer.Input,
    host: HomeComposer.Host
  ): Promise<void> {
    if (this.view.busy) throw new Error("A workspace is already opening.");
    if (this.view.permissionBusy)
      throw new Error("Full access is still being reviewed.");
    this.update({ busy: true, permissionError: null });
    let opened = false;
    try {
      await this.restore();
      if (
        input.messageContext &&
        !parseNativeChatMessageContext(input.messageContext)
      )
        throw new Error(
          "The selected references are too large to send together. Remove some and try again."
        );
      const intent = this.view;
      const workspace = input.target ?? (await host.defaultWorkspace());
      if (!workspace)
        throw new Error("No default workspace available on this host.");
      const hasRequest =
        !!input.text.trim() ||
        !!input.template ||
        input.references.length > 0 ||
        !!input.messageContext?.displayParts.length ||
        !!intent.attachment;
      if (hasRequest) {
        const contextRequested = input.messageContext || input.template;
        if (contextRequested && intent.goal && !input.text.trim())
          throw new Error("Write an objective before starting a goal.");
        if (
          contextRequested &&
          intent.attachment &&
          !input.text.trim() &&
          (intent.attachment.kind === "directory" ||
            !image_attachment_preview.selectedMediaType(intent.attachment.file))
        )
          throw new Error(
            "Write a message to send this attachment with the selected context."
          );
        const effort =
          this.effortChosen || this.effortInitialized
            ? intent.effort
            : undefined;
        const accessRequest =
          intent.permissionMode === "full_access"
            ? {
                workspaceId: workspace.id,
                profileId: input.profileId,
                ...(effort && { effort }),
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
            }) ?? "Inspect the attached file.");
        const prepared =
          accessRequest && (await this.startApprovedChat(accessRequest));
        if (
          !host.stash(workspace.id, {
            text,
            ...(messageContext && { messageContext }),
            profileId: prepared ? prepared.profileId : input.profileId,
            ...(prepared
              ? { preparedSessionId: prepared.sessionId }
              : effort && { effort }),
            operatingRegime: intent.plan ? "plan" : "act",
            goal: intent.goal,
            ...(intent.attachment && { attachment: intent.attachment }),
          })
        )
          throw new Error("Couldn't keep your message for the workspace.");
      }
      host.open(workspace);
      opened = true;
      this.accepted();
    } finally {
      if (!opened) this.update({ busy: false });
    }
  }

  /** The workspace now owns the handed-off request. */
  accepted(): void {
    this.copiedTemplate = undefined;
    this.clearAttachment();
    this.resetPermissionMode();
    this.update({ plan: false, goal: false });
    this.saveModes();
  }

  private saveModes(): void {
    this.drafts.writeModes(HomeComposer.key, {
      ...(this.view.plan && { plan: true }),
      ...(this.view.goal && { goal: true }),
    });
  }
  private update(patch: Partial<HomeComposer.View>): void {
    this.view = { ...this.view, ...patch };
    this.listeners.forEach((listener) => listener());
  }
}

export namespace HomeComposer {
  export type Attachment = Readonly<{ kind: "file" | "directory"; file: File }>;
  export type FullAccess = Readonly<{
    prepare: NonNullable<DesktopNativeChat["prepareWelcomeFullAccess"]>;
    answer: NonNullable<DesktopNativeChat["answerWelcomeFullAccess"]>;
    start: NonNullable<DesktopNativeChat["startWelcomeFullAccess"]>;
  }>;
  export type AccessRequest = Parameters<FullAccess["start"]>[1];
  export type PreparedChat = Awaited<ReturnType<FullAccess["start"]>>;
  export type Destination = Readonly<{
    workspace: Workspace | null;
    defaultWorkspace(): Promise<Workspace | null>;
  }>;
  export type View = Readonly<{
    effort: NativeChatEffort;
    permissionMode: NativeChatPermissionMode;
    permissionReview: PermissionReviewProject | null;
    permissionBusy: boolean;
    permissionError: string | null;
    plan: boolean;
    goal: boolean;
    attachment: Attachment | null;
    notice: string | null;
    busy: boolean;
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
