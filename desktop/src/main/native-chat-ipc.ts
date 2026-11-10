// GRIDA-SEC-004 — native chat attachments and delivery belong to the admitted frame.
import { randomUUID } from "node:crypto";
import type { IpcMainInvokeEvent, WebContents, WebFrameMain } from "electron";
import type {
  NativeChatAcceptance,
  NativeChatAttachment,
  NativeChatApproval,
  NativeChatCatalogEntry,
  NativeChatCommand,
  NativeChatCommandResult,
  NativeChatConfigurationInput,
  NativeChatControlReceipt,
  NativeChatGoalObservation,
  NativeChatGoalReceipt,
  NativeChatImageArtifact,
  NativeChatArtifactSaveResult,
  NativeChatControlResult,
  NativeChatObservation,
  NativeChatOperatingRegime,
  NativeChatPage,
  NativeChatQuestion,
  NativeChatQuestionAnswer,
  NativeChatQueueChange,
  NativeChatQueuePage,
  NativeChatQueueReceipt,
  NativeChatReadiness,
  NativeChatRevisionReceipt,
  NativeChatRevisionTarget,
  NativeChatSideAnswer,
  NativeChatSideContext,
  NativeChatSnapshot,
  NativeChatTurnSummary,
  NativeChatUpdate,
  NativeChatWakeup,
  NativeContextLimit,
  NativeContextLimitResult,
} from "@grida/desktop-bridge";
import { IPC_CHANNELS } from "../bridge/contract";
import { ipc_sender } from "./ipc-sender";
import type {
  NativeAgentChat,
  NativeChatSession,
  NativeQuestionReview,
} from "./native-agent-chat";
import type { NativeApprovalReview } from "./native-agent-permissions";
import type { NativeGoalInspection } from "./native-agent-goals";
import type { NativeSideChat } from "./native-agent-side-chats";
import {
  contextLimitValue,
  type ContextLimitBasis,
} from "./native-agent-configuration";
import { NativeAgentDeletion } from "./native-agent-deletion";
import { NativeAgentWakeups } from "./native-agent-wakeups";
import { NativeAgentArtifactSave } from "./native-agent-artifact-save";

const MAX_ATTACHMENTS = 16;
const MAX_OBSERVATIONS = 16;
const MAX_REVIEWS = 16;
const MAX_SUBSCRIPTIONS = 8;
const MAX_UPDATE_BYTES = 8 * 1024;
const MAX_DELIVERY_BYTES = 1024 * 1024;
const MAX_DELIVERY_CHUNKS = 4096;
const MAX_CONFIGURATION_MESSAGE_BYTES = 1024;
const TOKEN = /^[a-f0-9-]{36}$/;

export type ActiveNativeChat = Readonly<{
  workspaceId: string;
  chat: Pick<
    NativeAgentChat,
    | "list"
    | "catalogEntry"
    | "organize"
    | "create"
    | "load"
    | "openSideChat"
    | "askSideChat"
    | "closeSideChat"
    | "submit"
    | "enqueue"
    | "acceptsPng"
    | "submitImage"
    | "inspectContextLimit"
    | "updateContextLimit"
    | "sendConfiguration"
    | "inputReceipt"
    | "observe"
    | "turnSummary"
    | "queue"
    | "queuedText"
    | "editQueue"
    | "steer"
    | "goal"
    | "startGoal"
    | "controlGoal"
    | "approvals"
    | "answerApproval"
    | "questions"
    | "answerQuestion"
    | "transcript"
    | "pause"
    | "stop"
    | "resume"
    | "subscribe"
  > &
    Partial<
      Pick<
        NativeAgentChat,
        | "acceptsSavedChatDeletion"
        | "deleteSavedChat"
        | "ownsSession"
        | "commands"
        | "runCommand"
        | "prepareRevision"
        | "revise"
        | "readArtifact"
        | "acceptsWakeups"
        | "submitWithWakeup"
        | "scheduledWakeup"
        | "controlWakeup"
      >
    >;
}>;

type Attachment = {
  id: string;
  session: NativeChatSession;
  latestObservation?: NativeChatSnapshot;
  observations: Map<string, NativeChatSnapshot>;
  approvals: Map<string, NativeApprovalReview>;
  questions: Map<string, NativeQuestionReview>;
  goals: Map<string, NativeGoalInspection>;
  artifacts?: { turnId: string; items: readonly NativeChatImageArtifact[] };
  readingArtifact?: boolean;
  deletion?: ReviewedDeletion;
  side?: SideAttachment;
  reviewedConfiguration?: {
    input: NativeChatConfigurationInput;
    approved: boolean;
    request?: Promise<NativeChatAcceptance>;
    accepted?: NativeChatAcceptance;
  };
  closingSide?: Promise<void>;
};

type ReviewedDeletion = {
  requestId: string;
  snapshot: NativeChatSnapshot;
  catalogRevision: number;
};

type SideAttachment = {
  openId: string;
  nativeRequestId: string;
  opening?: Promise<NativeSideChat>;
  chat?: NativeSideChat;
  unconfirmed: boolean;
};

type Subscription = { attachment: Attachment; stop(): void };

type Owner = {
  sender: WebContents;
  frame: WebFrameMain;
  active: ActiveNativeChat;
  attachments: Map<string, Attachment>;
  retired: Set<string>;
  subscriptions: Map<string, Subscription>;
  pending: number;
  listing: boolean;
  reviewingConfiguration?: boolean;
  contextLimit?: {
    id: string;
    basis: ContextLimitBasis;
    write?: { limit: number | null; result: Promise<NativeContextLimitResult> };
  };
  release(): void;
};

export type ConfigurationReview =
  | { kind: "limit"; limit: number | null }
  | { kind: "message"; text: string };

type Startup = {
  frame: WebFrameMain;
  workspaceId: string;
  result: Promise<NativeChatReadiness>;
  release(): void;
};

export class NativeChatIpc {
  private readonly owners = new Map<WebContents, Owner>();
  private readonly startups = new WeakMap<WebContents, Startup>();
  private readonly deleting = new WeakSet<NativeChatSession>();
  private readonly savingArtifact = new WeakSet<WebContents>();

