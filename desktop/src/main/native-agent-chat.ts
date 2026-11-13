// GRIDA-SEC-004 — attached native chat controls owned by Electron main.
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  NativeChatAcceptance,
  NativeChatApprovalDecision,
  NativeChatCatalogChange,
  NativeChatCatalogEntry,
  NativeChatCommand,
  NativeChatCommandResult,
  NativeChatRevisionInput,
  NativeChatRevisionReceipt,
  NativeChatRevisionTarget,
  NativeChatConfigurationInput,
  NativeChatControlReceipt,
  NativeChatEffort,
  NativeChatGatewayAttemptRef,
  NativeChatGatewayBilling,
  NativeChatGatewayBillingAttempt,
  NativeChatGatewayBillingAttempts,
  NativeChatGatewayChildBilling,
  NativeChatGatewayChildBillingPage,
  NativeChatGatewayChildRef,
  NativeChatGoalControl,
  NativeChatGoalReceipt,
  NativeChatGoalRequest,
  NativeChatImageArtifact,
  NativeChatActivity,
  NativeChatMessage,
  NativeChatMessageAttachment,
  NativeChatTranscriptPage,
  NativeChatTurnRecord,
  NativeChatOperatingRegime,
  NativeChatPage,
  NativeChatQuestion,
  NativeChatQuestionAnswer,
  NativeChatQueueChange,
  NativeChatQueuePage,
  NativeChatQueueReceipt,
  NativeChatSideAnswer,
  NativeChatSnapshot,
  NativeChatSteer,
  NativeChatStreamUpdate,
  NativeChatTokenUsage,
  NativeChatTurn,
  NativeChatTurnSummary,
  NativeChatWakeup,
  NativeChatWakeupAction,
  NativeEditorSurfaceSnapshot,
  NativeSubagentAssignmentInput,
  NativeSubagentCreate,
} from "@grida/desktop-bridge";
import { NativeAgentArtifacts } from "./native-agent-artifacts";
import { NativeAgentHooks, type NativeHookReview } from "./native-agent-hooks";
import type { NativeHookInspection } from "@grida/desktop-bridge";
import type {
  NativeEditorSurfaceDelivery,
  NativeEditorSurfaceSelection,
  NativeEditorSvgTextDelivery,
} from "./native-editor-surfaces";
import { NativeAgentWakeups } from "./native-agent-wakeups";
import type { NativeApprovalReview } from "./native-agent-permissions";
import {
  NativeAgentConfiguration,
  type ContextLimitBasis,
} from "./native-agent-configuration";
import { NativeAgentDeletion } from "./native-agent-deletion";
import { NativeAgentCommands } from "./native-agent-commands";
import { NativeAgentRevisions } from "./native-agent-revisions";
import { NativeAgentSubagents } from "./native-agent-subagents";
import {
  NativeAgentGoals,
  type NativeGoalInspection,
} from "./native-agent-goals";
import {
  NativeAgentSideChats,
  type NativeSideChat,
} from "./native-agent-side-chats";
import {
  NativeAgentProcess,
  TRANSCRIPT_WINDOW,
  type NativeAgentLaunch,
} from "./native-agent-process";
import { NativeGatewayConnection } from "./native-gateway-connection";

const CAPABILITIES = {
  ...NativeAgentConfiguration.capabilities,
  "co.grida/session/submit": 1,
  "co.grida/session/operating-regime": 1,
  "co.grida/session/enqueue": 1,
  "co.grida/session/replace": 1,
  "co.grida/session/withdraw": 1,
  "co.grida/session/reorder": 1,
  "co.grida/session/resume-queue": 1,
  "co.grida/session/steer": 1,
  "co.grida/session/input": 1,
  "co.grida/session/organize": 1,
  "co.grida/session/snapshot": 1,
  "co.grida/session/turn-summary": 1,
  "co.grida/session/stop": 1,
  "co.grida/session/pause": 1,
  "co.grida/session/resume": 1,
  "co.grida/session/updates": 1,
  "co.grida/session/questions": 1,
  "co.grida/session/answer-question": 1,
  "co.grida/goal/start": 1,
  "co.grida/goal/inspect": 1,
  "co.grida/goal/control": 1,
  "co.grida/side-chat/open": 1,
  "co.grida/side-chat/ask": 1,
  "co.grida/side-chat/close": 1,
} as const;
const TURN_DISPOSITIONS = [
  "running",
  "suspended",
  "interrupted",
  "settled",
] as const;
const TURN_STATUSES = [
  "succeeded",
  "failed",
  "cancelled",
  "uncertain",
] as const;
const CHECK_STATUSES = [
  "allowed",
  "denied",
  "failed",
  "cancelled",
  "uncertain",
  "invalid_reply",
  "unavailable",
  "deferred",
  "skipped",
] as const;
const TOKEN_CATEGORIES = [
  "input",
  "output",
  "uncached_input",
  "cached_input",
  "cache_creation_input",
  "tool_input",
  "reasoning_output",
] as const;
const INPUT_DISPOSITIONS = [
  "queued",
  "claimed",
  "completed",
  "superseded",
  "withdrawn",
] as const;
const MAX_TEXT_BYTES = 512 * 1024;
const MAX_ATTACHMENT_BYTES = 256 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_UPDATE_BYTES = 8 * 1024;
const MAX_SUMMARY_BYTES = 8 * 1024;
const MAX_SUMMARY_CHECKS = 8;
const MAX_GATEWAY_CHILD_ASSIGNMENTS = 16;
const MAX_TRANSCRIPT_BYTES = 1024 * 1024;
const MAX_TRANSCRIPT_MESSAGES = 1024;
const MAX_MESSAGE_ACTIVITY = 64;
const MAX_MESSAGE_ATTACHMENTS = 64;
const MAX_ATTACHMENT_NAME_BYTES = 256;
const ACTIVITY_KINDS: ReadonlySet<NativeChatActivity["kind"]> = new Set([
  "read",
  "search",
  "edit",
  "execute",
  "generate",
  "integration",
  "delegate",
  "ask",
  "other",
]);
const ACTIVITY_OUTCOMES: ReadonlySet<NativeChatActivity["outcome"]> = new Set([
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "uncertain",
]);
const TURN_RECORD_STATUSES: ReadonlySet<unknown> = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "uncertain",
]);
const MAX_CATALOG_SESSIONS = 32;
const MAX_TITLE_BYTES = 256;
const LIFECYCLE = "co.grida/session/lifecycle";
const RECENT_LIFECYCLE = 256;
const MAX_QUEUE_INPUTS = 256;
const QUEUE_PAGE_SIZE = 8;
const QUEUE_PREVIEW_LENGTH = 2048;
const CATALOG_CURSOR = /^[!-~]{1,512}$/;
const IDENTITY = /^[A-Za-z0-9_.:@/-]{1,256}$/;
const LIBRARY_OBJECT_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

export type NativeAgentChatLaunch = Omit<
  NativeAgentLaunch,
  "capabilities" | "onSessionUpdate"
> & {
  /** Canonical workspace context selected by main for this process. */
  cwd: string;
  onLifecycle?: (event: NativeChatLifecycle, current: () => boolean) => void;
};

export type NativeChatLifecycle = Readonly<
  { sessionId: string; turnId: string } & (
    | { kind: "settled"; status: NativeChatTurnSummary["status"] }
    | { kind: "approval_required"; waitId: string }
  )
>;

export type NativeChatSession = Readonly<{ id: string }>;
type TaskBasis = Readonly<{
  sessionId: string;
  turnId: string;
  requestId: string;
  expectedSessionRevision: number;
  expectedControlRevision: number;
}>;

export type NativeQuestionReview = Readonly<
  Pick<NativeChatQuestion, "style" | "question" | "options"> & {
    task: TaskBasis;
    waitId: string;
    expectedHistoryPosition: number;
  }
>;

export type NativeLibrarySelectionReview = Readonly<{
  task: TaskBasis;
  waitId: string;
  initialSearchQuery: string;
}>;

// A retained basis can retry an identical control after the native child is
// replaced. The replacement still requires a fresh attachment to that session.
type QueuePosition = Readonly<{
  inputId: string;
  inputPosition: number;
  goalStart?: NativeChatGoalRequest;
  operatingRegime?: NativeChatOperatingRegime;
  effort?: "ultra";
  allowsConfigurationChange?: true;
}>;
const observed = new WeakMap<
  NativeChatSnapshot,
  { scope: string; queue: readonly QueuePosition[] }
>();
type TranscriptCapture = {
  messages: Map<string, NativeChatMessage>;
  bytes: number;
  overflow: boolean;
  requestId?: string;
  result?: Promise<readonly NativeChatMessage[]>;
};

export class NativeAgentChat {
  private readonly chatCommands = new NativeAgentCommands((method, params) =>
    this.process.request(method, params)
  );
  private readonly revisions = new NativeAgentRevisions((method, params) =>
    this.process.request(method, params)
  );
  private readonly subagents = new NativeAgentSubagents(
    (method, params) => this.process.request(method, params),
    turn
  );
  private readonly configuration = new NativeAgentConfiguration(
    (method, params) => this.process.request(method, params, 10_000)
  );
  private readonly deletion = new NativeAgentDeletion((method, params) =>
    this.process.request(method, params, 10_000)
  );
  private readonly goals = new NativeAgentGoals((method, params) =>
    this.process.request(method, params)
  );
  private readonly sideChats = new NativeAgentSideChats((method, params) =>
    this.process.request(method, params)
  );
  private readonly attached = new Map<string, NativeChatSession>();
  private readonly loading = new Map<string, Promise<NativeChatSession>>();
  private readonly transcripts = new Map<string, TranscriptCapture>();
  private readonly unverifiedTranscripts = new Set<string>();
  private readonly questionReviews = new WeakSet<NativeQuestionReview>();
  private readonly librarySelectionReviews =
    new WeakSet<NativeLibrarySelectionReview>();
  private readonly listeners = new Map<
    string,
    Set<(update: NativeChatStreamUpdate) => void>
  >();
  private closed = false;

  get connected(): boolean {
    return !this.closed && this.process.connected;
  }

  get acceptsPng(): boolean {
    return this.connected && this.process.acceptsPng;
  }

  get acceptsLibrarySelection(): boolean {
    return this.connected && this.process.acceptsLibrarySelection;
  }

  get acceptsFile(): boolean {
    return this.connected && this.process.acceptsFile;
  }

  get acceptsEffort(): boolean {
    return this.connected && this.process.acceptsEffort;
  }

  get acceptsGoalEffort(): boolean {
    return this.connected && this.process.acceptsGoalEffort;
  }

  get acceptsWakeups(): boolean {
    return this.connected && this.process.acceptsWakeups;
  }

  get acceptsSavedChatDeletion(): boolean {
    return this.connected && this.process.acceptsSavedChatDeletion;
  }

  ownsSession(session: NativeChatSession): boolean {
    return !this.closed && this.attached.get(session.id) === session;
  }