  constructor(
    private readonly editorOrigin: string,
    private readonly resolve: (
      sender: WebContents,
      workspaceId: string
    ) => ActiveNativeChat | null,
    private readonly startup?: {
      admits(sender: WebContents): boolean;
      ensure(workspaceId: string): Promise<void>;
    },
    private readonly confirmConfiguration?: (
      sender: WebContents,
      review: ConfigurationReview
    ) => Promise<boolean>,
    private readonly confirmDeletion?: (
      sender: WebContents,
      title: string | null
    ) => Promise<boolean>,
    private readonly selectArtifactDestination?: (
      sender: WebContents
    ) => Promise<string | null>
  ) {}

  available(event: IpcMainInvokeEvent): boolean | Promise<boolean> {
    if (!this.startup)
      return this.scope(event.sender, event.senderFrame) !== null;
    return this.status(event, true).then((state) => {
      if (state !== "native-ready") throw new Error("native_chat_unavailable");
      return true;
    });
  }

  async status(
    { sender, senderFrame: frame }: IpcMainInvokeEvent,
    start = false
  ): Promise<NativeChatReadiness> {
    if (typeof start !== "boolean")
      throw new Error("native_chat_start_invalid");
    const workspaceId = this.workspaceId(sender, frame);
    if (!frame || !workspaceId) throw new Error("native_chat_scope_changed");
    if (this.resolve(sender, workspaceId)?.workspaceId === workspaceId)
      return "native-ready";
    const startup = this.startup;
    if (!startup) return "legacy";
    if (!start) return "native-starting";

    const existing = this.startups.get(sender);
    if (existing?.frame === frame && existing.workspaceId === workspaceId)
      return existing.result;
    existing?.release();

    const requireCurrent = () => {
      if (
        this.startups.get(sender) !== pending ||
        this.workspaceId(sender, frame) !== workspaceId
      )
        throw new Error("native_chat_scope_changed");
    };
    const release = () => {
      if (this.startups.get(sender) === pending) this.startups.delete(sender);
      stopWatching();
    };
    const stopWatching = watchNavigation(sender, release);
    const pending: Startup = {
      frame,
      workspaceId,
      release,
      result: Promise.resolve()
        .then(async () => {
          requireCurrent();
          try {
            await startup.ensure(workspaceId);
          } catch {
            requireCurrent();
            return "native-unavailable";
          }
          requireCurrent();
          return this.resolve(sender, workspaceId)?.workspaceId === workspaceId
            ? "native-ready"
            : "native-unavailable";
        })
        .finally(release),
    };
    this.startups.set(sender, pending);
    return pending.result;
  }

  async list(
    event: IpcMainInvokeEvent,
    cursor?: string | null,
    archived = false
  ): Promise<NativeChatPage> {
    const owner = this.owner(event);
    if (owner.listing) throw new Error("native_chat_catalog_busy");
    owner.listing = true;
    try {
      const page = archived
        ? await owner.active.chat.list(cursor, true)
        : await owner.active.chat.list(cursor);
      this.revalidate(owner);
      return page;
    } finally {
      owner.listing = false;
    }
  }

  create(event: IpcMainInvokeEvent): Promise<NativeChatAttachment> {
    return this.attach(event, (chat) => chat.create());
  }

  load(
    event: IpcMainInvokeEvent,
    sessionId: string
  ): Promise<NativeChatAttachment> {
    return this.attach(event, (chat) => chat.load(sessionId));
  }

  commands(
    event: IpcMainInvokeEvent,
    attachmentId: string
  ): readonly NativeChatCommand[] {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    return owner.active.chat.commands?.(attachment.session) ?? [];
  }

  async runCommand(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    command: unknown,
    requestId: unknown
  ): Promise<NativeChatCommandResult> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    if ((command !== "compact" && command !== "fork") || !token(requestId))
      throw new Error("native_chat_command_invalid");
    const chat = owner.active.chat;
    if (!chat.runCommand) throw new Error("native_chat_command_unavailable");
    const result = await chat.runCommand(
      attachment.session,
      command,
      requestId,
      () => this.revalidate(owner, attachment)
    );
    this.revalidate(owner, attachment);
    return result;
  }

  prepareRevision(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    observationId: unknown,
    messageId: unknown
  ): Promise<NativeChatRevisionTarget> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const snapshot = requireObservation(attachment, observationId);
    const chat = owner.active.chat;
    if (!chat.prepareRevision || typeof messageId !== "string")
      throw new Error("native_chat_revision_unavailable");
    return chat.prepareRevision(
      attachment,
      attachment.session,
      snapshot,
      messageId,
      (expected) => this.revalidateRevision(owner, attachment, expected)
    );
  }

  revise(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    value: unknown
  ): Promise<NativeChatRevisionReceipt> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const chat = owner.active.chat;
    const input = record(value);
    if (
      !chat.revise ||
      !input ||
      Object.keys(input).length !== 3 ||
      !token(input.reviewId) ||
      typeof input.text !== "string" ||
      (input.operatingRegime !== "act" && input.operatingRegime !== "plan")
    )
      throw new Error("native_chat_revision_unavailable");
    return chat.revise(
      attachment,
      attachment.session,
      {
        reviewId: input.reviewId,
        text: input.text,
        operatingRegime: input.operatingRegime,
      },
      (expected) => this.revalidateRevision(owner, attachment, expected)
    );
  }

  async catalogEntry(
    event: IpcMainInvokeEvent,
    attachmentId: string
  ): Promise<NativeChatCatalogEntry> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const entry = await owner.active.chat.catalogEntry(attachment.session);
    this.revalidate(owner, attachment);
    return this.deletableEntry(owner, entry);
  }

  async organize(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    change: unknown
  ): Promise<NativeChatCatalogEntry> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const entry = await owner.active.chat.organize(attachment.session, change);
    this.revalidate(owner, attachment);
    return this.deletableEntry(owner, entry);
  }

  async deleteSavedChat(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    observationId: unknown,
    catalogRevision: unknown
  ): Promise<boolean> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const chat = owner.active.chat;
    const session = attachment.session;
    const confirm = this.confirmDeletion;
    if (!confirm || !chat.acceptsSavedChatDeletion || !chat.deleteSavedChat)
      throw new Error("native_chat_deletion_unavailable");
    if (
      !token(observationId) ||
      typeof catalogRevision !== "number" ||
      !Number.isSafeInteger(catalogRevision) ||
      catalogRevision < 0
    )
      throw new Error("native_chat_deletion_invalid");
    if (this.deleting.has(session))
      throw new Error("native_chat_deletion_in_progress");
    this.deleting.add(session);
    try {
      let reviewed = attachment.deletion;
      const retry = !!reviewed;
      if (!reviewed) {
        const snapshot = requireObservation(attachment, observationId);
        if (snapshot.current || snapshot.queuedInputs)
          throw new Error("session_deletion_requires_idle");
        const entry = await chat.catalogEntry(session);
        this.revalidate(owner, attachment);
        if (
          entry.sessionId !== session.id ||
          entry.revision !== catalogRevision
        )
          throw new Error("session_catalog_revision_changed");
        const confirmed = await confirm(owner.sender, entry.title);
        this.revalidate(owner, attachment);
        if (!confirmed) return false;
        reviewed = { requestId: randomUUID(), snapshot, catalogRevision };
        attachment.deletion = reviewed;
      }
      try {
        await chat.deleteSavedChat(
          session,
          reviewed.snapshot,
          reviewed.catalogRevision,
          reviewed.requestId
        );
      } catch (error) {
        const pending =
          retry &&
          error instanceof Error &&
          (error.message === "session_deletion_in_progress" ||
            error.message === "session_deletion_observation_in_progress");
        if (!pending && !NativeAgentDeletion.isUnverified(error))
          attachment.deletion = undefined;
        throw error;
      }
      this.retireAttachments(owner.active, session);
      this.revalidate(owner);
      return true;
    } finally {
      this.deleting.delete(session);
    }
  }

  async openSideChat(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    openId: string
  ): Promise<NativeChatSideContext> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    if (
      !token(openId) ||
      attachment.closingSide ||
      (attachment.side && attachment.side.openId !== openId)
    )
      throw new Error("native_chat_side_open_unavailable");
    const side = (attachment.side ??= {
      openId,
      nativeRequestId: `side/${attachment.id}/${openId}`,
      unconfirmed: false,
    });
    const chat =
      side.chat ??
      (await (side.opening ??= owner.active.chat
        .openSideChat(attachment.session, side.nativeRequestId)
        .then((opened) => {
          side.chat = opened;
          side.unconfirmed = false;
          return opened;
        })
        .catch((error: unknown) => {
          side.opening = undefined;
          side.unconfirmed ||=
            error instanceof Error &&
            error.message === "native_agent_request_timeout";
          throw error;
        })));
    this.revalidate(owner, attachment);
    if (attachment.side !== side)
      throw new Error("native_chat_side_unavailable");
    return chat.context;
  }

  async askSideChat(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    openId: string,
    requestId: string,
    text: string
  ): Promise<NativeChatSideAnswer> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const side = attachment.side;
    if (!side?.chat || side.openId !== openId || !token(requestId))
      throw new Error("native_chat_side_unavailable");
    const answer = await owner.active.chat.askSideChat(
      attachment.session,
      side.chat,
      requestId,
      text
    );
    this.revalidate(owner, attachment);
    if (attachment.side !== side)
      throw new Error("native_chat_side_unavailable");
    return answer;
  }

  async closeSideChat(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    openId: string
  ): Promise<void> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    if (
      !token(openId) ||
      (attachment.side && attachment.side.openId !== openId)
    )
      throw new Error("native_chat_side_unavailable");
    await this.releaseSide(owner, attachment);
    this.revalidate(owner, attachment);
  }

  detach(event: IpcMainInvokeEvent, attachmentId: string): void {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    owner.attachments.delete(attachment.id);
    void this.releaseSide(owner, attachment).catch(() => {});
    for (const [id, subscription] of owner.subscriptions) {
      if (subscription.attachment === attachment)
        this.unsubscribeOwned(owner, id);
    }
  }

  async submit(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    inputId: string,
    text: string,
    regime?: unknown
  ) {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const result = await owner.active.chat.submit(
      attachment.session,
      inputId,
      text,
      operatingRegime(regime)
    );
    this.revalidate(owner, attachment);
    return result;
  }

  async enqueue(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    inputId: string,
    text: string,
    regime?: unknown
  ) {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const result = await owner.active.chat.enqueue(
      attachment.session,
      inputId,
      text,
      operatingRegime(regime)
    );
    this.revalidate(owner, attachment);
    return result;
  }

  acceptsWakeups(event: IpcMainInvokeEvent): boolean {
    return this.owner(event).active.chat.acceptsWakeups === true;
  }

  async submitWithWakeup(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    inputId: string,
    text: string
  ): Promise<NativeChatAcceptance> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const chat = owner.active.chat;
    if (!chat.acceptsWakeups || !chat.submitWithWakeup)
      throw new Error("native_chat_wakeup_unavailable");
    const result = await chat.submitWithWakeup(
      attachment.session,
      inputId,
      text
    );
    this.revalidate(owner, attachment);
    return result;
  }

  async scheduledWakeup(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    observationId: string
  ): Promise<NativeChatWakeup | null> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const snapshot = requireObservation(attachment, observationId);
    const chat = owner.active.chat;
    if (!chat.acceptsWakeups || !chat.scheduledWakeup) return null;
    const selected = NativeAgentWakeups.turn(snapshot);
    if (!selected) return null;
    const requireCurrent = () => {
      const latest = attachment.latestObservation;
      if (
        !latest ||
        NativeAgentWakeups.turn(latest)?.turnId !== selected.turnId
      )
        throw new Error("native_chat_wakeup_changed");
    };
    requireCurrent();
    const result = await chat.scheduledWakeup(attachment.session, snapshot);
    this.revalidate(owner, attachment);
    requireCurrent();
    return result;
  }

  async controlWakeup(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    observationId: string,
    waitId: unknown,
    action: unknown
  ): Promise<NativeChatWakeup> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const snapshot = requireObservation(attachment, observationId);
    const chat = owner.active.chat;
    const turn = snapshot.current;
    const requireCurrent = () => {
      const latest = attachment.latestObservation?.current;
      if (!turn || latest?.turnId !== turn.turnId || latest.cancelled)
        throw new Error("native_chat_wakeup_changed");
    };
    if (
      !chat.acceptsWakeups ||
      !chat.scheduledWakeup ||
      !chat.controlWakeup ||
      typeof waitId !== "string" ||
      (action !== "cancel" && action !== "recover")
    )
      throw new Error("native_chat_wakeup_unavailable");
    requireCurrent();
    const schedule = await chat.scheduledWakeup(attachment.session, snapshot);
    this.revalidate(owner, attachment);
    requireCurrent();
    if (schedule?.waitId !== waitId)
      throw new Error("native_chat_wakeup_changed");
    const updated = await chat.controlWakeup(
      attachment.session,
      snapshot,
      waitId,
      action
    );
    this.revalidate(owner, attachment);
    return updated;
  }

  async inputReceipt(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    inputId: string
  ) {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const result = await owner.active.chat.inputReceipt(
      attachment.session,
      inputId
    );
    this.revalidate(owner, attachment);
    return result;
  }

  acceptsPng(event: IpcMainInvokeEvent): boolean {
    return this.owner(event).active.chat.acceptsPng;
  }

  async contextLimit(event: IpcMainInvokeEvent): Promise<NativeContextLimit> {
    const owner = this.owner(event);
    const basis = await owner.active.chat.inspectContextLimit();
    this.revalidate(owner);
    const reviewId = randomUUID();
    owner.contextLimit = { id: reviewId, basis };
    return {
      reviewId,
      limit: basis.limit,
      exactCounting: basis.exactCounting,
      source: basis.source,
    };
  }

  async saveContextLimit(
    event: IpcMainInvokeEvent,
    reviewId: unknown,
    value: unknown
  ): Promise<NativeContextLimitResult> {
    const owner = this.owner(event);
    const inspected = owner.contextLimit;
    const limit = contextLimitValue(value);
    if (!inspected || inspected.id !== reviewId)
      throw new Error("native_context_limit_review_unavailable");
    if (inspected.write) {
      if (inspected.write.limit !== limit)
        throw new Error("native_context_limit_review_reused");
      return inspected.write.result;
    }
    if (
      inspected.basis.source === "invalid" ||
      (limit !== null && !inspected.basis.exactCounting)
    )
      throw new Error("native_context_limit_unavailable");
    const result = (async (): Promise<NativeContextLimitResult> => {
      await this.reviewConfiguration(owner, { kind: "limit", limit });
      this.revalidate(owner);
      if (owner.contextLimit !== inspected)
        throw new Error("native_context_limit_review_unavailable");
      try {
        await owner.active.chat.updateContextLimit(inspected.basis, limit);
        this.revalidate(owner);
        return { limit, disposition: "applied" };
      } catch (error) {
        this.revalidate(owner);
        if (
          !(error instanceof Error) ||
          error.message !== "native_agent_request_timeout"
        )
          throw error;
        const current = await owner.active.chat.inspectContextLimit();
        this.revalidate(owner);
        if (current.source === "active" && current.limit === limit)
          return { limit, disposition: "observed" };
        throw error;
      }
    })();
    inspected.write = { limit, result };
    void result.catch(() => {
      inspected.write = undefined;
    });
    return result;
  }

  async submitWithConfigurationReview(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    value: unknown
  ): Promise<NativeChatAcceptance> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const input = configurationInput(value);
    let review = attachment.reviewedConfiguration;
    if (review?.input.inputId === input.inputId) {
      if (
        review.input.text !== input.text ||
        review.input.action !== input.action
      )
        throw new Error("native_context_limit_review_reused");
      if (review.accepted) return review.accepted;
      if (review.request) return review.request;
    } else {
      if (review?.request) throw new Error("native_context_limit_review_busy");
      review = { input, approved: false };
      attachment.reviewedConfiguration = review;
    }
    const exact = review;
    exact.request = (async () => {
      if (!exact.approved) {
        const inspected = await owner.active.chat.inspectContextLimit();
        this.revalidate(owner, attachment);
        if (!inspected.exactCounting || inspected.source === "invalid")
          throw new Error("native_context_limit_unavailable");
        await this.reviewConfiguration(owner, {
          kind: "message",
          text: input.text,
        });
        this.revalidate(owner, attachment);
        exact.approved = true;
      }
      const accepted = await owner.active.chat.sendConfiguration(
        attachment.session,
        exact.input
      );
      this.revalidate(owner, attachment);
      exact.accepted = accepted;
      return accepted;
    })().finally(() => {
      exact.request = undefined;
    });
    return exact.request;
  }

  private async reviewConfiguration(
    owner: Owner,
    review: ConfigurationReview
  ): Promise<void> {
    if (!this.confirmConfiguration || owner.reviewingConfiguration)
      throw new Error("native_context_limit_review_busy");
    owner.reviewingConfiguration = true;
    try {
      if (!(await this.confirmConfiguration(owner.sender, review)))
        throw new Error("native_context_limit_review_declined");
    } finally {
      owner.reviewingConfiguration = false;
    }
  }

  async submitImage(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    input: unknown
  ) {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const result = await owner.active.chat.submitImage(
      attachment.session,
      input
    );
    this.revalidate(owner, attachment);
    return result;
  }

  async observe(
    event: IpcMainInvokeEvent,
    attachmentId: string
  ): Promise<NativeChatObservation> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const snapshot = await owner.active.chat.observe(attachment.session);
    this.revalidate(owner, attachment);
    if (
      !attachment.latestObservation ||
      snapshot.sessionRevision >= attachment.latestObservation.sessionRevision
    )
      attachment.latestObservation = snapshot;
    for (const [id, observed] of attachment.observations) {
      if (sameBasis(snapshot, observed)) return { observationId: id, snapshot };
    }
    const oldest = attachment.observations.keys().next().value;
    if (oldest && attachment.observations.size >= MAX_OBSERVATIONS)
      attachment.observations.delete(oldest);
    const observationId = randomUUID();
    attachment.observations.set(observationId, snapshot);
    return { observationId, snapshot };
  }

  async turnSummary(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    observationId: string
  ): Promise<NativeChatTurnSummary> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const snapshot = requireObservation(attachment, observationId);
    const latest = snapshot.latest;
    if (
      latest?.disposition !== "settled" ||
      latest.status === null ||
      attachment.latestObservation?.latest?.turnId !== latest.turnId
    )
      throw new Error("native_chat_turn_summary_unavailable");
    const summary = await owner.active.chat.turnSummary(
      attachment.session,
      snapshot
    );
    this.revalidate(owner, attachment);
    if (attachment.latestObservation?.latest?.turnId !== latest.turnId)
      throw new Error("native_chat_turn_summary_unavailable");
    attachment.artifacts = summary.artifacts?.length
      ? { turnId: latest.turnId, items: summary.artifacts }
      : undefined;
    return summary;
  }

  async readArtifact(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    observationId: string,
    artifactId: unknown
  ): Promise<ArrayBuffer> {
    return this.captureArtifact(
      event,
      attachmentId,
      observationId,
      artifactId
    ).read();
  }

  async saveArtifact(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    observationId: string,
    artifactId: unknown
  ): Promise<NativeChatArtifactSaveResult> {
    const select = this.selectArtifactDestination;
    if (!select) throw new Error("native_chat_artifact_unavailable");
    const { owner, requireCurrent, read } = this.captureArtifact(
      event,
      attachmentId,
      observationId,
      artifactId
    );
    const { sender } = owner;
    if (this.savingArtifact.has(sender))
      throw new Error("native_chat_artifact_busy");
    this.savingArtifact.add(sender);
    try {
      const destination = await select(sender).catch(() => undefined);
      requireCurrent();
      if (destination === undefined) return "failed";
      if (destination === null) return "cancelled";
      const bytes = await read();
      try {
        await NativeAgentArtifactSave.publish(
          destination,
          bytes,
          requireCurrent
        );
        return "saved";
      } catch {
        requireCurrent();
        return "failed";
      }
    } finally {
      this.savingArtifact.delete(sender);
    }
  }

  private captureArtifact(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    observationId: string,
    artifactId: unknown
  ) {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const snapshot = requireObservation(attachment, observationId);
    const turnId = snapshot.latest?.turnId;
    const projection = attachment.artifacts;
    const chat = owner.active.chat;
    const read = chat.readArtifact;
    const artifact = projection?.items.find((item) => item.id === artifactId);
    if (
      !read ||
      !artifact ||
      !turnId ||
      snapshot.current ||
      projection?.turnId !== turnId
    )
      throw new Error("native_chat_artifact_unavailable");
    const requireCurrent = () => {
      this.revalidate(owner, attachment);
      if (
        attachment.latestObservation?.current ||
        attachment.latestObservation?.latest?.turnId !== turnId
      )
        throw new Error("native_chat_artifact_unavailable");
    };
    requireCurrent();
    return {
      owner,
      requireCurrent,
      read: async () => {
        if (attachment.readingArtifact)
          throw new Error("native_chat_artifact_busy");
        attachment.readingArtifact = true;
        try {
          const bytes = await read.call(
            chat,
            attachment.session,
            snapshot,
            artifact
          );
          requireCurrent();
          return bytes;
        } finally {
          attachment.readingArtifact = false;
        }
      },
    };
  }

  async transcript(event: IpcMainInvokeEvent, attachmentId: string) {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const messages = await owner.active.chat.transcript(attachment.session);
    this.revalidate(owner, attachment);
    return messages;
  }

  async queue(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    observationId: string,
    offset: number
  ): Promise<NativeChatQueuePage> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const snapshot = requireObservation(attachment, observationId);
    const page = await owner.active.chat.queue(
      attachment.session,
      snapshot,
      offset
    );
    this.revalidate(owner, attachment);
    return page;
  }

  async queuedText(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    observationId: string,
    inputId: string
  ): Promise<string> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const snapshot = requireObservation(attachment, observationId);
    const text = await owner.active.chat.queuedText(
      attachment.session,
      snapshot,
      inputId
    );
    this.revalidate(owner, attachment);
    return text;
  }

  async editQueue(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    input: unknown
  ): Promise<NativeChatQueueReceipt> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const change = queueChange(input);
    const snapshot = requireObservation(attachment, change.observationId);
    const receipt = await owner.active.chat.editQueue(
      attachment.session,
      snapshot,
      change,
      () => this.revalidate(owner, attachment)
    );
    this.revalidate(owner, attachment);
    return receipt;
  }

  async steer(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    input: unknown
  ): Promise<NativeChatControlReceipt> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const value = record(input);
    if (
      !value ||
      Object.keys(value).length !== 3 ||
      !token(value.observationId) ||
      typeof value.requestId !== "string" ||
      typeof value.text !== "string"
    )
      throw new Error("native_chat_steering_invalid");
    const snapshot = requireObservation(attachment, value.observationId);
    const receipt = await owner.active.chat.steer(
      attachment.session,
      snapshot,
      {
        observationId: value.observationId,
        requestId: value.requestId,
        text: value.text,
      }
    );
    this.revalidate(owner, attachment);
    return receipt;
  }

  async goal(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    observationId: string
  ): Promise<NativeChatGoalObservation> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const snapshot = requireObservation(attachment, observationId);
    const inspection = await owner.active.chat.goal(
      attachment.session,
      snapshot
    );
    this.revalidate(owner, attachment);
    const token =
      inspection.goal &&
      retainReview(
        attachment.goals,
        inspection,
        (left, right) =>
          left.sessionId === right.sessionId &&
          left.sessionRevision === right.sessionRevision &&
          left.stateRevision === right.stateRevision &&
          left.basis?.goal === right.basis?.goal &&
          left.basis?.revision === right.basis?.revision
      );
    return { observationId: token, goal: inspection.goal };
  }

  async startGoal(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    inputId: string,
    request: unknown
  ) {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const accepted = await owner.active.chat.startGoal(
      attachment.session,
      inputId,
      request
    );
    this.revalidate(owner, attachment);
    return accepted;
  }

  async controlGoal(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    input: unknown
  ): Promise<NativeChatGoalReceipt> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const change = record(input);
    if (
      !change ||
      Object.keys(change).length !== 3 ||
      !token(change.observationId) ||
      typeof change.requestId !== "string" ||
      (change.action !== "pause" &&
        change.action !== "resume" &&
        change.action !== "clear")
    )
      throw new Error("native_chat_goal_control_invalid");
    const inspection = attachment.goals.get(change.observationId);
    if (!inspection)
      throw new Error("native_chat_goal_observation_unavailable");
    const receipt = await owner.active.chat.controlGoal(
      attachment.session,
      inspection,
      {
        observationId: change.observationId,
        requestId: change.requestId,
        action: change.action,
      }
    );
    this.revalidate(owner, attachment);
    return receipt;
  }

  async approvals(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    observationId: string
  ): Promise<readonly NativeChatApproval[]> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const snapshot = requireObservation(attachment, observationId);
    const reviews = await owner.active.chat.approvals(
      attachment.session,
      snapshot
    );
    this.revalidate(owner, attachment);
    return reviews.slice(0, MAX_REVIEWS).map((review) => {
      const reviewId = retainReview(attachment.approvals, review, sameApproval);
      const { tool, root, relativePath, query } = review;
      return {
        reviewId,
        tool,
        root,
        relativePath,
        ...(query === undefined ? {} : { query }),
      };
    });
  }

  async questions(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    observationId: string
  ): Promise<readonly NativeChatQuestion[]> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const snapshot = requireObservation(attachment, observationId);
    const reviews = await owner.active.chat.questions(
      attachment.session,
      snapshot
    );
    this.revalidate(owner, attachment);
    return reviews.slice(0, MAX_REVIEWS).map((review) => ({
      questionId: JSON.stringify([review.task.turnId, review.waitId]),
      reviewId: retainReview(attachment.questions, review, sameQuestion),
      style: review.style,
      question: review.question,
      options: review.options,
    }));
  }

  async answerQuestion(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    reviewId: string,
    input: unknown
  ): Promise<NativeChatControlReceipt> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const review = token(reviewId)
      ? attachment.questions.get(reviewId)
      : undefined;
    if (!review) throw new Error("native_chat_question_unavailable");
    const answer = questionAnswer(input, review.options.length);
    const receipt = await owner.active.chat.answerQuestion(
      attachment.session,
      review,
      answer
    );
    this.revalidate(owner, attachment);
    return receipt;
  }

  async answerApproval(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    reviewId: string,
    decision: unknown
  ): Promise<NativeChatControlReceipt> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    if (decision !== "approve_once" && decision !== "decline")
      throw new Error("native_chat_approval_decision_invalid");
    const review = token(reviewId)
      ? attachment.approvals.get(reviewId)
      : undefined;
    if (!review) throw new Error("native_chat_approval_unavailable");
    const receipt = await owner.active.chat.answerApproval(
      attachment.session,
      review,
      decision
    );
    this.revalidate(owner, attachment);
    return receipt;
  }

  async control(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    input: unknown
  ): Promise<NativeChatControlResult> {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    const control = record(input);
    const action = control?.action;
    const cancelledWakeupId = control?.cancelledWakeupId;
    if (
      (action !== "pause" && action !== "stop" && action !== "resume") ||
      !token(control?.observationId) ||
      typeof control?.requestId !== "string" ||
      (cancelledWakeupId !== undefined &&
        (action !== "resume" || typeof cancelledWakeupId !== "string"))
    )
      throw new Error("native_chat_control_invalid");
    const snapshot = attachment.observations.get(control.observationId);
    if (!snapshot) throw new Error("native_chat_observation_unavailable");
    const { chat } = owner.active;
    if (cancelledWakeupId !== undefined) {
      const turn = snapshot.current;
      if (
        !chat.acceptsWakeups ||
        !chat.scheduledWakeup ||
        !turn ||
        turn.paused ||
        turn.cancelled ||
        turn.disposition !== "suspended"
      )
        throw new Error("native_chat_wakeup_unavailable");
      const schedule = await chat.scheduledWakeup(attachment.session, snapshot);
      this.revalidate(owner, attachment);
      if (
        schedule?.waitId !== cancelledWakeupId ||
        schedule.status !== "cancelled" ||
        schedule.turnId !== turn.turnId
      )
        throw new Error("native_chat_wakeup_changed");
    }
    const result =
      action === "resume"
        ? ({
            action,
            turn: await chat.resume(
              attachment.session,
              snapshot,
              control.requestId,
              cancelledWakeupId
            ),
          } as const)
        : ({
            action,
            receipt: await chat[action](
              attachment.session,
              snapshot,
              control.requestId
            ),
          } as const);
    this.revalidate(owner, attachment);
    return result;
  }

  subscribe(
    event: IpcMainInvokeEvent,
    attachmentId: string,
    subscriptionId: string
  ): void {
    const { owner, attachment } = this.requireAttachment(event, attachmentId);
    if (
      !token(subscriptionId) ||
      owner.subscriptions.has(subscriptionId) ||
      owner.subscriptions.size >= MAX_SUBSCRIPTIONS
    )
      throw new Error("native_chat_subscription_unavailable");
    const subscription: Subscription = { attachment, stop: () => {} };
    owner.subscriptions.set(subscriptionId, subscription);
    let delivered = 0;
    let chunks = 0;
    try {
      const stop = owner.active.chat.subscribe(attachment.session, (update) => {
        if (owner.subscriptions.get(subscriptionId) !== subscription) return;
        try {
          this.revalidate(owner, attachment);
          const bytes =
            update.kind === "text" ? Buffer.byteLength(update.text) : 0;
          if (bytes > MAX_UPDATE_BYTES) return;
          delivered += bytes;
          const limited =
            ++chunks > MAX_DELIVERY_CHUNKS || delivered > MAX_DELIVERY_BYTES;
          if (limited) this.unsubscribeOwned(owner, subscriptionId);
          const payload: NativeChatUpdate = limited
            ? { kind: "closed", reason: "delivery_limit" }
            : update;
          owner.frame.send(IPC_CHANNELS.NATIVE_CHAT_UPDATE, {
            subscriptionId,
            attachmentId,
            update: payload,
          });
        } catch {
          this.unsubscribeOwned(owner, subscriptionId);
        }
      });
      if (owner.subscriptions.get(subscriptionId) === subscription)
        subscription.stop = stop;
      else stop();
    } catch (error) {
      this.unsubscribeOwned(owner, subscriptionId);
      throw error;
    }
  }

  unsubscribe(event: IpcMainInvokeEvent, id: string): void {
    const owner = this.owners.get(event.sender);
    if (
      !owner ||
      owner.frame !== event.senderFrame ||
      !token(id) ||
      !owner.subscriptions.has(id)
    )
      throw new Error("native_chat_subscription_unavailable");
    this.revalidate(owner);
    this.unsubscribeOwned(owner, id);
  }

  private async attach(
    event: IpcMainInvokeEvent,
    open: (chat: ActiveNativeChat["chat"]) => Promise<NativeChatSession>
  ): Promise<NativeChatAttachment> {
    const owner = this.owner(event);
    if (owner.pending + owner.attachments.size >= MAX_ATTACHMENTS)
      throw new Error("native_chat_attachment_limit");
    owner.pending += 1;
    try {
      const session = await open(owner.active.chat);
      this.revalidate(owner);
      if (
        owner.active.chat.ownsSession &&
        !owner.active.chat.ownsSession(session)
      )
        throw new Error("native_chat_session_deleted");
      const existing = [...owner.attachments.values()].find(
        (entry) => entry.session === session
      );
      const attachment = existing ?? {
        id: randomUUID(),
        session,
        observations: new Map(),
        approvals: new Map(),
        questions: new Map(),
        goals: new Map(),
      };
      owner.attachments.set(attachment.id, attachment);
      return { attachmentId: attachment.id, sessionId: session.id };
    } finally {
      owner.pending -= 1;
    }
  }

  private owner(event: IpcMainInvokeEvent): Owner {
    const { sender, senderFrame: frame } = event;
    const active = this.scope(sender, frame);
    if (!frame || !active) throw new Error("native_chat_unavailable");
    const existing = this.owners.get(sender);
    if (
      existing &&
      existing.frame === frame &&
      sameActive(existing.active, active)
    )
      return existing;
    existing?.release();
    const owner: Owner = {
      sender,
      frame,
      active,
      attachments: new Map(),
      retired: new Set(),
      subscriptions: new Map(),
      pending: 0,
      listing: false,
      release: () => {
        if (this.owners.get(sender) !== owner) return;
        this.owners.delete(sender);
        stopWatching();
        for (const id of owner.subscriptions.keys())
          this.unsubscribeOwned(owner, id);
        for (const attachment of owner.attachments.values())
          void this.releaseSide(owner, attachment).catch(() => {});
        owner.attachments.clear();
      },
    };
    this.owners.set(sender, owner);
    const stopWatching = watchNavigation(sender, owner.release);
    return owner;
  }

  private requireAttachment(
    event: IpcMainInvokeEvent,
    id: string
  ): { owner: Owner; attachment: Attachment } {
    const owner = this.owners.get(event.sender);
    const attachment = token(id) ? owner?.attachments.get(id) : undefined;
    if (owner && owner.frame === event.senderFrame && owner.retired.has(id)) {
      this.revalidate(owner);
      throw new Error("native_chat_session_deleted");
    }
    if (!owner || owner.frame !== event.senderFrame || !attachment)
      throw new Error("native_chat_attachment_unavailable");
    this.revalidate(owner, attachment);
    return { owner, attachment };
  }

  private revalidateRevision(
    owner: Owner,
    attachment: Attachment,
    expected?: number
  ): void {
    this.revalidate(owner, attachment);
    if (expected === undefined) return;
    const latest = attachment.latestObservation;
    if (latest?.sessionRevision !== expected)
      throw new Error("stale_session_revision");
    if (latest.current || latest.queuedInputs)
      throw new Error("history_revision_requires_idle");
  }

  private revalidate(owner: Owner, attachment?: Attachment): void {
    if (this.owners.get(owner.sender) !== owner)
      throw new Error("native_chat_attachment_unavailable");
    if (attachment && owner.attachments.get(attachment.id) !== attachment)
      throw new Error(
        owner.retired.has(attachment.id)
          ? "native_chat_session_deleted"
          : "native_chat_attachment_unavailable"
      );
    if (!sameActive(owner.active, this.scope(owner.sender, owner.frame))) {
      owner.release();
      throw new Error("native_chat_scope_changed");
    }
  }

  private unsubscribeOwned(owner: Owner, id: string): void {
    const subscription = owner.subscriptions.get(id);
    owner.subscriptions.delete(id);
    subscription?.stop();
  }

  private deletableEntry(
    owner: Owner,
    entry: NativeChatCatalogEntry
  ): NativeChatCatalogEntry {
    return this.confirmDeletion &&
      owner.active.chat.acceptsSavedChatDeletion &&
      owner.active.chat.deleteSavedChat
      ? { ...entry, deletionAvailable: true }
      : entry;
  }

  private retireAttachments(
    active: ActiveNativeChat,
    session: NativeChatSession
  ): void {
    for (const owner of this.owners.values()) {
      if (!sameActive(active, owner.active)) continue;
      for (const attachment of owner.attachments.values()) {
        if (attachment.session !== session) continue;
        owner.attachments.delete(attachment.id);
        owner.retired.add(attachment.id);
        if (owner.retired.size > MAX_ATTACHMENTS) {
          const oldest = owner.retired.values().next().value;
          if (oldest) owner.retired.delete(oldest);
        }
        for (const [subscriptionId, subscription] of owner.subscriptions) {
          if (subscription.attachment !== attachment) continue;
          this.unsubscribeOwned(owner, subscriptionId);
          try {
            this.revalidate(owner);
            owner.frame.send(IPC_CHANNELS.NATIVE_CHAT_UPDATE, {
              subscriptionId,
              attachmentId: attachment.id,
              update: { kind: "closed", reason: "session_deleted" },
            });
          } catch {
            // The frame can navigate after the host commits its deletion.
          }
        }
      }
    }
  }

  private releaseSide(owner: Owner, attachment: Attachment): Promise<void> {
    if (attachment.closingSide) return attachment.closingSide;
    const side = attachment.side;
    if (!side) return Promise.resolve();
    attachment.side = undefined;
    const chat = owner.active.chat;
    const closing = (async () => {
      let opened = side.chat ?? (await side.opening?.catch(() => undefined));
      if (!opened && side.unconfirmed)
        opened = await chat.openSideChat(
          attachment.session,
          side.nativeRequestId
        );
      if (opened) await chat.closeSideChat(opened);
    })().finally(() => {
      if (attachment.closingSide === closing)
        attachment.closingSide = undefined;
    });
    attachment.closingSide = closing;
    return closing;
  }

  private scope(
    sender: WebContents,
    frame: WebFrameMain | null
  ): ActiveNativeChat | null {
    const id = this.workspaceId(sender, frame);
    if (!id) return null;
    const active = this.resolve(sender, id);
    return active?.workspaceId === id ? active : null;
  }

  private workspaceId(
    sender: WebContents,
    frame: WebFrameMain | null
  ): string | null {
    if (
      !frame ||
      sender.isDestroyed() ||
      sender.isLoadingMainFrame() ||
      frame !== sender.mainFrame ||
      (this.startup && !this.startup.admits(sender))
    )
      return null;
    const raw = frame.url;
    if (!ipc_sender.isAllowed(raw, this.editorOrigin)) return null;
    const url = new URL(raw);
    if (url.pathname !== "/desktop/workspace") return null;
    const [id, duplicate] = url.searchParams.getAll("id");
    return id && id.length <= 1024 && duplicate === undefined ? id : null;
  }
}