  get hasExited(): boolean {
    return this.process.hasExited;
  }

  private constructor(
    private readonly process: NativeAgentProcess,
    private readonly cwd: string,
    private readonly scope: string,
    private readonly onLifecycle?: NativeAgentChatLaunch["onLifecycle"],
    private readonly hookRegistry?: NativeAgentHooks
  ) {}

  private readonly lifecycleSeen = new Set<string>();

  static async start({
    cwd,
    onLifecycle,
    ...launch
  }: NativeAgentChatLaunch): Promise<NativeAgentChat> {
    if (
      !path.isAbsolute(cwd) ||
      (await fs.realpath(cwd)) !== cwd ||
      !(await fs.stat(cwd)).isDirectory() ||
      (launch.workspace !== undefined && launch.workspace.primary.path !== cwd)
    )
      throw new Error("native_chat_workspace_invalid");
    let client: NativeAgentChat | undefined;
    const process = await NativeAgentProcess.start({
      ...launch,
      capabilities: onLifecycle
        ? { ...CAPABILITIES, [LIFECYCLE]: 1 }
        : CAPABILITIES,
      onSessionUpdate: (params) => client?.publish(params),
    });
    client = new NativeAgentChat(
      process,
      cwd,
      JSON.stringify([launch.stateDirectory, cwd]),
      onLifecycle,
      launch.hooks
    );
    return client;
  }

  async list(
    cursor: string | null = null,
    archived = false
  ): Promise<NativeChatPage> {
    this.requireOpen();
    if (cursor !== null && !isCatalogCursor(cursor))
      throw new Error("native_chat_cursor_invalid");
    const result = object(
      await this.process.request(
        archived ? "_co.grida/session/list-archived" : "session/list",
        {
          cwd: this.cwd,
          ...(cursor === null ? {} : { cursor }),
        }
      )
    );
    if (
      !Array.isArray(result.sessions) ||
      result.sessions.length > MAX_CATALOG_SESSIONS
    )
      throw invalidResponse();
    const titles: NonNullable<NativeChatPage["titles"]>[number][] = [];
    const sessionIds = result.sessions.map((entry: unknown) => {
      const session = object(entry);
      if (session.cwd !== this.cwd) throw invalidResponse();
      const sessionId = identity(session.sessionId);
      const title = catalogTitle(session.title ?? null);
      if (title !== null) titles.push({ sessionId, title });
      return sessionId;
    });
    const nextCursor = result.nextCursor ?? null;
    if (
      new Set(sessionIds).size !== sessionIds.length ||
      (nextCursor !== null &&
        (!isCatalogCursor(nextCursor) ||
          nextCursor === cursor ||
          sessionIds.length === 0))
    )
      throw invalidResponse();
    return { sessionIds, nextCursor, ...(titles.length && { titles }) };
  }

  commands(session: NativeChatSession): readonly NativeChatCommand[] {
    this.requireAttached(session);
    return this.process.availableCommands;
  }

  async runCommand(
    session: NativeChatSession,
    command: NativeChatCommand,
    requestId: string,
    check: () => void
  ): Promise<NativeChatCommandResult> {
    if (!this.commands(session).includes(command))
      throw new Error("native_chat_command_unavailable");
    const result = await this.chatCommands.run(
      session,
      command,
      identity(requestId),
      () => {
        this.requireAttached(session);
        check();
      }
    );
    this.requireAttached(session);
    return result;
  }

  prepareRevision(
    attachment: object,
    session: NativeChatSession,
    snapshot: NativeChatSnapshot,
    messageId: string,
    check: (expectedSessionRevision?: number) => void
  ): Promise<NativeChatRevisionTarget> {
    this.requireObservation(session, snapshot);
    if (!this.process.acceptsHistoryRevision)
      throw new Error("native_chat_revision_unavailable");
    return this.revisions.prepare(
      attachment,
      session,
      snapshot,
      messageId,
      (revision) => {
        this.requireAttached(session);
        check(revision);
      }
    );
  }

  revise(
    attachment: object,
    session: NativeChatSession,
    input: NativeChatRevisionInput,
    check: (expectedSessionRevision?: number) => void
  ): Promise<NativeChatRevisionReceipt> {
    this.requireAttached(session);
    return this.revisions.apply(
      attachment,
      session,
      input.reviewId,
      input.text,
      input.operatingRegime,
      (revision) => {
        this.requireAttached(session);
        check(revision);
      },
      { selection: input.effort, available: this.acceptsEffort }
    );
  }

  listSubagents(
    parent: NativeChatSession,
    afterChildId: string | undefined,
    check: () => void
  ) {
    return this.subagents.list(
      parent,
      afterChildId,
      this.subagentScope(parent, check)
    );
  }

  inspectSubagent(
    attachment: object,
    parent: NativeChatSession,
    childId: string,
    inputId: string | undefined,
    check: () => void
  ) {
    return this.subagents.inspect(
      attachment,
      parent,
      childId,
      inputId,
      this.subagentScope(parent, check),
      this.process.acceptsSubagentTurnControls,
      {
        messaging: this.process.acceptsSubagentMessaging,
        queue: this.process.acceptsSubagentQueueControls,
      }
    );
  }

  createSubagent(
    parent: NativeChatSession,
    input: NativeSubagentCreate,
    check: () => void
  ) {
    return this.subagents.create(
      parent,
      input,
      this.subagentScope(parent, check)
    );
  }

  assignSubagent(
    attachment: object,
    parent: NativeChatSession,
    input: NativeSubagentAssignmentInput,
    observe: () => NativeChatSnapshot,
    check: () => void
  ) {
    return this.subagents.assign(
      attachment,
      parent,
      input,
      () => {
        const snapshot = observe();
        this.requireObservation(parent, snapshot);
        const sponsor = snapshot.latest;
        if (sponsor?.disposition !== "settled")
          throw new Error("native_chat_subagent_sponsor_unavailable");
        return sponsor.turnId;
      },
      this.subagentScope(parent, check)
    );
  }

  stopSubagent(
    attachment: object,
    parent: NativeChatSession,
    observationId: string,
    requestId: string,
    check: () => void
  ) {
    return this.subagents.stop(
      attachment,
      parent,
      observationId,
      requestId,
      this.subagentScope(parent, check)
    );
  }

  controlSubagentTurn(
    attachment: object,
    parent: NativeChatSession,
    observationId: string,
    requestId: string,
    control: unknown,
    check: () => void
  ) {
    if (!this.process.acceptsSubagentTurnControls)
      throw new Error("native_chat_subagent_unavailable");
    return this.subagents.controlTurn(
      attachment,
      parent,
      observationId,
      requestId,
      control,
      this.subagentScope(parent, check)
    );
  }

  controlSubagentChild(
    attachment: object,
    parent: NativeChatSession,
    observationId: string,
    requestId: string,
    control: unknown,
    check: () => void
  ) {
    return this.subagents.controlChild(
      attachment,
      parent,
      observationId,
      requestId,
      control,
      {
        messaging: this.process.acceptsSubagentMessaging,
        queue: this.process.acceptsSubagentQueueControls,
      },
      this.subagentScope(parent, check)
    );
  }

  async catalogEntry(
    session: NativeChatSession
  ): Promise<NativeChatCatalogEntry> {
    const sessionId = this.requireAttached(session);
    const result = await this.process.request(
      "_co.grida/session/catalog-entry",
      { sessionId }
    );
    this.requireAttached(session);
    return catalogEntry(result, sessionId);
  }

  async deleteSavedChat(
    session: NativeChatSession,
    snapshot: NativeChatSnapshot,
    catalogRevision: number,
    requestId: string,
    expectedOwnedChildren?: string
  ): Promise<void> {
    const sessionId = this.requireObservation(session, snapshot);
    if (!this.acceptsSavedChatDeletion)
      throw new Error("native_chat_deletion_unavailable");
    await this.deletion.retire({
      sessionId,
      cwd: this.cwd,
      requestId: identity(requestId),
      expectedSessionRevision: snapshot.sessionRevision,
      expectedCatalogRevision: revision(catalogRevision),
      ...(expectedOwnedChildren && { expectedOwnedChildren }),
    });
    if (!this.ownsSession(session)) return;
    this.attached.delete(sessionId);
    this.loading.delete(sessionId);
    this.transcripts.delete(sessionId);
    this.unverifiedTranscripts.delete(sessionId);
    this.listeners.delete(sessionId);
  }

  async previewSavedChatDeletion(session: NativeChatSession) {
    const sessionId = this.requireAttached(session);
    if (!this.process.acceptsSavedChatDeletionPreview) return undefined;
    const preview = await this.deletion.preview({ sessionId, cwd: this.cwd });
    this.requireAttached(session);
    return preview;
  }

  async organize(
    session: NativeChatSession,
    value: unknown
  ): Promise<NativeChatCatalogEntry> {
    const sessionId = this.requireAttached(session);
    const change = catalogChange(value);
    const result = await this.process.request("_co.grida/session/organize", {
      sessionId,
      ...change,
    });
    this.requireAttached(session);
    const saved = catalogEntry(result, sessionId);
    if (
      saved.title !== change.title ||
      saved.archived !== change.archived ||
      saved.revision < change.revision
    )
      throw invalidResponse();
    return saved;
  }

  async create(): Promise<NativeChatSession> {
    this.requireOpen();
    const result = object(
      await this.process.request("session/new", {
        cwd: this.cwd,
        mcpServers: [],
      })
    );
    return this.attach(identity(result.sessionId));
  }

  async load(sessionId: string): Promise<NativeChatSession> {
    this.requireOpen();
    const id = identity(sessionId);
    const existing = this.attached.get(id);
    if (existing) return existing;
    const loading = this.loading.get(id);
    if (loading) return loading;
    const requested = this.process
      .request("session/load", {
        sessionId: id,
        cwd: this.cwd,
        mcpServers: [],
        ...(this.process.acceptsTranscriptWindow && {
          _meta: { [TRANSCRIPT_WINDOW]: { kind: "attach" } },
        }),
      })
      .then((reply) => {
        object(reply);
        if (this.loading.get(id) !== requested)
          throw new Error("native_chat_attachment_required");
        return this.attach(id);
      })
      .catch((error: unknown) => {
        if (
          this.loading.get(id) === requested &&
          error instanceof Error &&
          error.message === "native_agent_request_timeout"
        )
          this.unverifiedTranscripts.add(id);
        throw error;
      })
      .finally(() => {
        if (this.loading.get(id) === requested) this.loading.delete(id);
      });
    this.loading.set(id, requested);
    return requested;
  }

  async openSideChat(
    parent: NativeChatSession,
    requestId: string
  ): Promise<NativeSideChat> {
    const side = await this.sideChats.open(
      this.requireAttached(parent),
      requestId
    );
    try {
      this.requireAttached(parent);
    } catch (error) {
      await this.sideChats.close(side).catch(() => {});
      throw error;
    }
    return side;
  }

  askSideChat(
    parent: NativeChatSession,
    side: NativeSideChat,
    requestId: string,
    text: string
  ): Promise<NativeChatSideAnswer> {
    return this.sideChats.ask(
      this.requireAttached(parent),
      side,
      requestId,
      text
    );
  }

  closeSideChat(side: NativeSideChat): Promise<void> {
    return this.sideChats.close(side);
  }

  registerEditorSurfaces(
    session: NativeChatSession,
    snapshot: NativeEditorSurfaceSnapshot,
    requireCurrent: () => void,
    deliver: NativeEditorSurfaceDelivery | undefined,
    revision?: number,
    svgText?: NativeEditorSvgTextDelivery
  ) {
    return this.process.registerEditorSurfaces(
      this.requireAttached(session),
      snapshot,
      requireCurrent,
      deliver,
      revision,
      svgText
    );
  }

  submit(
    session: NativeChatSession,
    inputId: string,
    text: string,
    operatingRegime?: NativeChatOperatingRegime,
    editorSurfaces?: NativeEditorSurfaceSelection,
    effort?: NativeChatEffort
  ): Promise<NativeChatAcceptance> {
    return this.send("submit", session, inputId, text, operatingRegime, {
      editorSurfaces,
      effort,
    });
  }

  enqueue(
    session: NativeChatSession,
    inputId: string,
    text: string,
    operatingRegime?: NativeChatOperatingRegime,
    effort?: NativeChatEffort
  ): Promise<NativeChatAcceptance> {
    return this.send("enqueue", session, inputId, text, operatingRegime, {
      effort,
    });
  }

  submitWithLibrarySelection(
    session: NativeChatSession,
    inputId: string,
    text: string,
    operatingRegime?: NativeChatOperatingRegime,
    editorSurfaces?: NativeEditorSurfaceSelection,
    effort?: NativeChatEffort
  ): Promise<NativeChatAcceptance> {
    if (!this.acceptsLibrarySelection)
      return Promise.reject(
        new Error("native_chat_library_selection_unavailable")
      );
    return this.send("submit", session, inputId, text, operatingRegime, {
      allowLibrarySelection: true,
      editorSurfaces,
      effort,
    });
  }

  submitWithWakeup(
    session: NativeChatSession,
    inputId: string,
    text: string,
    editorSurfaces?: NativeEditorSurfaceSelection,
    effort?: NativeChatEffort
  ): Promise<NativeChatAcceptance> {
    if (!this.acceptsWakeups)
      return Promise.reject(new Error("native_chat_wakeup_unavailable"));
    return this.send("submit", session, inputId, text, "act", {
      allowWakeups: true,
      editorSurfaces,
      effort,
    });
  }

  async scheduledWakeup(
    session: NativeChatSession,
    snapshot: NativeChatSnapshot
  ): Promise<NativeChatWakeup | null> {
    const sessionId = this.requireObservation(session, snapshot);
    const selected = NativeAgentWakeups.turn(snapshot);
    if (!this.acceptsWakeups || !selected) return null;
    const turnId = selected.turnId;
    const response = await this.process.request(
      NativeAgentWakeups.methods.read,
      { sessionId, turnId },
      10_000
    );
    this.requireAttached(session);
    return NativeAgentWakeups.decode(response, sessionId, turnId);
  }

  async controlWakeup(
    session: NativeChatSession,
    snapshot: NativeChatSnapshot,
    waitId: string,
    action: NativeChatWakeupAction
  ): Promise<NativeChatWakeup> {
    const sessionId = this.requireObservation(session, snapshot);
    const turnId = snapshot.current?.turnId;
    if (!this.acceptsWakeups || !turnId || snapshot.current?.cancelled)
      throw new Error("native_chat_wakeup_unavailable");
    const response = await this.process.request(
      NativeAgentWakeups.methods[action],
      { sessionId, turnId, waitId: identity(waitId) },
      10_000
    );
    this.requireAttached(session);
    const wakeup = NativeAgentWakeups.decode(response, sessionId, turnId);
    if (wakeup?.waitId !== waitId) throw invalidResponse();
    return wakeup;
  }

  async submitImage(
    session: NativeChatSession,
    value: unknown
  ): Promise<NativeChatAcceptance> {
    this.requireAttached(session);
    if (!this.acceptsPng) throw new Error("image_input_unavailable");
    const input = object(value);
    const effort =
      input.effort === undefined
        ? undefined
        : choice(input.effort, EFFORT_CHOICES);
    if (
      Object.keys(input).length !== (effort ? 6 : 5) ||
      typeof input.text !== "string"
    )
      throw invalidResponse();
    return this.send(
      choice(input.action, ["submit", "enqueue"] as const),
      session,
      identity(input.inputId),
      input.text,
      choice(input.operatingRegime, ["act", "plan"] as const),
      { image: pngPrompt(input.png), effort }
    );
  }

  async submitFile(
    session: NativeChatSession,
    value: unknown
  ): Promise<NativeChatAcceptance> {
    this.requireAttached(session);
    if (!this.acceptsFile) throw new Error("file_attachment_unavailable");
    const input = object(value);
    const effort =
      input.effort === undefined
        ? undefined
        : choice(input.effort, EFFORT_CHOICES);
    if (
      Object.keys(input).length !== (effort ? 7 : 6) ||
      typeof input.text !== "string"
    )
      throw invalidResponse();
    return this.send(
      choice(input.action, ["submit", "enqueue"] as const),
      session,
      identity(input.inputId),
      input.text,
      choice(input.operatingRegime, ["act", "plan"] as const),
      { file: selectedFile(input.name, input.bytes), effort }
    );
  }

  private async send(
    mode: "submit" | "enqueue",
    session: NativeChatSession,
    inputId: string,
    text: string,
    operatingRegime?: NativeChatOperatingRegime,
    options: {
      image?: ReturnType<typeof pngPrompt>;
      file?: ReturnType<typeof selectedFile>;
      allowConfigurationChanges?: true;
      allowWakeups?: true;
      allowLibrarySelection?: true;
      editorSurfaces?: NativeEditorSurfaceSelection;
      effort?: NativeChatEffort;
    } = {}
  ): Promise<NativeChatAcceptance> {
    const sessionId = this.requireAttached(session);
    identity(inputId);
    const {
      image,
      file,
      allowConfigurationChanges,
      allowWakeups,
      allowLibrarySelection,
      editorSurfaces,
      effort,
    } = options;
    if (effort === "ultra" && !this.acceptsEffort)
      throw new Error("native_chat_effort_unavailable");
    return acceptance(
      await this.process.request(`_co.grida/session/${mode}`, {
        sessionId,
        inputId,
        prompt: [...textPrompt(text), ...(image ? [image] : [])],
        ...(file && { selectedFile: file }),
        ...(operatingRegime && { operatingRegime }),
        ...hostEffort(effort),
        ...(allowConfigurationChanges && { allowConfigurationChanges }),
        ...(allowWakeups && { allowWakeups }),
        ...(allowLibrarySelection && { allowLibrarySelection }),
        ...(mode === "submit" &&
          operatingRegime === "act" &&
          !image &&
          !file &&
          !allowConfigurationChanges &&
          editorSurfaces),
      }),
      sessionId,
      inputId
    );
  }

  inspectContextLimit(): Promise<ContextLimitBasis> {
    this.requireOpen();
    return this.configuration.inspect();
  }

  async inspectHooks(sessionId?: string): Promise<NativeHookInspection> {
    this.requireOpen();
    if (!this.hookRegistry) throw new Error("native_hooks_unavailable");
    if (sessionId !== undefined && !this.attached.has(sessionId))
      throw new Error("native_chat_attachment_unavailable");
    return this.hookRegistry.inspect(
      await this.process.request(
        "_co.grida/session/hooks",
        sessionId === undefined ? {} : { sessionId }
      )
    );
  }

  async reviewHook(file: string): Promise<NativeHookReview> {
    this.requireOpen();
    if (!this.hookRegistry) throw new Error("native_hooks_unavailable");
    return this.hookRegistry.review(file);
  }

  async installHook(review: NativeHookReview): Promise<void> {
    this.requireOpen();
    if (!this.hookRegistry) throw new Error("native_hooks_unavailable");
    await this.hookRegistry.install(review);
  }

  async removeHook(id: string, revision: string): Promise<void> {
    this.requireOpen();
    if (!this.hookRegistry) throw new Error("native_hooks_unavailable");
    await this.hookRegistry.remove(id, revision);
  }

  updateContextLimit(
    basis: ContextLimitBasis,
    limit: number | null
  ): Promise<void> {
    this.requireOpen();
    return this.configuration.update(basis, limit);
  }