function watchNavigation(sender: WebContents, release: () => void): () => void {
  const navigating = (details: { isMainFrame: boolean }) => {
    if (details.isMainFrame) release();
  };
  const inPage = (_event: unknown, _url: string, isMainFrame: boolean) => {
    if (isMainFrame) release();
  };
  sender.on("did-start-navigation", navigating);
  sender.on("did-navigate-in-page", inPage);
  sender.on("did-navigate", release);
  sender.once("destroyed", release);
  sender.once("render-process-gone", release);
  return () => {
    sender.off("did-start-navigation", navigating);
    sender.off("did-navigate-in-page", inPage);
    sender.off("did-navigate", release);
    sender.off("destroyed", release);
    sender.off("render-process-gone", release);
  };
}

function sameActive(
  left: ActiveNativeChat,
  right: ActiveNativeChat | null
): boolean {
  return left.chat === right?.chat && left.workspaceId === right.workspaceId;
}

function retainReview<T>(
  reviews: Map<string, T>,
  review: T,
  same: (left: T, right: T) => boolean
): string {
  const existing = [...reviews].find(([, value]) => same(value, review));
  const id = existing?.[0] ?? randomUUID();
  reviews.delete(id);
  const oldest = reviews.keys().next().value;
  if (oldest && reviews.size >= MAX_REVIEWS) reviews.delete(oldest);
  reviews.set(id, review);
  return id;
}