  async sendConfiguration(
    session: NativeChatSession,
    input: NativeChatConfigurationInput
  ): Promise<NativeChatAcceptance> {
    try {
      return await this.send(
        input.action,
        session,
        input.inputId,
        input.text,
        "act",
        { allowConfigurationChanges: true, effort: input.effort }
      );
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== "native_agent_request_timeout"
      )
        throw error;
      const sessionId = this.requireAttached(session);
      const retained = await this.process
        .request("_co.grida/session/input", {
          sessionId,
          inputId: input.inputId,
        })
        .then(object)
        .catch(() => {
          throw error;
        });
      this.requireAttached(session);
      const settings = object(retained.settings);
      const part =
        Array.isArray(retained.prompt) && retained.prompt.length === 1
          ? object(retained.prompt[0])
          : null;
      if (
        settings.configurationPermission !== "change" ||
        settings.operatingRegime !== "act" ||
        (settings.effort === "ultra") !== (input.effort === "ultra") ||
        part?.type !== "text" ||
        part.text !== input.text
      )
        throw new Error("native_context_limit_receipt_mismatch");
      return acceptance(retained.receipt, sessionId, input.inputId);
    }
  }

  async inputReceipt(
    session: NativeChatSession,
    inputId: string
  ): Promise<NativeChatAcceptance> {
    const sessionId = this.requireAttached(session);
    const result = object(
      await this.process.request("_co.grida/session/input", {
        sessionId,
        inputId: identity(inputId),
      })
    );
    this.requireAttached(session);
    return acceptance(result.receipt, sessionId, inputId);
  }

  async observe(session: NativeChatSession): Promise<NativeChatSnapshot> {
    const sessionId = this.requireAttached(session);
    const result = object(
      await this.process.request("_co.grida/session/snapshot", { sessionId })
    );
    this.requireAttached(session);
    if (result.sessionId !== sessionId) throw invalidResponse();
    const queuedInputs = revision(result.queuedInputs);
    const queue = queuePositions(result.queue, queuedInputs);
    const pending = queue.filter((row) => row.goalStart);
    if (pending.length > 1) throw invalidResponse();
    const current = result.current === null ? null : turn(result.current);
    const admissionPaused = flag(result.admissionPaused);
    const retryAt = result.retryNotBeforeMs;
    const snapshot = Object.freeze({
      sessionId,
      sessionRevision: revision(result.sessionRevision),
      queuedInputs,
      ...(pending[0] && { pendingGoalId: pending[0].inputId }),
      ...(this.process.acceptsHistoryRevision && {
        historyRevisionAvailable: true as const,
      }),
      ...(this.process.acceptsSubagents && {
        subagentsAvailable: true as const,
      }),
      ...(this.process.acceptsGoalNamedChild && {
        goalNamedChildAvailable: true as const,
      }),
      ...(this.process.acceptsGoalSpending && {
        goalSpendingAvailable: true as const,
      }),
      ...(this.process.acceptsGoalManualContinuation && {
        goalManualContinuationAvailable: true as const,
      }),
      ...(current?.disposition === "running" &&
        !current.paused &&
        !current.cancelled &&
        typeof retryAt === "number" &&
        Number.isSafeInteger(retryAt) &&
        retryAt > 0 && { retryNotBeforeMs: retryAt }),
      admissionPaused,
      ...(!admissionPaused &&
        !current &&
        queuedInputs > 0 && { idleQueueResumeAvailable: true as const }),
      current,
      latest: result.latest === null ? null : turn(result.latest),
    });
    observed.set(snapshot, {
      scope: this.scope,
      queue,
    });
    return snapshot;
  }

  async turnSummary(
    session: NativeChatSession,
    snapshot: NativeChatSnapshot,
    billingOptions?: {
      attempt?: unknown;
      childBillingAfter?: unknown;
      requireCurrent: () => void;
    }
  ): Promise<NativeChatTurnSummary> {
    const sessionId = this.requireObservation(session, snapshot);
    const latest = snapshot.latest;
    if (latest?.disposition !== "settled" || latest.status === null)
      throw new Error("native_chat_turn_summary_unavailable");
    const attempt =
      billingOptions?.attempt === undefined
        ? undefined
        : gatewayAttempt(billingOptions.attempt);
    const childBillingAfter =
      billingOptions?.childBillingAfter === undefined
        ? undefined
        : gatewayChildRef(billingOptions.childBillingAfter);
    const acceptsChildren = this.process.acceptsChildGatewayBilling;
    if ((childBillingAfter || attempt?.child) && !acceptsChildren)
      throw new Error("native_chat_gateway_billing_unavailable");
    const result = object(
      await this.process.request("_co.grida/session/turn-summary", {
        sessionId,
        turnId: latest.turnId,
        ...(childBillingAfter && { childBillingAfter }),
      })
    );
    this.requireAttached(session);
    if (
      result.turnId !== latest.turnId ||
      result.status !== latest.status ||
      typeof result.text !== "string" ||
      Buffer.byteLength(result.text) > MAX_SUMMARY_BYTES ||
      !Array.isArray(result.checks) ||
      result.checks.length > MAX_SUMMARY_CHECKS
    )
      throw invalidResponse();
    const tools =
      result.toolActivity === null ? null : object(result.toolActivity);
    const usage = tokenUsage(result.tokenUsage);
    let billing = gatewayBilling(
      result.gatewayBilling,
      acceptsChildren,
      childBillingAfter
    );
    if (childBillingAfter && !billing?.children)
      throw new Error("native_chat_gateway_billing_unavailable");
    if (attempt && billingOptions) {
      const matches = (row: NativeChatGatewayBillingAttempt) =>
        row.operationId === attempt.operationId &&
        row.attemptId === attempt.attemptId;
      const child = attempt.child;
      const assignment =
        child &&
        billing?.children?.assignments.find(
          (row) =>
            row.childId === child.childId && row.inputId === child.inputId
        );
      const group = child
        ? assignment?.billing
        : billing?.attempts.some(matches)
          ? billing
          : billing?.review;
      const selected = group?.attempts.find(matches);
      if (!billing || !group || !selected?.refreshable)
        throw new Error("native_chat_gateway_billing_unavailable");
      billingOptions.requireCurrent();
      const status = await this.process.gatewayBillingStatus({
        ...attempt,
        sessionId,
        turnId: latest.turnId,
      });
      this.requireAttached(session);
      billingOptions.requireCurrent();
      if (status.kind === "unavailable")
        throw new Error("native_chat_gateway_billing_unavailable");
      const refreshed: NativeChatGatewayBillingAttempt =
        status.kind === "settled"
          ? Object.freeze({ ...selected, ...status, refreshable: false })
          : Object.freeze({ ...selected, kind: "pending", refreshable: true });
      const refreshedGroup = Object.freeze({
        ...group,
        attempts: Object.freeze(
          group.attempts.map((row) => (row === selected ? refreshed : row))
        ),
      });
      if (assignment && billing.children) {
        billing = Object.freeze({
          ...billing,
          children: Object.freeze({
            ...billing.children,
            assignments: Object.freeze(
              billing.children.assignments.map((row) =>
                row === assignment
                  ? Object.freeze({ ...row, billing: refreshedGroup })
                  : row
              )
            ),
          }),
        });
      } else {
        billing =
          group === billing
            ? refreshedGroup
            : Object.freeze({ ...billing, review: refreshedGroup });
      }
    }
    return Object.freeze({
      turnId: latest.turnId,
      status: latest.status,
      text: result.text,
      textTruncated: flag(result.textTruncated),
      steps: result.steps === null ? null : revision(result.steps),
      unresolvedOperations:
        result.unresolvedOperations === null
          ? null
          : revision(result.unresolvedOperations),
      toolActivity:
        tools &&
        Object.freeze({
          succeeded: revision(tools.succeeded),
          failed: revision(tools.failed),
          cancelled: revision(tools.cancelled),
          unresolved: revision(tools.unresolved),
        }),
      checks: Object.freeze(
        result.checks.map((check: unknown) => choice(check, CHECK_STATUSES))
      ),
      ...(usage && { tokenUsage: usage }),
      ...(billing && { gatewayBilling: billing }),
      ...(typeof result.reviewFindingsCollected === "boolean" && {
        reviewFindingsCollected: result.reviewFindingsCollected,
      }),
      ...(this.process.acceptsArtifacts &&
        result.artifacts !== undefined && {
          artifacts: NativeAgentArtifacts.describe(result.artifacts),
          ...(result.artifactsOmitted !== undefined && {
            artifactsOmitted: revision(result.artifactsOmitted),
          }),
        }),
    });
  }

  async readArtifact(
    session: NativeChatSession,
    snapshot: NativeChatSnapshot,
    artifact: NativeChatImageArtifact
  ): Promise<ArrayBuffer> {
    const sessionId = this.requireObservation(session, snapshot);
    const latest = snapshot.latest;
    if (
      !this.process.acceptsArtifacts ||
      snapshot.current ||
      latest?.disposition !== "settled" ||
      !latest.status
    )
      throw new Error("native_chat_artifact_unavailable");
    const result = await this.process.request(NativeAgentArtifacts.readMethod, {
      sessionId,
      turnId: latest.turnId,
      artifactId: artifact.id,
    });
    this.requireAttached(session);
    return NativeAgentArtifacts.decode(result, artifact);
  }

  async queue(
    session: NativeChatSession,
    snapshot: NativeChatSnapshot,
    offset: number
  ): Promise<NativeChatQueuePage> {
    const sessionId = this.requireObservation(session, snapshot);
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset >= MAX_QUEUE_INPUTS
    )
      throw new Error("native_chat_queue_offset_invalid");
    const queue = observed.get(snapshot)!.queue;
    const last =
      Math.max(0, Math.floor((queue.length - 1) / QUEUE_PAGE_SIZE)) *
      QUEUE_PAGE_SIZE;
    const start = Math.min(offset, last);
    const page = queue.slice(start, start + QUEUE_PAGE_SIZE);
    const items = [];
    for (const row of page) {
      const input = await this.readQueueInput(sessionId, row);
      this.requireAttached(session);
      if (input.receipt.disposition !== "queued")
        throw new Error("native_chat_queue_changed");
      const text = row.goalStart?.objective ?? input.text;
      const preview =
        text && text.length > QUEUE_PREVIEW_LENGTH
          ? `${text.slice(0, QUEUE_PREVIEW_LENGTH)}…`
          : text;
      items.push({
        inputId: row.inputId,
        preview,
        ...(row.goalStart && { goalStart: row.goalStart }),
        ...(row.operatingRegime && { operatingRegime: row.operatingRegime }),
        ...(row.effort && { effort: row.effort }),
        ...(row.allowsConfigurationChange && {
          allowsConfigurationChange: true as const,
        }),
      });
    }
    return {
      items,
      offset: start,
      previousOffset: start > 0 ? Math.max(0, start - QUEUE_PAGE_SIZE) : null,
      nextOffset:
        start + page.length < queue.length ? start + page.length : null,
    };
  }

  async queuedText(
    session: NativeChatSession,
    snapshot: NativeChatSnapshot,
    inputId: string
  ): Promise<string> {
    const sessionId = this.requireObservation(session, snapshot);
    const row = observed
      .get(snapshot)!
      .queue.find((item) => item.inputId === inputId);
    if (!row || row.goalStart || row.allowsConfigurationChange)
      throw new Error("native_chat_queue_input_unavailable");
    const input = await this.readQueueInput(sessionId, row);
    this.requireAttached(session);
    if (input.receipt.disposition !== "queued" || input.text === null)
      throw new Error("native_chat_queue_input_unavailable");
    return input.text;
  }

  async editQueue(
    session: NativeChatSession,
    snapshot: NativeChatSnapshot,
    change: NativeChatQueueChange,
    revalidate?: () => void
  ): Promise<NativeChatQueueReceipt> {
    const sessionId = this.requireObservation(session, snapshot);
    const requestId = identity(change.requestId);
    const basis = {
      sessionId,
      requestId,
      expectedSessionRevision: snapshot.sessionRevision,
    };
    let result: unknown;
    if (change.action === "resume") {
      if (!snapshot.admissionPaused && !snapshot.idleQueueResumeAvailable)
        throw new Error("native_chat_queue_not_paused");
      result = await this.process.request(
        "_co.grida/session/resume-queue",
        basis
      );
    } else {
      const queue = observed.get(snapshot)!.queue;
      const index = queue.findIndex((item) => item.inputId === change.inputId);
      if (index < 0) throw new Error("native_chat_queue_input_unavailable");
      if (change.action === "replace") {
        if (queue[index].goalStart)
          throw new Error("queued_goal_requires_withdrawal");
        if (queue[index].allowsConfigurationChange)
          throw new Error("queued_configuration_requires_withdrawal");
        const prompt = textPrompt(change.text);
        const input = await this.readQueueInput(sessionId, queue[index]);
        this.requireAttached(session);
        revalidate?.();
        if (input.text === null)
          throw new Error("native_chat_queue_input_unavailable");
        const replacementInputId = `desktop-replacement-${createHash("sha256")
          .update(JSON.stringify([sessionId, requestId]))
          .digest("hex")}`;
        result = await this.process.request("_co.grida/session/replace", {
          queue: basis,
          inputId: change.inputId,
          replacementInputId,
          prompt,
        });
      } else if (change.action === "withdraw") {
        result = await this.process.request("_co.grida/session/withdraw", {
          queue: basis,
          inputId: change.inputId,
        });
      } else {
        const ids = queue.map((row) => row.inputId);
        const other =
          change.action === "place"
            ? change.index
            : index + (change.direction === "up" ? -1 : 1);
        if (other < 0 || other >= ids.length || other === index)
          throw new Error("native_chat_queue_move_unavailable");
        ids.splice(other, 0, ...ids.splice(index, 1));
        result = await this.process.request("_co.grida/session/reorder", {
          queue: basis,
          inputIds: ids,
        });
      }
    }
    const reply = object(result);
    if (reply.sessionId !== sessionId || reply.requestId !== requestId)
      throw invalidResponse();
    return {
      sessionId,
      requestId,
      sessionRevision: revision(reply.sessionRevision),
    };
  }

  async steer(
    session: NativeChatSession,
    snapshot: NativeChatSnapshot,
    input: NativeChatSteer
  ): Promise<NativeChatControlReceipt> {
    const { task, current } = this.task(session, snapshot, input.requestId);
    if (
      current.cancelled ||
      (current.disposition !== "running" && current.disposition !== "suspended")
    )
      throw new Error("native_chat_steering_unavailable");
    const result = await this.process.request("_co.grida/session/steer", {
      task,
      expectedHistoryPosition: current.historyPosition,
      prompt: textPrompt(input.text),
    });
    return controlReceipt(result, task);
  }

  async goal(
    session: NativeChatSession,
    snapshot: NativeChatSnapshot
  ): Promise<NativeGoalInspection> {
    const sessionId = this.requireObservation(session, snapshot);
    const goal = await this.goals.inspect(
      sessionId,
      snapshot.sessionRevision,
      this.process.acceptsGoalCompletion,
      this.process.acceptsGoalManualContinuation
    );
    this.requireAttached(session);
    return goal;
  }

  async startGoal(
    session: NativeChatSession,
    inputId: string,
    request: unknown
  ): Promise<NativeChatAcceptance> {
    const sessionId = this.requireAttached(session);
    const accepted = await this.goals.start(
      sessionId,
      identity(inputId),
      request,
      {
        fundedReview: this.acceptsGoalEffort,
        namedChild: this.process.acceptsGoalNamedChild,
        wakeups: this.acceptsWakeups,
        spending: this.process.acceptsGoalSpending,
      }
    );
    return acceptance(accepted, sessionId, inputId);
  }

  controlGoal(
    session: NativeChatSession,
    inspection: NativeGoalInspection,
    change: NativeChatGoalControl
  ): Promise<NativeChatGoalReceipt> {
    return this.goals.control(
      this.requireAttached(session),
      inspection,
      change,
      this.acceptsGoalEffort
    );
  }

  async transcript(
    session: NativeChatSession
  ): Promise<readonly NativeChatMessage[]> {
    const id = this.requireAttached(session);
    if (this.unverifiedTranscripts.has(id))
      throw new Error("native_chat_transcript_delivery_unverified");
    const existing = this.transcripts.get(id);
    if (existing?.result) return existing.result;
    if (existing) throw new Error("native_chat_transcript_replay_busy");
    const capture: TranscriptCapture = {
      messages: new Map(),
      bytes: 0,
      overflow: false,
    };
    this.transcripts.set(id, capture);
    capture.result = this.process
      .request("session/load", {
        sessionId: id,
        cwd: this.cwd,
        mcpServers: [],
      })
      .then((reply) => {
        object(reply);
        this.requireAttached(session);
        if (capture.overflow)
          throw new Error("native_chat_transcript_too_large");
        return [...capture.messages.values()];
      })
      .catch((error: unknown) => {
        // ACP replay chunks have no request ID. A timed-out replay can still
        // produce chunks on this connection, so it cannot be retried in place.
        if (
          error instanceof Error &&
          error.message === "native_agent_request_timeout"
        )
          this.unverifiedTranscripts.add(id);
        throw error;
      })
      .finally(() => {
        if (this.transcripts.get(id) === capture) this.transcripts.delete(id);
      });
    return capture.result;
  }

  async transcriptPage(
    session: NativeChatSession,
    before?: unknown
  ): Promise<NativeChatTranscriptPage> {
    const id = this.requireAttached(session);
    const cursor = before === undefined ? undefined : transcriptCursor(before);
    if (!this.process.acceptsTranscriptWindow) {
      if (cursor) throw new Error("native_chat_transcript_window_unavailable");
      return { view: 0, messages: await this.transcript(session), older: null };
    }
    if (this.transcripts.has(id))
      throw new Error("native_chat_transcript_replay_busy");
    const requestId = randomUUID();
    const capture: TranscriptCapture = {
      messages: new Map(),
      bytes: 0,
      overflow: false,
      requestId,
    };
    this.transcripts.set(id, capture);
    try {
      const response = object(
        await this.process.request("session/load", {
          sessionId: id,
          cwd: this.cwd,
          mcpServers: [],
          _meta: {
            [TRANSCRIPT_WINDOW]: { kind: "read", requestId, before: cursor },
          },
        })
      );
      this.requireAttached(session);
      const page = object(object(response._meta)[TRANSCRIPT_WINDOW]);
      if (page.requestId !== requestId) throw invalidResponse();
      if (capture.overflow) throw new Error("native_chat_transcript_too_large");
      const older =
        page.older === null ? null : JSON.stringify(object(page.older));
      if (older !== null) transcriptCursor(older);
      return {
        view: revision(page.view),
        messages: [...capture.messages.values()],
        turns: turnRecords(page.turns),
        older,
      };
    } finally {
      if (this.transcripts.get(id) === capture) this.transcripts.delete(id);
    }
  }

  async approvals(
    session: NativeChatSession,
    snapshot: NativeChatSnapshot
  ): Promise<readonly NativeApprovalReview[]> {
    const sessionId = this.requireObservation(session, snapshot);
    const current = snapshot.current;
    const permissions = this.process.permissions;
    if (
      !permissions ||
      current?.disposition !== "suspended" ||
      current.paused ||
      current.cancelled
    )
      return [];
    const reviews = await permissions.list(sessionId, current.turnId);
    this.requireAttached(session);
    if (
      reviews.some(
        (review) =>
          review.sessionRevision !== snapshot.sessionRevision ||
          review.controlRevision !== current.controlRevision
      )
    )
      throw new Error("native_chat_approval_changed");
    return reviews;
  }

  async answerApproval(
    session: NativeChatSession,
    review: NativeApprovalReview,
    decision: NativeChatApprovalDecision
  ): Promise<NativeChatControlReceipt> {
    const sessionId = this.requireAttached(session);
    const permissions = this.process.permissions;
    if (!permissions || review.sessionId !== sessionId)
      throw new Error("native_chat_approval_unavailable");
    return permissions.answer(review, decision);
  }

  async questions(
    session: NativeChatSession,
    snapshot: NativeChatSnapshot
  ): Promise<readonly NativeQuestionReview[]> {
    const sessionId = this.requireObservation(session, snapshot);
    const current = snapshot.current;
    if (!current || current.cancelled) return [];
    const result = object(
      await this.process.request("_co.grida/session/questions", {
        sessionId,
        turnId: current.turnId,
      })
    );
    this.requireAttached(session);
    if (
      result.sessionId !== sessionId ||
      result.turnId !== current.turnId ||
      result.controlRevision !== current.controlRevision ||
      result.historyPosition !== current.historyPosition
    )
      throw new Error("native_chat_question_changed");
    if (!Array.isArray(result.questions)) throw invalidResponse();
    const reviews = result.questions.map((value: unknown) => {
      const entry = object(value);
      const waitId = identity(entry.waitId);
      const style = choice(entry.style, [
        "answer_dependent",
        "nonblocking",
      ] as const);
      const question = boundedText(entry.question, 2048);
      if (!Array.isArray(entry.options) || entry.options.length > 6)
        throw invalidResponse();
      const options = entry.options.map((option: unknown) =>
        boundedText(option, 256)
      );
      if (
        new Set(options.map((option) => option.trim())).size !== options.length
      )
        throw invalidResponse();
      const expectedHistoryPosition = current.historyPosition;
      const requestId = `desktop-question-${createHash("sha256")
        .update(
          JSON.stringify([
            sessionId,
            current.turnId,
            waitId,
            snapshot.sessionRevision,
            current.controlRevision,
            expectedHistoryPosition,
          ])
        )
        .digest("hex")}`;
      const { task } = this.task(session, snapshot, requestId);
      return Object.freeze({
        task: Object.freeze(task),
        waitId,
        expectedHistoryPosition,
        style,
        question,
        options: Object.freeze(options),
      });
    });
    if (new Set(reviews.map(({ waitId }) => waitId)).size !== reviews.length)
      throw invalidResponse();
    for (const review of reviews) this.questionReviews.add(review);
    return reviews;
  }

  async answerQuestion(
    session: NativeChatSession,
    review: NativeQuestionReview,
    answer: NativeChatQuestionAnswer
  ): Promise<NativeChatControlReceipt> {
    if (
      review.task.sessionId !== this.requireAttached(session) ||
      !this.questionReviews.has(review)
    )
      throw new Error("native_chat_question_unavailable");
    const result = await this.process.request(
      "_co.grida/session/answer-question",
      {
        ...review.task,
        waitId: review.waitId,
        expectedHistoryPosition: review.expectedHistoryPosition,
        answer,
      }
    );
    return controlReceipt(result, review.task);
  }

  async librarySelections(
    session: NativeChatSession,
    snapshot: NativeChatSnapshot
  ): Promise<readonly NativeLibrarySelectionReview[]> {
    const sessionId = this.requireObservation(session, snapshot);
    const current = snapshot.current;
    if (
      !this.acceptsLibrarySelection ||
      current?.disposition !== "suspended" ||
      current.cancelled
    )
      return [];
    const result = object(
      await this.process.request("_co.grida/session/library-selections", {
        sessionId,
        turnId: current.turnId,
      })
    );
    this.requireAttached(session);
    if (
      result.sessionId !== sessionId ||
      result.turnId !== current.turnId ||
      result.controlRevision !== current.controlRevision
    )
      throw new Error("native_chat_library_selection_changed");
    if (!Array.isArray(result.selections)) throw invalidResponse();
    const reviews = result.selections.map((value: unknown) => {
      const entry = object(value);
      const waitId = identity(entry.waitId);
      const initialSearchQuery = boundedText(entry.initialSearchQuery, 2048);
      const requestId = `desktop-library-selection-${createHash("sha256")
        .update(
          JSON.stringify([
            sessionId,
            current.turnId,
            waitId,
            snapshot.sessionRevision,
            current.controlRevision,
          ])
        )
        .digest("hex")}`;
      const { task } = this.task(session, snapshot, requestId);
      return Object.freeze({
        task: Object.freeze(task),
        waitId,
        initialSearchQuery,
      });
    });
    if (new Set(reviews.map(({ waitId }) => waitId)).size !== reviews.length)
      throw invalidResponse();
    for (const review of reviews) this.librarySelectionReviews.add(review);
    return reviews;
  }

  async answerLibrarySelection(
    session: NativeChatSession,
    review: NativeLibrarySelectionReview,
    input: unknown
  ): Promise<NativeChatControlReceipt> {
    if (
      review.task.sessionId !== this.requireAttached(session) ||
      !this.acceptsLibrarySelection ||
      !this.librarySelectionReviews.has(review)
    )
      throw new Error("native_chat_library_selection_unavailable");
    const result = await this.process.request(
      "_co.grida/session/answer-library-selection",
      {
        ...review.task,
        waitId: review.waitId,
        answer: librarySelectionAnswer(input),
      }
    );
    return controlReceipt(result, review.task);
  }

  pause(
    session: NativeChatSession,
    snapshot: NativeChatSnapshot,
    requestId: string
  ): Promise<NativeChatControlReceipt> {
    return this.control("pause", session, snapshot, requestId);
  }

  stop(
    session: NativeChatSession,
    snapshot: NativeChatSnapshot,
    requestId: string
  ): Promise<NativeChatControlReceipt> {
    return this.control("stop", session, snapshot, requestId);
  }

  async resume(
    session: NativeChatSession,
    snapshot: NativeChatSnapshot,
    requestId: string,
    cancelledWakeupId?: string
  ): Promise<NativeChatTurn> {
    const { task, current } = this.task(session, snapshot, requestId);
    if (
      current.disposition !== "suspended" ||
      current.cancelled ||
      (cancelledWakeupId === undefined
        ? !current.paused
        : current.paused || !this.acceptsWakeups)
    )
      throw new Error("native_chat_verified_pause_required");
    const response = object(
      await this.process.request("_co.grida/session/resume", {
        task,
        expectedEpoch: current.epoch,
        expectedJournalPosition: current.journalPosition,
        ...(cancelledWakeupId !== undefined && {
          cancelledWakeupId: identity(cancelledWakeupId),
        }),
      })
    );
    const resumed = turn(response.turn);
    if (
      response.requestId !== requestId ||
      resumed.turnId !== task.turnId ||
      resumed.epoch <= current.epoch
    )
      throw invalidResponse();
    return resumed;
  }

  close(): Promise<void> {
    this.closed = true;
    this.sideChats.clear();
    this.attached.clear();
    this.listeners.clear();
    this.lifecycleSeen.clear();
    return this.process.close();
  }

  subscribe(
    session: NativeChatSession,
    listener: (update: NativeChatStreamUpdate) => void
  ): () => void {
    const id = this.requireAttached(session);
    let listeners = this.listeners.get(id);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(id, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (!listeners.size && this.listeners.get(id) === listeners)
        this.listeners.delete(id);
    };
  }

  private publish(params: unknown): void {
    try {
      const notification = object(params);
      const sessionId = identity(notification.sessionId);
      const metadata = notification._meta
        ? object(notification._meta)
        : undefined;
      const lifecycle = metadata?.[LIFECYCLE];
      if (lifecycle !== undefined) {
        const session = this.attached.get(sessionId);
        if (!this.closed && this.onLifecycle && session)
          this.publishLifecycle(session, lifecycle, notification.update);
        return;
      }
      const listeners = this.listeners.get(sessionId);
      const capture = this.transcripts.get(sessionId);
      if (!listeners && !capture) return;
      const update = object(notification.update);
      if (update.sessionUpdate === "tool_call") {
        const replay = metadata?.[TRANSCRIPT_WINDOW];
        if (replay !== undefined) {
          const attribution = object(replay);
          if (capture && capture.requestId === identity(attribution.requestId))
            captureActivity(
              capture,
              identity(attribution.messageId),
              optionalIdentity(attribution.turnId),
              activity(update, attribution)
            );
          return;
        }
        const live = metadata?.["co.grida/session/updates"];
        if (live === undefined || !listeners) return;
        const attribution = object(live);
        const projected: NativeChatStreamUpdate = Object.freeze({
          kind: "activity",
          messageId: identity(attribution.messageId),
          turnId: identity(attribution.turnId),
          activity: activity(update, attribution),
        });
        for (const listener of listeners) {
          try {
            listener(projected);
          } catch {
            /* Observers have independent lifetimes. */
          }
        }
        return;
      }
      const role =
        update.sessionUpdate === "agent_message_chunk"
          ? "assistant"
          : update.sessionUpdate === "user_message_chunk"
            ? "user"
            : null;
      if (!role) return;
      const content = object(update.content);
      if (content.type === "resource_link") {
        // A person's attachment, named in a replayed transcript. Like text,
        // it belongs to the capture its replay request identifies.
        if (
          role !== "user" ||
          metadata?.["co.grida/session/updates"] !== undefined
        )
          return;
        const replay = metadata?.[TRANSCRIPT_WINDOW];
        const attribution = replay === undefined ? undefined : object(replay);
        const requestId =
          attribution === undefined
            ? undefined
            : identity(attribution.requestId);
        if (capture && capture.requestId === requestId)
          captureAttachment(
            capture,
            identity(update.messageId),
            optionalIdentity(attribution?.turnId),
            attachment(content)
          );
        return;
      }
      if (
        content.type !== "text" ||
        typeof content.text !== "string" ||
        Buffer.byteLength(content.text) > MAX_UPDATE_BYTES
      )
        return;
      const meta = metadata?.["co.grida/session/updates"];
      if (meta === undefined) {
        const replay = metadata?.[TRANSCRIPT_WINDOW];
        const attribution = replay === undefined ? undefined : object(replay);
        const requestId =
          attribution === undefined
            ? undefined
            : identity(attribution.requestId);
        if (capture && capture.requestId === requestId)
          captureText(
            capture,
            identity(update.messageId),
            role,
            content.text,
            attribution && {
              turnId: optionalIdentity(attribution.turnId),
              phase: messagePhase(attribution.phase, role),
            }
          );
        return;
      }
      if (!listeners) return;
      const attribution = object(meta);
      const projected: NativeChatStreamUpdate =
        attribution.resyncRequired === true && content.text === ""
          ? Object.freeze({ kind: "resync" })
          : Object.freeze({
              kind: "text",
              role,
              text: content.text,
              messageId: identity(update.messageId),
              turnId: identity(attribution.turnId),
              offsetBytes: revision(attribution.offsetBytes),
              replace: flag(attribution.replace),
            });
      for (const listener of listeners) {
        try {
          listener(projected);
        } catch {
          /* Observers have independent lifetimes. */
        }
      }
    } catch {
      // Unknown or unattributed ACP events do not enter the renderer bridge.
    }
  }

  private publishLifecycle(
    session: NativeChatSession,
    value: unknown,
    projection: unknown
  ): void {
    const update = object(projection);
    const content = object(update.content);
    if (
      update.sessionUpdate !== "agent_message_chunk" ||
      content.type !== "text" ||
      content.text !== ""
    )
      return;
    const record = object(value);
    if (Object.keys(record).length !== 3) return;
    const turnId = identity(record.turnId);
    const sessionId = session.id;
    const { kind, status } = record;
    let event: NativeChatLifecycle;
    if (kind === "approval_required") {
      event = { kind, sessionId, turnId, waitId: identity(record.waitId) };
    } else if (
      kind === "settled" &&
      (status === "succeeded" ||
        status === "failed" ||
        status === "cancelled" ||
        status === "uncertain")
    ) {
      event = { kind, sessionId, turnId, status };
    } else return;
    const key = JSON.stringify(event);
    if (this.lifecycleSeen.has(key)) return;
    this.lifecycleSeen.add(key);
    if (this.lifecycleSeen.size > RECENT_LIFECYCLE) {
      const oldest = this.lifecycleSeen.values().next().value;
      if (oldest !== undefined) this.lifecycleSeen.delete(oldest);
    }
    this.onLifecycle?.(event, () => this.ownsSession(session));
  }

  private async control(
    action: "pause" | "stop",
    session: NativeChatSession,
    snapshot: NativeChatSnapshot,
    requestId: string
  ): Promise<NativeChatControlReceipt> {
    const { task } = this.task(session, snapshot, requestId);
    const result = await this.process.request(
      `_co.grida/session/${action}`,
      task
    );
    return controlReceipt(result, task);
  }

  private task(
    session: NativeChatSession,
    snapshot: NativeChatSnapshot,
    requestId: string
  ): { task: TaskBasis; current: NativeChatTurn } {
    const sessionId = this.requireObservation(session, snapshot);
    const current = snapshot.current;
    if (!current) throw new Error("native_chat_turn_observation_required");
    return {
      current,
      task: {
        sessionId,
        turnId: current.turnId,
        requestId: identity(requestId),
        expectedSessionRevision: snapshot.sessionRevision,
        expectedControlRevision: current.controlRevision,
      },
    };
  }

  private requireObservation(
    session: NativeChatSession,
    snapshot: NativeChatSnapshot
  ): string {
    const sessionId = this.requireAttached(session);
    if (
      observed.get(snapshot)?.scope !== this.scope ||
      snapshot.sessionId !== sessionId
    )
      throw new Error("native_chat_turn_observation_required");
    return sessionId;
  }

  private async readQueueInput(sessionId: string, row: QueuePosition) {
    const result = object(
      await this.process.request("_co.grida/session/input", {
        sessionId,
        inputId: row.inputId,
      })
    );
    const receipt = acceptance(result.receipt, sessionId, row.inputId);
    if (
      receipt.inputPosition !== row.inputPosition ||
      !Array.isArray(result.prompt)
    )
      throw invalidResponse();
    const part = result.prompt.length === 1 ? object(result.prompt[0]) : null;
    const text =
      part?.type === "text" &&
      typeof part.text === "string" &&
      Buffer.byteLength(part.text) <= MAX_TEXT_BYTES
        ? part.text
        : null;
    return { receipt, text };
  }

  private attach(id: string): NativeChatSession {
    this.requireOpen();
    const existing = this.attached.get(id);
    if (existing) return existing;
    const session = Object.freeze({ id });
    this.attached.set(id, session);
    return session;
  }

  private requireAttached(session: NativeChatSession): string {
    this.requireOpen();
    if (!this.ownsSession(session))
      throw new Error("native_chat_attachment_required");
    return session.id;
  }

  private subagentScope(
    parent: NativeChatSession,
    check: () => void
  ): () => void {
    return () => {
      this.requireAttached(parent);
      if (!this.process.acceptsSubagents)
        throw new Error("native_chat_subagent_unavailable");
      check();
    };
  }

  private requireOpen(): void {
    if (this.closed) throw new Error("native_chat_closed");
  }
}

function transcriptCursor(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || Buffer.byteLength(value) > 1024)
    throw new Error("native_chat_transcript_cursor_invalid");
  try {
    return object(JSON.parse(value));
  } catch {
    throw new Error("native_chat_transcript_cursor_invalid");
  }
}

function captureText(
  capture: TranscriptCapture,
  messageId: string,
  role: NativeChatMessage["role"],
  text: string,
  attribution?: Pick<NativeChatMessage, "turnId" | "phase">
): void {
  if (capture.overflow) return;
  const previous = capture.messages.get(messageId);
  capture.bytes += Buffer.byteLength(text);
  if (
    capture.bytes > MAX_TRANSCRIPT_BYTES ||
    (!previous && capture.messages.size >= MAX_TRANSCRIPT_MESSAGES)
  ) {
    capture.overflow = true;
    capture.messages.clear();
    return;
  }
  if (previous && previous.role !== role) throw invalidResponse();
  capture.messages.set(messageId, {
    ...previous,
    ...(attribution?.turnId && { turnId: attribution.turnId }),
    ...(attribution?.phase && { phase: attribution.phase }),
    messageId,
    role,
    text: (previous?.text ?? "") + text,
  });
}

function captureAttachment(
  capture: TranscriptCapture,
  messageId: string,
  turnId: string | undefined,
  entry: NativeChatMessageAttachment
): void {
  if (capture.overflow) return;
  const previous = capture.messages.get(messageId);
  if (previous && previous.role !== "user") throw invalidResponse();
  const recorded = previous?.attachments ?? [];
  if (
    recorded.length >= MAX_MESSAGE_ATTACHMENTS ||
    (!previous && capture.messages.size >= MAX_TRANSCRIPT_MESSAGES)
  ) {
    capture.overflow = true;
    capture.messages.clear();
    return;
  }
  capture.messages.set(messageId, {
    messageId,
    role: "user",
    text: "",
    ...previous,
    ...(turnId && { turnId }),
    attachments: [...recorded, entry],
  });
}