function sameApproval(
  left: NativeApprovalReview,
  right: NativeApprovalReview
): boolean {
  return (
    left.sessionId === right.sessionId &&
    left.turnId === right.turnId &&
    left.waitId === right.waitId &&
    left.sessionRevision === right.sessionRevision &&
    left.controlRevision === right.controlRevision &&
    left.directory === right.directory &&
    left.root === right.root &&
    left.tool === right.tool &&
    left.relativePath === right.relativePath &&
    left.query === right.query
  );
}

function sameQuestion(
  left: NativeQuestionReview,
  right: NativeQuestionReview
): boolean {
  return (
    left.task.requestId === right.task.requestId &&
    left.style === right.style &&
    left.question === right.question &&
    left.options.length === right.options.length &&
    left.options.every((option, index) => option === right.options[index])
  );
}

function questionAnswer(
  input: unknown,
  options: number
): NativeChatQuestionAnswer {
  const answer = record(input);
  if (answer) {
    const fields = Object.keys(answer).length;
    if (answer.kind === "skipped" && fields === 1) return { kind: "skipped" };
    if (
      fields === 2 &&
      answer.kind === "choice" &&
      typeof answer.index === "number" &&
      Number.isSafeInteger(answer.index) &&
      answer.index >= 0 &&
      answer.index < options
    )
      return { kind: "choice", index: answer.index };
    if (
      fields === 2 &&
      answer.kind === "text" &&
      typeof answer.text === "string" &&
      answer.text.trim() &&
      Buffer.byteLength(answer.text) <= 4096
    )
      return { kind: "text", text: answer.text };
  }
  throw new Error("native_chat_question_answer_invalid");
}