/** Validate one attachment link. Its URI names a host-held asset and is not kept. */
function attachment(
  content: Record<string, unknown>
): NativeChatMessageAttachment {
  const { name, mimeType, size } = content;
  if (
    typeof name !== "string" ||
    !name ||
    Buffer.byteLength(name) > MAX_ATTACHMENT_NAME_BYTES ||
    (mimeType !== undefined &&
      mimeType !== null &&
      (typeof mimeType !== "string" ||
        !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mimeType)))
  )
    throw invalidResponse();
  return Object.freeze({
    name,
    ...(typeof mimeType === "string" && { mimeType }),
    ...(size !== undefined && size !== null && { size: revision(size) }),
  });
}

function captureActivity(
  capture: TranscriptCapture,
  messageId: string,
  turnId: string | undefined,
  entry: NativeChatActivity
): void {
  if (capture.overflow) return;
  const previous = capture.messages.get(messageId);
  if (previous && previous.role !== "assistant") throw invalidResponse();
  const recorded = previous?.activity ?? [];
  if (recorded.some((item) => item.callId === entry.callId))
    throw invalidResponse();
  if (
    recorded.length >= MAX_MESSAGE_ACTIVITY ||
    (!previous && capture.messages.size >= MAX_TRANSCRIPT_MESSAGES)
  ) {
    capture.overflow = true;
    capture.messages.clear();
    return;
  }
  capture.messages.set(messageId, {
    messageId,
    role: "assistant",
    text: "",
    ...previous,
    ...(turnId && { turnId }),
    activity: [...recorded, entry],
  });
}