function sameBasis(
  left: NativeChatSnapshot,
  right: NativeChatSnapshot
): boolean {
  return (
    left.sessionRevision === right.sessionRevision &&
    left.current?.turnId === right.current?.turnId &&
    left.current?.epoch === right.current?.epoch &&
    left.current?.journalPosition === right.current?.journalPosition &&
    left.current?.controlRevision === right.current?.controlRevision &&
    left.latest?.turnId === right.latest?.turnId &&
    left.latest?.disposition === right.latest?.disposition &&
    left.latest?.status === right.latest?.status
  );
}

function token(value: unknown): value is string {
  return typeof value === "string" && TOKEN.test(value);
}

function operatingRegime(
  value: unknown
): NativeChatOperatingRegime | undefined {
  if (value === undefined || value === "act" || value === "plan") return value;
  throw new Error("native_chat_operating_regime_invalid");
}

function configurationInput(value: unknown): NativeChatConfigurationInput {
  const input = record(value);
  if (
    !input ||
    Object.keys(input).length !== 3 ||
    (input.action !== "submit" && input.action !== "enqueue") ||
    !token(input.inputId) ||
    typeof input.text !== "string" ||
    !input.text.trim() ||
    Buffer.byteLength(input.text) > MAX_CONFIGURATION_MESSAGE_BYTES
  )
    throw new Error("native_context_limit_review_invalid");
  return { action: input.action, inputId: input.inputId, text: input.text };
}

function requireObservation(
  attachment: Attachment,
  id: unknown
): NativeChatSnapshot {
  const snapshot = token(id) ? attachment.observations.get(id) : undefined;
  if (!snapshot) throw new Error("native_chat_observation_unavailable");
  return snapshot;
}

function queueChange(input: unknown): NativeChatQueueChange {
  const change = record(input);
  if (
    change &&
    token(change.observationId) &&
    typeof change.requestId === "string"
  ) {
    const { action, observationId, requestId, inputId } = change;
    const count = Object.keys(change).length;
    const basis = { observationId, requestId };
    if (action === "resume" && count === 3) return { ...basis, action };
    if (typeof inputId === "string") {
      if (action === "withdraw" && count === 4)
        return { ...basis, action, inputId };
      if (
        action === "replace" &&
        count === 5 &&
        typeof change.text === "string"
      )
        return { ...basis, action, inputId, text: change.text };
      if (
        action === "move" &&
        count === 5 &&
        (change.direction === "up" || change.direction === "down")
      )
        return { ...basis, action, inputId, direction: change.direction };
    }
  }
  throw new Error("native_chat_queue_change_invalid");
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