/** Validate one projected tool call. Unknown host values are refused. */
function activity(
  update: Record<string, unknown>,
  attribution: Record<string, unknown>
): NativeChatActivity {
  const kind = attribution.activity;
  const outcome = attribution.outcome;
  if (
    typeof kind !== "string" ||
    !ACTIVITY_KINDS.has(kind as NativeChatActivity["kind"]) ||
    typeof outcome !== "string" ||
    !ACTIVITY_OUTCOMES.has(outcome as NativeChatActivity["outcome"])
  )
    throw invalidResponse();
  const source =
    attribution.source === undefined ? undefined : identity(attribution.source);
  if (source !== undefined && kind !== "integration") throw invalidResponse();
  const input = toolDetail(update.rawInput);
  const output = toolOutput(update.rawOutput);
  return Object.freeze({
    callId: identity(update.toolCallId),
    title: identity(update.title),
    kind: kind as NativeChatActivity["kind"],
    ...(source !== undefined && { source }),
    outcome: outcome as NativeChatActivity["outcome"],
    ...(input !== undefined && { input }),
    ...(output !== undefined && { output }),
  });
}

/** The largest tool detail a call may carry; the host shortens its values. */
const MAX_TOOL_DETAIL_BYTES = 64 * 1024;

/** A tool call's display arguments, bounded. Absent or oversized is omitted. */
function toolDetail(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  const text = JSON.stringify(value);
  if (text === undefined || text.length > MAX_TOOL_DETAIL_BYTES)
    return undefined;
  return JSON.parse(text);
}

function toolOutput(value: unknown): NativeChatActivity["output"] {
  if (value === undefined || value === null) return undefined;
  const output = object(value);
  if (typeof output.text !== "string" || typeof output.truncated !== "boolean")
    throw invalidResponse();
  const structured = toolDetail(output.structured);
  return Object.freeze({
    text: output.text.slice(0, MAX_TOOL_DETAIL_BYTES),
    truncated: output.truncated,
    ...(structured !== undefined && { structured }),
  });
}

function optionalIdentity(value: unknown): string | undefined {
  return value === undefined ? undefined : identity(value);
}

function messagePhase(
  value: unknown,
  role: NativeChatMessage["role"]
): NativeChatMessage["phase"] {
  if (value === undefined) return undefined;
  if (role !== "assistant" || (value !== "answer" && value !== "progress"))
    throw invalidResponse();
  return value;
}

function turnRecords(value: unknown): NativeChatTurnRecord[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_TRANSCRIPT_MESSAGES)
    throw invalidResponse();
  return value.map((item) => {
    const record = object(item);
    const { status } = record;
    if (status !== null && !TURN_RECORD_STATUSES.has(status))
      throw invalidResponse();
    const time = (field: unknown) =>
      field === undefined || field === null ? undefined : revision(field);
    const startedAtMs = revision(record.startedAtMs);
    const settledAtMs = time(record.settledAtMs);
    if (settledAtMs !== undefined && settledAtMs < startedAtMs)
      throw invalidResponse();
    if (record.goalStart !== undefined && record.goalStart !== true)
      throw invalidResponse();
    const contextTokens = time(record.contextTokens);
    const compaction = compactionFact(record.compaction);
    return Object.freeze({
      turnId: identity(record.turnId),
      status: status as NativeChatTurnRecord["status"],
      startedAtMs,
      ...(settledAtMs !== undefined && { settledAtMs }),
      ...(record.goalStart === true && { goalStart: true as const }),
      ...(contextTokens !== undefined && { contextTokens }),
      ...(compaction && { compaction }),
    });
  });
}

/** The longest compaction summary a turn record carries. */
const MAX_COMPACTION_SUMMARY = 64 * 1024;

function compactionFact(value: unknown): NativeChatTurnRecord["compaction"] {
  if (value === undefined || value === null) return undefined;
  const fact = object(value);
  if (
    typeof fact.summary !== "string" ||
    fact.summary.length > MAX_COMPACTION_SUMMARY ||
    typeof fact.automatic !== "boolean"
  )
    throw invalidResponse();
  return Object.freeze({ summary: fact.summary, automatic: fact.automatic });
}

function acceptance(
  value: unknown,
  sessionId: string,
  inputId: string
): NativeChatAcceptance {
  const result = object(value);
  if (result.sessionId !== sessionId || result.inputId !== inputId)
    throw invalidResponse();
  return Object.freeze({
    sessionId,
    inputId,
    inputPosition: revision(result.inputPosition),
    turnId: result.turnId === null ? null : identity(result.turnId),
    disposition: choice(result.disposition, INPUT_DISPOSITIONS),
    ...(result.replacementInputId === undefined
      ? {}
      : { replacementInputId: identity(result.replacementInputId) }),
  });
}

function turn(value: unknown): NativeChatTurn {
  const result = object(value);
  return Object.freeze({
    turnId: identity(result.turnId),
    epoch: revision(result.epoch),
    journalPosition: revision(result.journalPosition),
    historyPosition: revision(result.historyPosition),
    controlRevision: revision(result.controlRevision),
    paused: flag(result.paused),
    cancelled: flag(result.cancelled),
    disposition: choice(result.disposition, TURN_DISPOSITIONS),
    status:
      result.status === null ? null : choice(result.status, TURN_STATUSES),
  });
}

function controlReceipt(
  value: unknown,
  task: TaskBasis
): NativeChatControlReceipt {
  const result = object(value);
  const { sessionId, turnId, requestId } = task;
  if (
    result.sessionId !== sessionId ||
    result.turnId !== turnId ||
    result.requestId !== requestId
  )
    throw invalidResponse();
  return Object.freeze({
    sessionId,
    turnId,
    requestId,
    sessionRevision: revision(result.sessionRevision),
    journalPosition: revision(result.journalPosition),
  });
}

function boundedText(value: unknown, bytes: number): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    Buffer.byteLength(value) > bytes
  )
    throw invalidResponse();
  return value;
}

function textPrompt(text: string) {
  if (
    typeof text !== "string" ||
    !text.trim() ||
    Buffer.byteLength(text) > MAX_TEXT_BYTES
  )
    throw new Error("native_chat_text_invalid");
  return [{ type: "text", text }];
}

function pngPrompt(value: unknown) {
  if (
    !(value instanceof ArrayBuffer) ||
    value.byteLength > MAX_ATTACHMENT_BYTES
  )
    throw new Error("image_size_limit");
  return {
    type: "image",
    mimeType: "image/png",
    data: pngData(Buffer.from(value)),
  };
}

function pngData(bytes: Buffer): string {
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE))
    throw new Error("invalid_png_image");
  return bytes.toString("base64");
}

function librarySelectionAnswer(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("native_chat_library_selection_answer_invalid");
  const answer = object(value);
  const fields = Object.keys(answer).length;
  if (answer.kind === "skipped" && fields === 1) return { kind: "skipped" };
  if (
    answer.kind !== "selected" ||
    fields !== 3 ||
    typeof answer.id !== "string" ||
    !LIBRARY_OBJECT_ID.test(answer.id) ||
    !(answer.png instanceof Uint8Array)
  )
    throw new Error("native_chat_library_selection_answer_invalid");
  if (answer.png.byteLength > MAX_ATTACHMENT_BYTES)
    throw new Error("image_size_limit");
  return {
    kind: "selected",
    id: answer.id.toLowerCase(),
    data: pngData(Buffer.from(answer.png)),
  };
}

function selectedFile(name: unknown, value: unknown) {
  if (
    typeof name !== "string" ||
    !name ||
    Buffer.byteLength(name) > 256 ||
    name.includes("/") ||
    name.includes("\\") ||
    /\p{Cc}/u.test(name)
  )
    throw new Error("retained_file_name_invalid");
  if (
    !(value instanceof ArrayBuffer) ||
    value.byteLength > MAX_ATTACHMENT_BYTES
  )
    throw new Error("file_size_limit");
  return { name, data: Buffer.from(value).toString("base64") };
}

function queuePositions(
  value: unknown,
  count: number
): readonly QueuePosition[] {
  if (
    !Array.isArray(value) ||
    value.length !== count ||
    count > MAX_QUEUE_INPUTS
  )
    throw invalidResponse();
  const queue = value.map((entry: unknown) => {
    const row = object(entry);
    const settings = object(row.settings);
    return {
      inputId: identity(row.inputId),
      inputPosition: revision(row.inputPosition),
      ...(settings.operatingRegime === "plan" && {
        operatingRegime: "plan" as const,
      }),
      ...(settings.effort === "ultra" && { effort: "ultra" as const }),
      ...(settings.configurationPermission === "change" && {
        allowsConfigurationChange: true as const,
      }),
      ...(settings.goalStart === undefined
        ? {}
        : {
            goalStart: NativeAgentGoals.readStoredRequest({
              ...object(settings.goalStart),
              ...(settings.goalMaxCostMills !== undefined && {
                maxCostMills: settings.goalMaxCostMills,
              }),
            }),
          }),
    };
  });
  if (new Set(queue.map((row) => row.inputId)).size !== count)
    throw invalidResponse();
  return queue;
}

function identity(value: unknown): string {
  if (typeof value !== "string" || !IDENTITY.test(value))
    throw invalidResponse();
  return value;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalidResponse();
  return value as Record<string, unknown>;
}

function revision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw invalidResponse();
  return value;
}

function catalogTitle(value: unknown): string | null {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    !value.length ||
    Buffer.byteLength(value) > MAX_TITLE_BYTES ||
    /\p{Cc}/u.test(value)
  )
    throw invalidResponse();
  return value;
}

function catalogEntry(
  value: unknown,
  sessionId: string
): NativeChatCatalogEntry {
  const entry = object(value);
  if (entry.sessionId !== sessionId) throw invalidResponse();
  return Object.freeze({
    sessionId,
    revision: revision(entry.revision),
    title: catalogTitle(entry.title),
    archived: flag(entry.archived),
  });
}

function catalogChange(value: unknown): NativeChatCatalogChange {
  const change = object(value);
  if (
    Object.keys(change).length !== 3 ||
    (typeof change.title === "string" && change.title.length > MAX_TITLE_BYTES)
  )
    throw invalidResponse();
  return {
    revision: revision(change.revision),
    title: catalogTitle(
      typeof change.title === "string"
        ? change.title.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, "")
        : change.title
    ),
    archived: flag(change.archived),
  };
}

function flag(value: unknown): boolean {
  if (typeof value !== "boolean") throw invalidResponse();
  return value;
}

function tokenUsage(value: unknown): NativeChatTokenUsage | undefined {
  if (value === undefined) return undefined;
  try {
    const usage = object(value);
    if (
      !Array.isArray(usage.reported) ||
      usage.reported.length > TOKEN_CATEGORIES.length
    )
      return undefined;
    const attemptsWithoutCounts = revision(usage.attemptsWithoutCounts);
    const seen = new Set<string>();
    const reported = usage.reported.map((value: unknown) => {
      const row = object(value);
      const category = choice(row.category, TOKEN_CATEGORIES);
      if (
        seen.has(category) ||
        typeof row.tokens !== "string" ||
        !/^(0|[1-9][0-9]{0,38})$/.test(row.tokens)
      )
        throw invalidResponse();
      seen.add(category);
      return Object.freeze({
        category,
        tokens: row.tokens,
        partial: flag(row.partial),
      });
    });
    if (!reported.length && !attemptsWithoutCounts) return undefined;
    return Object.freeze({
      reported: Object.freeze(reported),
      attemptsWithoutCounts,
    });
  } catch {
    // Older or invalid optional accounting must not hide the settled result.
    return undefined;
  }
}

function gatewayAttempt(value: unknown): NativeChatGatewayAttemptRef {
  const attempt = object(value);
  if (Object.keys(attempt).length !== (attempt.child === undefined ? 2 : 3))
    throw invalidResponse();
  return {
    operationId: identity(attempt.operationId),
    attemptId: identity(attempt.attemptId),
    ...(attempt.child !== undefined && {
      child: gatewayChildRef(attempt.child),
    }),
  };
}

function gatewayChildRef(value: unknown): NativeChatGatewayChildRef {
  const child = object(value);
  if (Object.keys(child).length !== 2) throw invalidResponse();
  return Object.freeze({
    childId: identity(child.childId),
    inputId: identity(child.inputId),
  });
}

function gatewayBilling(
  value: unknown,
  acceptsChildren: boolean,
  after?: NativeChatGatewayChildRef
): NativeChatGatewayBilling | undefined {
  if (value === undefined) return undefined;
  try {
    const billing = object(value);
    const seen = new Set<string>();
    const direct = gatewayBillingAttempts(billing, seen);
    const review =
      billing.review === undefined
        ? undefined
        : gatewayBillingAttempts(object(billing.review), seen);
    const children =
      acceptsChildren && gatewayChildBillingPage(billing.children, after);
    if (
      !direct.attempts.length &&
      !direct.omittedAttempts &&
      !review &&
      !children
    )
      return undefined;
    return Object.freeze({
      ...direct,
      ...(review && { review }),
      ...(children && { children }),
    });
  } catch {
    // Optional billing evidence cannot hide the recorded turn result.
    return undefined;
  }
}

function gatewayChildBillingPage(
  value: unknown,
  after?: NativeChatGatewayChildRef
): NativeChatGatewayChildBillingPage | undefined {
  if (value === undefined) return undefined;
  try {
    const page = object(value);
    if (
      Object.keys(page).length !== (page.nextAfter === undefined ? 2 : 3) ||
      !Array.isArray(page.assignments) ||
      page.assignments.length > MAX_GATEWAY_CHILD_ASSIGNMENTS
    )
      throw invalidResponse();
    const seen = new Set<string>();
    if (after) seen.add(JSON.stringify([after.childId, after.inputId]));
    const assignments = page.assignments.map(
      (value: unknown): NativeChatGatewayChildBilling => {
        const row = object(value);
        if (
          Object.keys(row).length !== (row.billing === undefined ? 4 : 5) ||
          typeof row.name !== "string" ||
          !row.name ||
          row.name.trim() !== row.name ||
          Buffer.byteLength(row.name) > 128 ||
          /\p{Cc}/u.test(row.name)
        )
          throw invalidResponse();
        const childId = identity(row.childId);
        const inputId = identity(row.inputId);
        const key = JSON.stringify([childId, inputId]);
        if (seen.has(key)) throw invalidResponse();
        seen.add(key);
        return Object.freeze({
          childId,
          inputId,
          name: row.name,
          disposition: gatewayChildDisposition(row.disposition),
          ...(row.billing !== undefined && {
            billing: gatewayBillingAttempts(object(row.billing), new Set()),
          }),
        });
      }
    );
    const nextAfter =
      page.nextAfter === undefined
        ? undefined
        : gatewayChildRef(page.nextAfter);
    const last = assignments.at(-1);
    if (
      nextAfter &&
      (nextAfter.childId !== last?.childId ||
        nextAfter.inputId !== last.inputId)
    )
      throw invalidResponse();
    return Object.freeze({
      assignments: Object.freeze(assignments),
      ...(nextAfter && { nextAfter }),
      coverageIncomplete: flag(page.coverageIncomplete),
    });
  } catch {
    // Malformed optional child evidence does not hide the parent result.
    return undefined;
  }
}

function gatewayChildDisposition(
  value: unknown
): NativeChatGatewayChildBilling["disposition"] {
  const row = object(value);
  const kind = choice(row.kind, [
    "queued",
    "claimed",
    "completed",
    "superseded",
    "withdrawn",
  ] as const);
  const fields = Object.keys(row).length;
  if (fields === 1 && (kind === "queued" || kind === "withdrawn"))
    return Object.freeze({ kind });
  if (fields === 2 && (kind === "claimed" || kind === "completed"))
    return Object.freeze({ kind, turn: identity(row.turn) });
  if (fields === 2 && kind === "superseded")
    return Object.freeze({ kind, replacement: identity(row.replacement) });
  throw invalidResponse();
}

function gatewayBillingAttempts(
  billing: Record<string, unknown>,
  seen: Set<string>
): NativeChatGatewayBillingAttempts {
  if (!Array.isArray(billing.attempts) || billing.attempts.length > 32)
    throw invalidResponse();
  const omittedAttempts = revision(billing.omittedAttempts);
  const attempts: NativeChatGatewayBillingAttempt[] = billing.attempts.map(
    (entry: unknown) => {
      const row = object(entry);
      const attempt = {
        operationId: identity(row.operationId),
        attemptId: identity(row.attemptId),
      };
      const key = JSON.stringify([attempt.operationId, attempt.attemptId]);
      if (seen.has(key)) throw invalidResponse();
      seen.add(key);
      if (row.kind === "settled") {
        const settled = NativeGatewayConnection.billingResult({
          kind: row.kind,
          chargedMills: row.chargedMills,
        });
        if (
          settled.kind !== "settled" ||
          row.refreshable !== false ||
          Object.keys(row).length !== 5
        )
          throw invalidResponse();
        return Object.freeze({ ...attempt, ...settled, refreshable: false });
      }
      if (Object.keys(row).length !== 4) throw invalidResponse();
      return Object.freeze({
        ...attempt,
        kind: choice(row.kind, ["pending", "unavailable"] as const),
        refreshable: flag(row.refreshable),
      });
    }
  );
  return Object.freeze({
    attempts: Object.freeze(attempts),
    omittedAttempts,
  });
}

function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  const match = choices.find((candidate) => candidate === value);
  if (!match) throw invalidResponse();
  return match;
}

function invalidResponse(): Error {
  return new Error("native_chat_invalid_protocol_value");
}

function isCatalogCursor(value: unknown): value is string {
  return typeof value === "string" && CATALOG_CURSOR.test(value);
}

const EFFORT_CHOICES = [
  "low",
  "medium",
  "high",
  "xhigh",
  "ultra",
  "standard",
] as const;

/**
 * The host keeps reasoning and the extended harness as separate facts. Ultra
 * selects both the highest reasoning level and the extended harness.
 */
function hostEffort(effort: NativeChatEffort | undefined): {
  effort?: "ultra";
  reasoning?: "low" | "medium" | "high" | "xhigh";
} {
  switch (effort) {
    case undefined:
      return {};
    case "ultra":
      return { effort: "ultra", reasoning: "xhigh" };
    case "standard":
      return { reasoning: "medium" };
    default:
      return { reasoning: effort };
  }
}
