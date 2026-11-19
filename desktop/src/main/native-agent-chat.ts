// GRIDA-SEC-004 — attached native chat controls owned by Electron main.
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  NativeChatAcceptance,
  NativeChatApprovalDecision,
  NativeChatBackgroundProcess,
  NativeChatCatalogChange,
  NativeChatCatalogEntry,
  NativeChatCommand,
  NativeChatCommandResult,
  NativeChatRevisionInput,
  NativeChatRevisionReceipt,
  NativeChatRevisionTarget,
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
  NativeChatToolImage,
  NativeChatMessage,
  NativeChatMessageContext,
  NativeChatMessageAttachment,
  NativeChatTranscriptPage,
  NativeChatTurnRecord,
  NativeChatOperatingRegime,
  NativeChatPermissionMode,
  NativeChatPermissionState,
  NativeChatPage,
  NativeChatQuestion,
  NativeChatQuestionAnswer,
  NativeChatQueueChange,
  NativeChatQueuedMessage,
  NativeChatQueueItem,
  NativeChatQueuePage,
  NativeChatQueueReceipt,
  NativeChatSideRefusal,
  NativeChatSideSnapshot,
  NativeChatSnapshot,
  NativeChatSteer,
  NativeChatStreamUpdate,
  NativeChatTokenUsage,
  NativeChatTurn,
  NativeChatTurnSummary,
  NativeEditorObservation,
  NativeEditorSurfaceSnapshot,
  NativeSubagentAssignmentInput,
  NativeSubagentCreate,
} from "@grida/desktop-bridge";
import {
  parseNativeChatDisplayParts,
  parseNativeChatMessageContext,
} from "@grida/desktop-bridge";
import { NativeAgentPermissionModes } from "./native-agent-permission-mode";
import { NativeAgentArtifacts } from "./native-agent-artifacts";
import { NativeFileReference } from "./native-file-reference";
import { NativeInputImages } from "./native-input-images";
import { NativeToolImages } from "./native-tool-images";
import { NativeQueuedMessages } from "./native-queued-messages";
import { NativeSelectedImages } from "./native-selected-images";
import { NativeAgentBackgroundProcesses } from "./native-agent-background-processes";
import { NativeAgentHooks, type NativeHookReview } from "./native-agent-hooks";
import type { NativeHookInspection } from "@grida/desktop-bridge";
import type {
  NativeEditorSurfaceDelivery,
  NativeEditorSurfaceSelection,
  NativeEditorSvgTextDelivery,
} from "./native-editor-surfaces";
import type { DesktopBrowserToolLease } from "./desktop-browser-tools";
import type { NativeApprovalReview } from "./native-agent-permissions";
import { NativeAgentDeletion } from "./native-agent-deletion";
import { NativeAgentCommands } from "./native-agent-commands";
import { NativeAgentRevisions } from "./native-agent-revisions";
import { NativeAgentSubagents } from "./native-agent-subagents";
import { NativeSubagentActivity } from "./native-subagent-activity";
import { NativeActivityOrder } from "./native-activity-order";
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
import type { NativeChatSelections } from "./native-chat-selections";
import { NativeChatTitle } from "./native-chat-title";

const CAPABILITIES = {
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
  "co.grida/settings/archive-catalog": 1,
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
const NOTIFICATION_PREVIEW_TIMEOUT_MS = 3_000;
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
  /** Main-owned private roots for image custody when no workspace is mounted. */
  protectedPaths?: readonly string[];
  onLifecycle?: (event: NativeChatLifecycle, current: () => boolean) => void;
};

export type NativeChatCompletionPreview = Readonly<{
  title: string | null;
  text: string | null;
}>;

export type NativeChatLifecycle = Readonly<
  { sessionId: string; turnId: string } & (
    | {
        kind: "settled";
        status: NativeChatTurnSummary["status"];
        readPreview?: () => Promise<NativeChatCompletionPreview>;
      }
    | { kind: "approval_required"; waitId: string }
    | {
        kind: "question_asked";
        waitId: string;
        session: NativeChatSession;
        side: boolean;
        title: string | null;
        question: string;
      }
  )
>;

export type NativeChatSession = Readonly<{
  id: string;
  /** Image capability of the fixed execution inherited by a side chat. */
  sideImageInput?: boolean;
}>;
type TaskBasis = Readonly<{
  sessionId: string;
  turnId: string;
  requestId: string;
  expectedSessionRevision: number;
  expectedControlRevision: number;
}>;

export type NativeQuestionReview = Readonly<
  Pick<
    NativeChatQuestion,
    "style" | "question" | "options" | "expiresWithTurn"
  > & {
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
  preview?: string;
  goalStart?: NativeChatGoalRequest;
  operatingRegime?: NativeChatOperatingRegime;
  effort?: "ultra";
}>;
const observed = new WeakMap<
  NativeChatSnapshot,
  { scope: string; queue: readonly QueuePosition[] }
>();
type TranscriptCapture = {
  messages: Map<string, NativeChatMessage>;
  bytes: number;
  overflow: boolean;
  invalidActivityOrder?: true;
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
  private readonly subagentActivityReader = new NativeSubagentActivity(
    (method, params) => this.process.request(method, params),
    () => this.process.acceptsActivityOrder
  );
  private readonly deletion = new NativeAgentDeletion((method, params) =>
    this.process.request(method, params, 10_000)
  );
  private readonly goals = new NativeAgentGoals((method, params) =>
    this.process.request(method, params)
  );
  private readonly sideChats = new NativeAgentSideChats(
    (method, params) => this.process.request(method, params),
    (id) => this.forget(id)
  );
  private readonly backgroundProcesses = new NativeAgentBackgroundProcesses(
    (method, params) => this.process.request(method, params, 10_000)
  );
  private readonly attached = new Map<string, NativeChatSession>();
  private readonly loading = new Map<string, Promise<NativeChatSession>>();
  private readonly transcripts = new Map<string, TranscriptCapture>();
  private readonly inputImages = new NativeInputImages();
  private readonly toolImages = new NativeToolImages();
  private readonly queuedMessages = new NativeQueuedMessages();
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

  get acceptsQueuedTextReplacement(): boolean {
    return this.connected && this.process.acceptsQueuedTextReplacement;
  }

  get acceptsSelectedImage(): boolean {
    return (
      this.connected &&
      this.process.acceptsSelectedImage &&
      this.selectedImages !== undefined
    );
  }

  get supportsSelectedImage(): boolean {
    return (
      this.connected &&
      this.process.supportsSelectedImage &&
      this.selectedImages !== undefined
    );
  }

  get acceptsPermissionMode(): boolean {
    return this.connected && this.process.acceptsPermissionMode;
  }

  async permissionMode(
    session: NativeChatSession
  ): Promise<NativeChatPermissionState> {
    this.requireAttached(session);
    if (!this.acceptsPermissionMode)
      throw new Error("native_chat_permission_mode_unavailable");
    return new NativeAgentPermissionModes(
      (method, input) => this.process.request(method, input),
      this.cwd
    ).inspect(session.id);
  }

  async setPermissionMode(
    session: NativeChatSession,
    revision: number,
    requestId: string,
    mode: NativeChatPermissionMode
  ): Promise<NativeChatPermissionState> {
    this.requireAttached(session);
    if (!this.acceptsPermissionMode)
      throw new Error("native_chat_permission_mode_unavailable");
    return new NativeAgentPermissionModes(
      (method, input) => this.process.request(method, input),
      this.cwd
    ).update(session.id, revision, requestId, mode);
  }

  get acceptsInputRoutes(): boolean {
    return this.connected && this.process.acceptsInputRoutes;
  }

  get acceptsSelection(): boolean {
    return this.connected && this.process.acceptsSelection;
  }

  selectionRequest(
    operation: NativeChatSelections.Operation,
    sessionId: string,
    body: Record<string, unknown> = {}
  ): Promise<unknown> {
    this.requireOpen();
    if (!this.acceptsSelection)
      throw new Error("native_chat_selection_unsupported");
    return this.process.request(
      `_co.grida/session/selection${operation === "inspect" ? "" : `/${operation}`}`,
      { ...body, cwd: this.cwd, sessionId: identity(sessionId) }
    );
  }

  async createSelected(input: {
    sessionId: string;
    requestId: string;
    selection: NativeChatSelections.Selection;
  }): Promise<NativeChatSession> {
    this.requireOpen();
    if (!this.acceptsSelection)
      throw new Error("native_chat_selection_unsupported");
    const result = object(
      await this.process.request("_co.grida/session/selection/create", {
        cwd: this.cwd,
        sessionId: input.sessionId,
        requestId: input.requestId,
        selection: {
          connectionId: input.selection.connectionId,
          model: input.selection.model,
          effort: input.selection.effort,
        },
      })
    );
    if (
      result.sessionId !== input.sessionId ||
      result.operationId !== input.requestId ||
      result.revision !== 1
    )
      throw invalidResponse();
    // Load supplies the same attached observation contract as ordinary chats.
    return this.load(input.sessionId);
  }

  get acceptsLibrarySelection(): boolean {
    return this.connected && this.process.acceptsLibrarySelection;
  }

  get acceptsFile(): boolean {
    return this.connected && this.process.acceptsFile;
  }

  /** Files by reference need the workspace's protected stores to refuse. */
  get acceptsFileReference(): boolean {
    return (
      this.connected &&
      this.process.acceptsFileReference &&
      this.referenceDenials !== undefined
    );
  }

  get acceptsEffort(): boolean {
    return this.connected && this.process.acceptsEffort;
  }

  get acceptsGoalEffort(): boolean {
    return this.connected && this.process.acceptsGoalEffort;
  }

  get acceptsSavedChatDeletion(): boolean {
    return this.connected && this.process.acceptsSavedChatDeletion;
  }

  get acceptsBackgroundProcesses(): boolean {
    return this.connected && this.process.acceptsBackgroundProcesses;
  }

  ownsSession(session: NativeChatSession): boolean {
    return !this.closed && this.attached.get(session.id) === session;
  }

  get hasExited(): boolean {
    return this.process.hasExited;
  }

  get modelChangePending(): boolean {
    return this.process.modelChangePending;
  }

  prepareModelChange(): Promise<void> {
    this.requireOpen();
    return this.process.prepareModelChange();
  }

  private constructor(
    private readonly process: NativeAgentProcess,
    private readonly cwd: string,
    private readonly scope: string,
    private readonly onLifecycle?: NativeAgentChatLaunch["onLifecycle"],
    private readonly hookRegistry?: NativeAgentHooks,
    private readonly referenceDenials?: readonly string[],
    readonly modelId?: string,
    private readonly selectedImages?: NativeSelectedImages
  ) {}

  private readonly lifecycleSeen = new Set<string>();

  static async start({
    cwd,
    onLifecycle,
    protectedPaths,
    ...launch
  }: NativeAgentChatLaunch): Promise<NativeAgentChat> {
    if (
      !path.isAbsolute(cwd) ||
      (await fs.realpath(cwd)) !== cwd ||
      !(await fs.stat(cwd)).isDirectory() ||
      (launch.workspace !== undefined && launch.workspace.primary.path !== cwd)
    )
      throw new Error("native_chat_workspace_invalid");
    const custodyDenials = launch.workspace?.protectedPaths ?? protectedPaths;
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
      launch.hooks,
      launch.workspace && [
        ...launch.workspace.protectedPaths,
        launch.stateDirectory,
      ],
      launch.model,
      custodyDenials !== undefined
        ? new NativeSelectedImages(
            path.join(launch.stateDirectory, "desktop-image-custody"),
            [...custodyDenials, launch.stateDirectory]
          )
        : undefined
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
    const result = await this.process.request(
      archived ? "_co.grida/session/list-archived" : "session/list",
      { cwd: this.cwd, ...(cursor === null ? {} : { cursor }) }
    );
    const { sessions, ...page } = readNativeSessionList(
      result,
      this.cwd,
      cursor,
      archived
    );
    const titles = sessions.flatMap(({ sessionId, title }) =>
      title === null ? [] : [{ sessionId, title }]
    );
    const lastActivity = sessions.flatMap(
      ({ sessionId, lastActivityAtMs: atMs }) =>
        atMs === undefined ? [] : [{ sessionId, atMs }]
    );
    return {
      sessionIds: sessions.map((entry) => entry.sessionId),
      ...page,
      ...(titles.length && { titles }),
      ...(lastActivity.length && { lastActivity }),
    };
  }

  async messageActivityCatalog(cursor: string | null): Promise<unknown> {
    this.requireOpen();
    if (!this.process.acceptsCatalogQuery)
      throw new Error("native_chat_catalog_query_unavailable");
    return this.process.request("session/list", {
      cwd: this.cwd,
      ...(cursor !== null && { cursor }),
      _meta: { "co.grida/catalogOrder": "messageActivity" },
    });
  }

  /** Metadata-only Settings calls never attach or restore a chat. */
  async archiveCatalog(cursor: string | null = null): Promise<unknown> {
    this.requireOpen();
    return this.process.request("_co.grida/settings/archive-catalog", {
      cwd: this.cwd,
      cursor,
    });
  }

  async unarchiveCatalog(sessionId: string, revision: number): Promise<void> {
    this.requireOpen();
    await this.process.request("_co.grida/settings/unarchive", {
      cwd: this.cwd,
      sessionId,
      revision,
    });
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

  subagentActivity(
    parent: NativeChatSession,
    afterChildId: string | undefined,
    check: () => void
  ) {
    return this.subagentActivityReader.activity(
      parent,
      afterChildId,
      this.subagentActivityScope(parent, check)
    );
  }

  subagentConversation(
    attachment: object,
    parent: NativeChatSession,
    childId: string,
    before: string | undefined,
    check: () => void
  ) {
    return this.subagentActivityReader.conversation(
      attachment,
      parent,
      childId,
      before,
      this.subagentActivityScope(parent, check)
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
    session: NativeChatSession,
    timeoutMs?: number
  ): Promise<NativeChatCatalogEntry> {
    const sessionId = this.requireAttached(session);
    const result = await this.process.request(
      "_co.grida/session/catalog-entry",
      { sessionId },
      timeoutMs
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
    // The host discards the deleted chat's side chats with it.
    this.sideChats.forgetParent(sessionId);
    if (!this.ownsSession(session)) return;
    this.forget(sessionId);
  }

  private forget(sessionId: string): void {
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
    // GRIDA-SEC-004: a side chat is lent only to the attachment that opened it.
    if (this.sideChats.has(id)) throw new Error("native_chat_side_unavailable");
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

  /**
   * Open a side chat of `parent` on this connection. The side chat is an
   * ordinary session of this connection; Main lends it only to the attachment
   * that opened it.
   */
  async openSideChat(
    parent: NativeChatSession
  ): Promise<{ session: NativeChatSession; side: NativeSideChat }> {
    const side = await this.sideChats.open(this.requireAttached(parent));
    try {
      this.requireAttached(parent);
    } catch (error) {
      await this.sideChats.close(side.id).catch(() => {});
      throw error;
    }
    return { session: this.attach(side.id, side.imageInput), side };
  }

  /**
   * Discard a side chat this connection opened. A discard the host does not
   * confirm keeps being retried; the side chat is forgotten once it is gone.
   */
  async closeSideChat(session: NativeChatSession): Promise<void> {
    if (!this.sideChats.has(session.id) || !this.ownsSession(session))
      throw new Error("native_chat_side_unavailable");
    await this.sideChats.close(session.id);
  }

  registerEditorSurfaces(
    session: NativeChatSession,
    snapshot: NativeEditorSurfaceSnapshot,
    requireCurrent: () => void,
    deliver: NativeEditorSurfaceDelivery | undefined,
    revision?: number,
    svgText?: NativeEditorSvgTextDelivery,
    browser?: DesktopBrowserToolLease
  ) {
    return this.process.registerEditorSurfaces(
      this.requireAttached(session),
      snapshot,
      requireCurrent,
      deliver,
      revision,
      svgText,
      browser
    );
  }

  get acceptsEditorContext(): boolean {
    return this.process.acceptsEditorContext;
  }

  submit(
    session: NativeChatSession,
    inputId: string,
    text: string,
    operatingRegime?: NativeChatOperatingRegime,
    editorSurfaces?: NativeEditorSurfaceSelection,
    effort?: NativeChatEffort,
    selectionRevision?: number,
    editorContext?: NativeEditorObservation
  ): Promise<NativeChatAcceptance> {
    return this.send("submit", session, inputId, text, operatingRegime, {
      editorSurfaces,
      effort,
      selectionRevision,
      editorContext,
    });
  }

  enqueue(
    session: NativeChatSession,
    inputId: string,
    text: string,
    operatingRegime?: NativeChatOperatingRegime,
    editorSurfaces?: NativeEditorSurfaceSelection,
    effort?: NativeChatEffort,
    selectionRevision?: number,
    editorContext?: NativeEditorObservation
  ): Promise<NativeChatAcceptance> {
    return this.send("enqueue", session, inputId, text, operatingRegime, {
      editorSurfaces,
      effort,
      selectionRevision,
      editorContext,
    });
  }

  /** Running processes first, then ended ones the agent has not collected. */
  async listBackgroundProcesses(
    session: NativeChatSession
  ): Promise<readonly NativeChatBackgroundProcess[]> {
    const sessionId = this.requireAttached(session);
    if (!this.acceptsBackgroundProcesses)
      throw new Error("native_chat_background_processes_unavailable");
    const processes = await this.backgroundProcesses.list(sessionId);
    this.requireAttached(session);
    return processes;
  }

  /** Stops the named processes, or all of the chat's processes when omitted. */
  async stopBackgroundProcesses(
    session: NativeChatSession,
    processIds?: unknown
  ): Promise<readonly number[]> {
    const sessionId = this.requireAttached(session);
    if (!this.acceptsBackgroundProcesses)
      throw new Error("native_chat_background_processes_unavailable");
    return this.backgroundProcesses.stop(sessionId, processIds);
  }

  submitWithLibrarySelection(
    session: NativeChatSession,
    inputId: string,
    text: string,
    operatingRegime?: NativeChatOperatingRegime,
    editorSurfaces?: NativeEditorSurfaceSelection,
    effort?: NativeChatEffort,
    selectionRevision?: number,
    editorContext?: NativeEditorObservation
  ): Promise<NativeChatAcceptance> {
    if (!this.acceptsLibrarySelection)
      return Promise.reject(
        new Error("native_chat_library_selection_unavailable")
      );
    return this.send("submit", session, inputId, text, operatingRegime, {
      allowLibrarySelection: true,
      editorSurfaces,
      effort,
      selectionRevision,
      editorContext,
    });
  }

  private parseMessageContext(
    value: unknown
  ): NativeChatMessageContext | undefined {
    if (value === undefined) return undefined;
    if (!this.process.acceptsMessageContext)
      throw new Error("native_chat_message_context_unavailable");
    const context = parseNativeChatMessageContext(value);
    if (!context) throw new Error("native_chat_message_context_invalid");
    return context;
  }

  async submitMessage(
    session: NativeChatSession,
    value: unknown,
    editorSurfaces?: NativeEditorSurfaceSelection
  ): Promise<NativeChatAcceptance> {
    this.requireAttached(session);
    const input = object(value);
    const known = new Set([
      "action",
      "inputId",
      "text",
      "operatingRegime",
      "effort",
      "selectionRevision",
      "messageContext",
    ]);
    if (
      Object.keys(input).some((key) => !known.has(key)) ||
      typeof input.text !== "string" ||
      input.messageContext === undefined
    )
      throw new Error("native_chat_message_context_invalid");
    return this.send(
      choice(input.action === undefined ? "submit" : input.action, [
        "submit",
        "enqueue",
      ] as const),
      session,
      identity(input.inputId),
      input.text,
      choice(input.operatingRegime, ["act", "plan"] as const),
      {
        editorSurfaces,
        effort:
          input.effort === undefined
            ? undefined
            : choice(input.effort, EFFORT_CHOICES),
        selectionRevision: optionalSelectionRevision(input.selectionRevision),
        messageContext: this.parseMessageContext(input.messageContext),
      }
    );
  }

  private acceptsImageFor(
    session: NativeChatSession,
    selectionRevision: unknown
  ) {
    return (
      session.sideImageInput ??
      (this.acceptsPng ||
        (this.acceptsInputRoutes && selectionRevision !== undefined))
    );
  }

  async submitImage(
    session: NativeChatSession,
    value: unknown
  ): Promise<NativeChatAcceptance> {
    this.requireAttached(session);
    const input = object(value);
    if (!this.acceptsImageFor(session, input.selectionRevision))
      throw new Error("image_input_unavailable");
    const effort =
      input.effort === undefined
        ? undefined
        : choice(input.effort, EFFORT_CHOICES);
    if (
      Object.keys(input).length !==
        (effort ? 6 : 5) +
          Number(input.selectionRevision !== undefined) +
          Number(input.messageContext !== undefined) ||
      typeof input.text !== "string"
    )
      throw invalidResponse();
    return this.send(
      choice(input.action, ["submit", "enqueue"] as const),
      session,
      identity(input.inputId),
      input.text,
      choice(input.operatingRegime, ["act", "plan"] as const),
      {
        image: pngPrompt(input.png),
        effort,
        selectionRevision: optionalSelectionRevision(input.selectionRevision),
        messageContext: this.parseMessageContext(input.messageContext),
      }
    );
  }

  /** Original File custody has already been resolved by preload, never a poster. */
  async submitSelectedImage(
    session: NativeChatSession,
    value: unknown
  ): Promise<NativeChatAcceptance> {
    const sessionId = this.requireAttached(session);
    const input = object(value);
    if (
      !this.acceptsImageFor(session, input.selectionRevision) ||
      !this.supportsSelectedImage ||
      !this.selectedImages
    )
      throw new Error("image_input_unavailable");
    const known = new Set([
      "action",
      "inputId",
      "text",
      "name",
      "path",
      "bytes",
      "operatingRegime",
      "effort",
      "selectionRevision",
      "sha256",
      "size",
      "lastModified",
      "messageContext",
    ]);
    if (
      Object.keys(input).some((key) => !known.has(key)) ||
      typeof input.text !== "string"
    )
      throw invalidResponse();
    const action = choice(input.action, ["submit", "enqueue"] as const);
    const inputId = identity(input.inputId);
    const regime = choice(input.operatingRegime, ["act", "plan"] as const);
    const effort =
      input.effort === undefined
        ? undefined
        : choice(input.effort, EFFORT_CHOICES);
    const selectionRevision = optionalSelectionRevision(
      input.selectionRevision
    );
    if (selectionRevision !== undefined && !this.acceptsSelection)
      throw new Error("native_chat_selection_invalid");
    if (effort === "ultra" && !this.acceptsEffort)
      throw new Error("native_chat_effort_unavailable");
    const messageContext = this.parseMessageContext(input.messageContext);
    textPrompt(input.text, messageContext !== undefined);
    const selectedImage = await this.selectedImages.capture(
      sessionId,
      inputId,
      {
        name: input.name,
        path: input.path,
        bytes: input.bytes,
        sha256: input.sha256,
        size: input.size,
        lastModified: input.lastModified,
      }
    );
    this.requireAttached(session);
    try {
      const result = await this.send(
        action,
        session,
        inputId,
        input.text,
        regime,
        {
          selectedImage,
          effort,
          selectionRevision,
          messageContext,
        }
      );
      // Cleanup failures must not turn a known accepted input into uncertainty.
      await this.selectedImages.complete(sessionId, inputId).catch(() => {});
      return result;
    } catch (error) {
      if (
        error instanceof Error &&
        /^(?:selected_image_(?:changed|symlink|protected|size_limit|unavailable|identity_invalid|snapshot_unavailable)|image_(?:source_size_limit|decode_limit|preparation_limit|input_unavailable)|invalid_raster_image|unsupported_image_format|protected_root_overlap|unsupported_input_modality)$/.test(
          error.message
        )
      )
        await this.selectedImages.complete(sessionId, inputId).catch(() => {});
      throw error;
    }
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
      Object.keys(input).length !==
        (effort ? 7 : 6) +
          Number(input.selectionRevision !== undefined) +
          Number(input.messageContext !== undefined) ||
      typeof input.text !== "string"
    )
      throw invalidResponse();
    return this.send(
      choice(input.action, ["submit", "enqueue"] as const),
      session,
      identity(input.inputId),
      input.text,
      choice(input.operatingRegime, ["act", "plan"] as const),
      {
        file: selectedFile(input.name, input.bytes),
        effort,
        selectionRevision: optionalSelectionRevision(input.selectionRevision),
        messageContext: this.parseMessageContext(input.messageContext),
      }
    );
  }

  /**
   * GRIDA-SEC-004: send a file or folder the person attached by reference. `path` comes
   * from the preload's resolution of their File; it is resolved again here,
   * only its metadata is read, and Grida's protected stores are refused.
   */
  async submitFileReference(
    session: NativeChatSession,
    value: unknown
  ): Promise<NativeChatAcceptance> {
    this.requireAttached(session);
    const denials = this.referenceDenials;
    if (!this.acceptsFileReference || !denials)
      throw new Error("native_chat_file_reference_unavailable");
    const input = object(value);
    const known = new Set([
      "action",
      "inputId",
      "text",
      "path",
      "mimeType",
      "preview",
      "operatingRegime",
      "effort",
      "selectionRevision",
      "messageContext",
    ]);
    if (
      Object.keys(input).some((key) => !known.has(key)) ||
      typeof input.text !== "string"
    )
      throw invalidResponse();
    const effort =
      input.effort === undefined
        ? undefined
        : choice(input.effort, EFFORT_CHOICES);
    const action = choice(input.action, ["submit", "enqueue"] as const);
    const inputId = identity(input.inputId);
    const operatingRegime = choice(input.operatingRegime, [
      "act",
      "plan",
    ] as const);
    const messageContext = this.parseMessageContext(input.messageContext);
    const preview = NativeFileReference.preview(input.preview);
    const resolved = await NativeFileReference.resolve(input.path, {
      cwd: this.cwd,
      protectedPaths: denials,
    });
    return this.send(action, session, inputId, input.text, operatingRegime, {
      reference: NativeFileReference.link(resolved, {
        mimeType: NativeFileReference.mediaType(input.mimeType),
        preview,
      }),
      effort,
      selectionRevision: optionalSelectionRevision(input.selectionRevision),
      messageContext,
    });
  }

  private async send(
    mode: "submit" | "enqueue",
    session: NativeChatSession,
    inputId: string,
    text: string,
    operatingRegime?: NativeChatOperatingRegime,
    options: {
      image?: ReturnType<typeof pngPrompt>;
      selectedImage?: NativeSelectedImages.Descriptor;
      file?: ReturnType<typeof selectedFile>;
      reference?: ReturnType<typeof NativeFileReference.link>;
      allowLibrarySelection?: true;
      editorSurfaces?: NativeEditorSurfaceSelection;
      effort?: NativeChatEffort;
      selectionRevision?: number;
      editorContext?: NativeEditorObservation;
      messageContext?: NativeChatMessageContext;
    } = {}
  ): Promise<NativeChatAcceptance> {
    const sessionId = this.requireAttached(session);
    identity(inputId);
    const {
      image,
      selectedImage,
      file,
      reference,
      allowLibrarySelection,
      editorSurfaces,
      effort,
      selectionRevision,
      editorContext,
      messageContext,
    } = options;
    if (
      selectionRevision !== undefined &&
      (!Number.isSafeInteger(selectionRevision) ||
        selectionRevision < 1 ||
        !this.acceptsSelection)
    )
      throw new Error("native_chat_selection_invalid");
    if (effort === "ultra" && !this.acceptsEffort)
      throw new Error("native_chat_effort_unavailable");
    if (editorContext && !this.acceptsEditorContext)
      throw new Error("native_chat_editor_context_unavailable");
    const prompt = textPrompt(
      text,
      !!messageContext &&
        (!!messageContext.displayParts.length ||
          !!image ||
          !!selectedImage ||
          !!file ||
          !!reference)
    );
    const initialTitle = this.process.acceptsInitialTitle
      ? NativeChatTitle.excerpt(text)
      : undefined;
    return acceptance(
      await this.process.request(`_co.grida/session/${mode}`, {
        sessionId,
        inputId,
        ...(initialTitle && { initialTitle }),
        prompt: [
          ...prompt,
          ...(image ? [image] : []),
          ...(reference ? [reference] : []),
        ],
        ...(file && { selectedFile: file }),
        ...(selectedImage && { selectedImage }),
        ...(operatingRegime && { operatingRegime }),
        ...hostEffort(effort),
        ...(selectionRevision !== undefined && {
          _meta: { "co.grida/selectionRevision": selectionRevision },
        }),
        ...(allowLibrarySelection && { allowLibrarySelection }),
        ...(editorContext && { editorContext }),
        ...(messageContext && { messageContext }),
        ...(operatingRegime === "act" &&
          !image &&
          !selectedImage &&
          !file &&
          !reference &&
          editorSurfaces),
      }),
      sessionId,
      inputId
    );
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
    const accepted = acceptance(result.receipt, sessionId, inputId);
    // A recovered receipt settles Main's unknown temporary custody as well.
    await this.selectedImages?.complete(sessionId, inputId).catch(() => {});
    return accepted;
  }

  async observe(session: NativeChatSession): Promise<NativeChatSnapshot> {
    const sessionId = this.requireAttached(session);
    const result = object(
      await this.process.request("_co.grida/session/snapshot", { sessionId })
    );
    this.requireAttached(session);
    if (result.sessionId !== sessionId) throw invalidResponse();
    const queuedInputs = revision(result.queuedInputs);
    const queue = queuePositions(
      result.queue,
      queuedInputs,
      this.process.acceptsQueuedMessages
    );
    const pending = queue.filter((row) => row.goalStart);
    if (pending.length > 1) throw invalidResponse();
    const current = result.current === null ? null : turn(result.current);
    const admissionPaused = flag(result.admissionPaused);
    // Older hosts expose only the durable queue, without scheduler ownership.
    const canResumeIdleQueue =
      result.idleQueueResumeAvailable === undefined ||
      flag(result.idleQueueResumeAvailable);
    const retryAt = result.retryNotBeforeMs;
    const snapshot = Object.freeze({
      sessionId,
      sessionRevision: revision(result.sessionRevision),
      queuedInputs,
      ...(queuedInputs > 0 && {
        queuePreview: {
          items: queue
            .slice(0, QUEUE_PAGE_SIZE)
            .map((row) =>
              queueItem(row, row.goalStart?.objective ?? row.preview ?? null)
            ),
          offset: 0,
          previousOffset: null,
          nextOffset: queuedInputs > QUEUE_PAGE_SIZE ? QUEUE_PAGE_SIZE : null,
        },
      }),
      ...(pending[0] && { pendingGoalId: pending[0].inputId }),
      ...(this.process.acceptsHistoryRevision && {
        historyRevisionAvailable: true as const,
      }),
      ...(this.process.acceptsSubagents && {
        subagentsAvailable: true as const,
      }),
      ...(this.process.acceptsSubagentActivity && {
        subagentActivityAvailable: true as const,
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
      ...(canResumeIdleQueue &&
        !admissionPaused &&
        !current &&
        queuedInputs > 0 && { idleQueueResumeAvailable: true as const }),
      current,
      latest: result.latest === null ? null : turn(result.latest),
      ...(result.side !== undefined && {
        side: sideSnapshot(result.side, this.sideChats.has(sessionId)),
      }),
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
    const text = summaryText(result, latest.turnId, latest.status);
    if (
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
      text,
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
      let display: NativeChatQueuedMessage | undefined;
      let displayParts: NativeChatMessage["displayParts"];
      let text: string | null;
      let textOnly: boolean | undefined;
      if (this.process.acceptsQueuedMessages && !row.goalStart) {
        try {
          display = await this.queuedMessage(session, snapshot, row.inputId);
        } catch (error) {
          if (error instanceof Error) {
            // Private message inspection also uses "unavailable" when the
            // input has just left the queue. Only suppress a proven stale read.
            if (
              error.message.includes("session_revision_changed") ||
              (error.message.includes("queued_input_image_unavailable") &&
                (await this.observe(session)).sessionRevision !==
                  snapshot.sessionRevision)
            )
              throw new Error("native_chat_queue_changed", { cause: error });
          }
          throw error;
        }
        text = display.text;
        textOnly = display.textOnly;
        displayParts = display.displayParts;
      } else {
        const input = await this.readQueueInput(sessionId, row);
        this.requireAttached(session);
        if (input.receipt.disposition !== "queued")
          throw new Error("native_chat_queue_changed");
        text = row.goalStart?.objective ?? input.text;
        textOnly = row.goalStart ? undefined : input.textOnly;
        displayParts = input.displayParts;
      }
      items.push({
        ...queueItem(row, text),
        ...(textOnly !== undefined && { textOnly }),
        ...(display?.textEditable !== undefined && {
          textEditable: display.textEditable,
        }),
        ...(display?.attachments && { attachments: display.attachments }),
        ...(displayParts && { displayParts }),
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
    if (!row || row.goalStart)
      throw new Error("native_chat_queue_input_unavailable");
    const input = await this.readQueueInput(sessionId, row);
    this.requireAttached(session);
    if (input.receipt.disposition !== "queued" || input.text === null)
      throw new Error("native_chat_queue_input_unavailable");
    return input.text;
  }

  async queuedMessage(
    session: NativeChatSession,
    snapshot: NativeChatSnapshot,
    inputId: string
  ): Promise<NativeChatQueuedMessage> {
    const sessionId = this.requireObservation(session, snapshot);
    const row = observed
      .get(snapshot)!
      .queue.find((item) => item.inputId === inputId);
    if (!row || !this.process.acceptsQueuedMessages)
      throw new Error("native_chat_queued_message_unavailable");
    if (row.goalStart) {
      const current = await this.observe(session);
      if (current.sessionRevision !== snapshot.sessionRevision)
        throw new Error("native_chat_queue_changed");
      const input = this.process.acceptsMessageContext
        ? await this.readQueueInput(sessionId, row)
        : undefined;
      this.requireObservation(session, snapshot);
      if (input && input.receipt.disposition !== "queued")
        throw new Error("native_chat_queue_changed");
      return Object.freeze({
        inputId,
        text: row.goalStart.objective,
        ...(input?.displayParts && { displayParts: input.displayParts }),
      });
    }
    const result = await this.process.request(
      NativeQueuedMessages.inspectMethod,
      {
        sessionId,
        expectedSessionRevision: snapshot.sessionRevision,
        inputId: row.inputId,
      }
    );
    this.requireObservation(session, snapshot);
    const display = this.queuedMessages.describe(
      sessionId,
      snapshot.sessionRevision,
      row.inputId,
      result,
      this.acceptsQueuedTextReplacement
    );
    const displayParts = this.readDisplayParts(object(result).displayParts);
    return displayParts ? Object.freeze({ ...display, displayParts }) : display;
  }

  async readQueuedAttachmentPreview(
    session: NativeChatSession,
    snapshot: NativeChatSnapshot,
    inputId: string,
    previewId: string
  ): Promise<ArrayBuffer> {
    const sessionId = this.requireObservation(session, snapshot);
    if (
      !this.process.acceptsQueuedMessages ||
      !observed.get(snapshot)!.queue.some((row) => row.inputId === inputId)
    )
      throw new Error("native_chat_queued_message_unavailable");
    const image = this.queuedMessages.require(
      sessionId,
      snapshot.sessionRevision,
      inputId,
      previewId
    );
    const bytes = await this.queuedMessages.read(image, async (offset) => {
      this.requireObservation(session, snapshot);
      const chunk = await this.process.request(
        NativeQueuedMessages.readMethod,
        {
          sessionId,
          expectedSessionRevision: snapshot.sessionRevision,
          inputId,
          attachmentUri: image.attachmentUri,
          offset,
        }
      );
      this.requireObservation(session, snapshot);
      if (
        this.queuedMessages.require(
          sessionId,
          snapshot.sessionRevision,
          inputId,
          previewId
        ) !== image
      )
        throw new Error("native_chat_queued_message_unavailable");
      return chunk;
    });
    this.requireObservation(session, snapshot);
    return bytes;
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
      if (change.action === "replaceText") {
        if (!this.acceptsQueuedTextReplacement)
          throw new Error("native_chat_queued_text_replacement_unavailable");
        if (queue[index].goalStart)
          throw new Error("queued_goal_requires_withdrawal");
        if (
          typeof change.text !== "string" ||
          Buffer.byteLength(change.text) > MAX_TEXT_BYTES
        )
          throw new Error("native_chat_text_invalid");
        revalidate?.();
        result = await this.process.request(
          NativeQueuedMessages.replaceTextMethod,
          {
            queue: basis,
            inputId: change.inputId,
            replacementInputId: `desktop-replacement-${createHash("sha256")
              .update(JSON.stringify([sessionId, requestId]))
              .digest("hex")}`,
            text: change.text,
          }
        );
      } else if (change.action === "replace") {
        if (queue[index].goalStart)
          throw new Error("queued_goal_requires_withdrawal");
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
    let accepted: unknown;
    try {
      accepted = await this.goals.start(sessionId, identity(inputId), request, {
        fundedReview: this.acceptsGoalEffort,
        namedChild: this.process.acceptsGoalNamedChild,
        spending: this.process.acceptsGoalSpending,
        messageContext: this.process.acceptsMessageContext,
        initialTitle: this.process.acceptsInitialTitle,
      });
    } catch (error) {
      if (NativeAgentGoals.isUnverifiedStart(error))
        throw new Error(NativeAgentGoals.startUnverified, { cause: error });
      throw error;
    }
    try {
      return acceptance(accepted, sessionId, inputId);
    } catch (error) {
      // The host answered, so it may have accepted the input.
      throw new Error(NativeAgentGoals.startUnverified, { cause: error });
    }
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
        if (capture.invalidActivityOrder)
          throw new Error("native_chat_activity_order_invalid");
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
      if (capture.invalidActivityOrder)
        throw new Error("native_chat_activity_order_invalid");
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
        ...(style === "nonblocking" &&
          this.process.acceptsOptionalQuestions && {
            expiresWithTurn: true as const,
          }),
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
    requestId: string
  ): Promise<NativeChatTurn> {
    const { task, current } = this.task(session, snapshot, requestId);
    if (
      current.disposition !== "suspended" ||
      current.cancelled ||
      !current.paused
    )
      throw new Error("native_chat_verified_pause_required");
    const response = object(
      await this.process.request("_co.grida/session/resume", {
        task,
        expectedEpoch: current.epoch,
        expectedJournalPosition: current.journalPosition,
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

  /** An observational read of an image recorded on this chat's user message. */
  async readAttachmentPreview(
    session: NativeChatSession,
    previewId: string
  ): Promise<ArrayBuffer> {
    const sessionId = this.requireAttached(session);
    if (
      !this.process.acceptsInputImages &&
      !this.process.acceptsInputImageChunks
    )
      throw new Error("native_chat_input_image_unavailable");
    const image = this.inputImages.require(sessionId, previewId);
    if (image.chunked) {
      const bytes = await this.inputImages.readChunks(image, (offset) =>
        this.process.request(NativeInputImages.chunkMethod, {
          sessionId,
          messageId: image.messageId,
          attachmentUri: image.attachmentUri,
          offset,
        })
      );
      this.requireAttached(session);
      if (this.inputImages.require(sessionId, previewId) !== image)
        throw new Error("native_chat_input_image_unavailable");
      return bytes;
    }
    const result = await this.process.request(NativeInputImages.readMethod, {
      sessionId,
      messageId: image.messageId,
      attachmentUri: image.attachmentUri,
    });
    this.requireAttached(session);
    if (this.inputImages.require(sessionId, previewId) !== image)
      throw new Error("native_chat_input_image_unavailable");
    return this.inputImages.decode(result, image);
  }

  /** Read the captured image of a successful result, without reopening its source. */
  async readToolImage(
    session: NativeChatSession,
    previewId: string
  ): Promise<ArrayBuffer> {
    const sessionId = this.requireAttached(session);
    if (!this.process.acceptsToolImages)
      throw new Error("native_chat_tool_image_unavailable");
    const image = this.toolImages.require(sessionId, previewId);
    return this.toolImages.readChunks(image, async (offset) => {
      this.requireAttached(session);
      const result = await this.process.request(NativeToolImages.readMethod, {
        sessionId,
        turnId: image.turnId,
        toolCallId: image.toolCallId,
        mediaId: image.mediaId,
        contentIndex: image.contentIndex,
        offset,
      });
      this.requireAttached(session);
      if (this.toolImages.require(sessionId, previewId) !== image)
        throw new Error("native_chat_tool_image_unavailable");
      return result;
    });
  }

  close(): Promise<void> {
    this.closed = true;
    this.sideChats.clear();
    this.attached.clear();
    this.listeners.clear();
    this.lifecycleSeen.clear();
    this.inputImages.clear();
    this.toolImages.clear();
    this.queuedMessages.clear();
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
    let orderedCapture: TranscriptCapture | undefined;
    let orderedListeners:
      | Set<(update: NativeChatStreamUpdate) => void>
      | undefined;
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
      const processes = metadata?.[NativeAgentBackgroundProcesses.capability];
      if (processes !== undefined) {
        if (!listeners || this.closed || !this.acceptsBackgroundProcesses)
          return;
        const projected: NativeChatStreamUpdate = Object.freeze({
          kind: "processes",
          processes: NativeAgentBackgroundProcesses.readUpdate(processes),
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
      const capture = this.transcripts.get(sessionId);
      if (!listeners && !capture) return;
      const update = object(notification.update);
      if (update.sessionUpdate === "tool_call") {
        const replay = metadata?.[TRANSCRIPT_WINDOW];
        if (replay !== undefined) {
          const attribution = object(replay);
          if (
            capture &&
            capture.requestId === identity(attribution.requestId)
          ) {
            orderedCapture = capture;
            captureActivity(
              capture,
              identity(attribution.messageId),
              optionalIdentity(attribution.turnId),
              activity(
                update,
                attribution,
                metadata,
                this.process.acceptsActivityOrder,
                this.process.acceptsToolImages
                  ? { images: this.toolImages, sessionId }
                  : undefined
              )
            );
          }
          return;
        }
        const live = metadata?.["co.grida/session/updates"];
        if (live === undefined || !listeners) return;
        const attribution = object(live);
        orderedListeners = listeners;
        const projected: NativeChatStreamUpdate = Object.freeze({
          kind: "activity",
          messageId: identity(attribution.messageId),
          turnId: identity(attribution.turnId),
          activity: activity(
            update,
            attribution,
            metadata,
            this.process.acceptsActivityOrder,
            this.process.acceptsToolImages
              ? { images: this.toolImages, sessionId }
              : undefined
          ),
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
        if (capture && capture.requestId === requestId) {
          orderedCapture = capture;
          const messageId = identity(update.messageId);
          const entry = attachment(content);
          const order = NativeActivityOrder.notification(
            metadata,
            attribution,
            this.process.acceptsActivityOrder,
            true
          );
          const previewId =
            (this.process.acceptsInputImageChunks &&
              ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
                entry.mimeType ?? ""
              )) ||
            (this.process.acceptsInputImages && entry.mimeType === "image/png")
              ? this.inputImages.offer(
                  sessionId,
                  messageId,
                  content.uri,
                  entry.size,
                  entry.mimeType,
                  this.process.acceptsInputImageChunks
                )
              : undefined;
          captureAttachment(
            capture,
            messageId,
            optionalIdentity(order.turnId ?? attribution?.turnId),
            Object.freeze({ ...entry, ...(previewId && { previewId }) }),
            order
          );
        }
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
        if (capture && capture.requestId === requestId) {
          orderedCapture = capture;
          const displayParts =
            role === "user"
              ? this.readDisplayParts(attribution?.displayParts)
              : undefined;
          const reply =
            role === "user" && attribution?.questionReply !== undefined
              ? object(attribution.questionReply)
              : undefined;
          const order = NativeActivityOrder.notification(
            metadata,
            attribution,
            this.process.acceptsActivityOrder,
            content.text.length > 0
          );
          captureText(capture, identity(update.messageId), role, content.text, {
            turnId: optionalIdentity(order.turnId ?? attribution?.turnId),
            phase: messagePhase(attribution?.phase, role),
            ...order,
            ...(displayParts?.length && { displayParts }),
            ...(reply && {
              questionReply: {
                waitId: identity(reply.waitId),
                question: boundedText(reply.question, 2048),
              },
            }),
            ...(role === "user" &&
              attribution?.turnId !== undefined &&
              attribution.svgTextSelection === true && {
                svgTextSelection: true,
              }),
          });
        }
        return;
      }
      if (!listeners) return;
      const attribution = object(meta);
      orderedListeners = listeners;
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
              ...NativeActivityOrder.notification(
                metadata,
                attribution,
                this.process.acceptsActivityOrder,
                content.text.length > 0
              ),
            });
      for (const listener of listeners) {
        try {
          listener(projected);
        } catch {
          /* Observers have independent lifetimes. */
        }
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "native_chat_activity_order_invalid"
      ) {
        if (orderedCapture) orderedCapture.invalidActivityOrder = true;
        else if (orderedListeners)
          for (const listener of orderedListeners) {
            try {
              listener(Object.freeze({ kind: "resync" }));
            } catch {
              /* Independent observers. */
            }
          }
      }
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
    if (kind === "question_asked") {
      const waitId = identity(record.waitId);
      if (this.rememberLifecycle([sessionId, turnId, kind, waitId]))
        void this.notifyQuestion(session, turnId, waitId).catch(() => {});
      return;
    }
    if (this.sideChats.has(session.id)) return;
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
      event = {
        kind,
        sessionId,
        turnId,
        status,
        ...(status === "succeeded" && {
          readPreview: () => this.completionPreview(session, turnId),
        }),
      };
    } else return;
    const detail = event.kind === "settled" ? event.status : event.waitId;
    if (this.rememberLifecycle([sessionId, turnId, kind, detail]))
      this.onLifecycle?.(event, () => this.ownsSession(session));
  }

  private rememberLifecycle(identity: unknown): boolean {
    const key = JSON.stringify(identity);
    if (this.lifecycleSeen.has(key)) return false;
    this.lifecycleSeen.add(key);
    if (this.lifecycleSeen.size > RECENT_LIFECYCLE) {
      const oldest = this.lifecycleSeen.values().next().value;
      if (oldest !== undefined) this.lifecycleSeen.delete(oldest);
    }
    return true;
  }

  private async completionPreview(
    session: NativeChatSession,
    turnId: string
  ): Promise<NativeChatCompletionPreview> {
    const sessionId = this.requireAttached(session);
    const [title, text] = await Promise.all([
      this.catalogEntry(session, NOTIFICATION_PREVIEW_TIMEOUT_MS)
        .then((entry) => entry.title)
        .catch(() => null),
      this.process
        .request(
          "_co.grida/session/turn-summary",
          { sessionId, turnId },
          NOTIFICATION_PREVIEW_TIMEOUT_MS
        )
        .then((result) => summaryText(object(result), turnId, "succeeded"))
        .catch(() => null),
    ]);
    this.requireAttached(session);
    return { title, text };
  }

  /** A lifecycle fact carries identity only. Read the text from the authorized pending wait. */
  private async notifyQuestion(
    session: NativeChatSession,
    turnId: string,
    waitId: string
  ) {
    const sessionId = this.requireAttached(session);
    const side = this.sideChats.has(sessionId);
    const title = await (
      side
        ? this.observe(session).then((snapshot) => snapshot.side?.title ?? null)
        : this.catalogEntry(session).then((entry) => entry.title)
    ).catch(() => null);
    const pending = object(
      await this.process.request("_co.grida/session/questions", {
        sessionId,
        turnId,
      })
    );
    if (
      pending.sessionId !== sessionId ||
      pending.turnId !== turnId ||
      !Array.isArray(pending.questions) ||
      !this.ownsSession(session)
    )
      return;
    const match = pending.questions.find(
      (entry: unknown) => object(entry).waitId === waitId
    );
    if (!match) return;
    const question = boundedText(object(match).question, 2048);
    this.onLifecycle?.(
      {
        kind: "question_asked",
        sessionId,
        turnId,
        waitId,
        session,
        side,
        title,
        question,
      },
      () => this.ownsSession(session)
    );
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
      result.textOnly !== false &&
      part?.type === "text" &&
      typeof part.text === "string" &&
      Buffer.byteLength(part.text) <= MAX_TEXT_BYTES
        ? part.text
        : null;
    return {
      receipt,
      text,
      displayParts: this.readDisplayParts(result.displayParts),
      textOnly:
        typeof result.textOnly === "boolean" ? result.textOnly : undefined,
    };
  }

  private readDisplayParts(value: unknown): NativeChatMessage["displayParts"] {
    if (!this.process.acceptsMessageContext || value === undefined) return;
    const parts = parseNativeChatDisplayParts(value);
    if (parts?.length) return parts;
  }

  private attach(id: string, sideImageInput?: boolean): NativeChatSession {
    this.requireOpen();
    const existing = this.attached.get(id);
    if (existing) return existing;
    const session = Object.freeze({
      id,
      ...(sideImageInput !== undefined && { sideImageInput }),
    });
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

  private subagentActivityScope(
    parent: NativeChatSession,
    check: () => void
  ): () => void {
    const scoped = this.subagentScope(parent, check);
    return () => {
      scoped();
      if (!this.process.acceptsSubagentActivity)
        throw new Error("native_chat_subagent_activity_unavailable");
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
  attribution?: Pick<
    NativeChatMessage,
    | "turnId"
    | "phase"
    | "activityOrder"
    | "activityOrderIncomplete"
    | "svgTextSelection"
    | "displayParts"
    | "questionReply"
  >
): void {
  if (capture.overflow) return;
  const previous = capture.messages.get(messageId);
  capture.bytes += Buffer.byteLength(text);
  if (attribution?.questionReply)
    capture.bytes += Buffer.byteLength(attribution.questionReply.question);
  if (attribution?.displayParts)
    capture.bytes += Buffer.byteLength(
      JSON.stringify(attribution.displayParts)
    );
  if (
    capture.bytes > MAX_TRANSCRIPT_BYTES ||
    (!previous && capture.messages.size >= MAX_TRANSCRIPT_MESSAGES)
  ) {
    capture.overflow = true;
    capture.messages.clear();
    return;
  }
  if (previous && previous.role !== role) throw invalidResponse();
  const order = NativeActivityOrder.merge(previous ?? {}, attribution ?? {});
  const kept = { ...previous };
  delete kept.activityOrder;
  delete kept.activityOrderIncomplete;
  capture.messages.set(messageId, {
    ...kept,
    ...(attribution?.turnId && { turnId: attribution.turnId }),
    ...(attribution?.phase && { phase: attribution.phase }),
    ...(attribution?.questionReply && {
      questionReply: attribution.questionReply,
    }),
    ...(attribution?.svgTextSelection && { svgTextSelection: true }),
    ...(attribution?.displayParts && {
      displayParts: attribution.displayParts,
    }),
    ...order,
    messageId,
    role,
    text: (previous?.text ?? "") + text,
  });
}

function captureAttachment(
  capture: TranscriptCapture,
  messageId: string,
  turnId: string | undefined,
  entry: NativeChatMessageAttachment,
  order: NativeActivityOrder.Fact = {}
): void {
  if (capture.overflow) return;
  const previous = capture.messages.get(messageId);
  if (previous && previous.role !== "user") throw invalidResponse();
  const merged = NativeActivityOrder.merge(previous ?? {}, order);
  const kept = { ...previous };
  delete kept.activityOrder;
  delete kept.activityOrderIncomplete;
  const recorded = previous?.attachments ?? [];
  // A reference's poster frame counts toward the transcript like text.
  capture.bytes += entry.preview?.poster?.length ?? 0;
  if (
    capture.bytes > MAX_TRANSCRIPT_BYTES ||
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
    ...kept,
    ...(turnId && { turnId }),
    ...merged,
    attachments: [...recorded, entry],
  });
}

/** Validate one attachment link. Its URI names a host-held asset and is not kept. */
function attachment(
  content: Record<string, unknown>
): NativeChatMessageAttachment {
  const { name, mimeType, size, _meta } = content;
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
  // A reference's preview is shown again after reopening; a malformed one is
  // dropped rather than failing the transcript.
  const preview = NativeFileReference.replayedPreview(_meta);
  return Object.freeze({
    name,
    ...(typeof mimeType === "string" && { mimeType }),
    ...(size !== undefined && size !== null && { size: revision(size) }),
    ...(preview && { preview }),
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
  attribution: Record<string, unknown>,
  metadata: Record<string, unknown> | undefined,
  orderAvailable: boolean,
  toolImages?: { images: NativeToolImages; sessionId: string }
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
  const callId = identity(update.toolCallId);
  const turnId = optionalIdentity(attribution.turnId);
  const output = toolOutput(
    update.rawOutput,
    toolImages && turnId && outcome === "succeeded"
      ? (value) =>
          toolImages.images.project(toolImages.sessionId, turnId, callId, value)
      : undefined
  );
  return Object.freeze({
    callId,
    title: identity(update.title),
    kind: kind as NativeChatActivity["kind"],
    ...(source !== undefined && { source }),
    outcome: outcome as NativeChatActivity["outcome"],
    ...NativeActivityOrder.read(
      NativeActivityOrder.notification(
        metadata,
        attribution,
        orderAvailable,
        true
      ),
      orderAvailable,
      true
    ),
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

function toolOutput(
  value: unknown,
  projectImages?: (value: unknown) => readonly NativeChatToolImage[]
): NativeChatActivity["output"] {
  if (value === undefined || value === null) return undefined;
  const output = object(value);
  if (typeof output.text !== "string" || typeof output.truncated !== "boolean")
    throw invalidResponse();
  const structured = toolDetail(output.structured);
  const images =
    output.images === undefined ? undefined : projectImages?.(output.images);
  const omittedImages =
    projectImages && output.omittedImages !== undefined
      ? revision(output.omittedImages)
      : undefined;
  if (omittedImages !== undefined && omittedImages > 1024)
    throw invalidResponse();
  return Object.freeze({
    text: output.text.slice(0, MAX_TOOL_DETAIL_BYTES),
    truncated: output.truncated,
    ...(structured !== undefined && { structured }),
    ...(images !== undefined && { images }),
    ...(omittedImages !== undefined && { omittedImages }),
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
    ...(result.inputNeeded !== undefined && {
      inputNeeded: flag(result.inputNeeded),
    }),
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

function summaryText(
  result: Record<string, unknown>,
  turnId: string,
  status: NativeChatTurnSummary["status"]
): string {
  if (
    result.turnId !== turnId ||
    result.status !== status ||
    typeof result.text !== "string" ||
    Buffer.byteLength(result.text) > MAX_SUMMARY_BYTES
  )
    throw invalidResponse();
  return result.text;
}

function textPrompt(text: string, allowEmpty = false) {
  if (
    typeof text !== "string" ||
    (!allowEmpty && !text.trim()) ||
    Buffer.byteLength(text) > MAX_TEXT_BYTES
  )
    throw new Error("native_chat_text_invalid");
  return text.trim() ? [{ type: "text", text }] : [];
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
  count: number,
  includePreviews: boolean
): readonly QueuePosition[] {
  if (
    !Array.isArray(value) ||
    value.length !== count ||
    count > MAX_QUEUE_INPUTS
  )
    throw invalidResponse();
  const queue = value.map((entry: unknown, index: number) => {
    const row = object(entry);
    const settings = object(row.settings);
    return {
      inputId: identity(row.inputId),
      inputPosition: revision(row.inputPosition),
      ...(includePreviews &&
        index < QUEUE_PAGE_SIZE &&
        typeof row.preview === "string" &&
        Buffer.byteLength(row.preview) <= QUEUE_PREVIEW_LENGTH && {
          preview: row.preview,
        }),
      ...(settings.operatingRegime === "plan" && {
        operatingRegime: "plan" as const,
      }),
      ...(settings.effort === "ultra" && { effort: "ultra" as const }),
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

function queueItem(
  row: QueuePosition,
  text: string | null
): NativeChatQueueItem {
  return {
    inputId: row.inputId,
    preview:
      text && text.length > QUEUE_PREVIEW_LENGTH
        ? `${text.slice(0, QUEUE_PREVIEW_LENGTH)}…`
        : text,
    ...(row.goalStart && { goalStart: row.goalStart }),
    ...(row.operatingRegime && { operatingRegime: row.operatingRegime }),
    ...(row.effort && { effort: row.effort }),
  };
}

function identity(value: unknown): string {
  if (typeof value !== "string" || !IDENTITY.test(value))
    throw invalidResponse();
  return value;
}

const SIDE_REFUSALS: ReadonlySet<string> = new Set<NativeChatSideRefusal>([
  "fork",
  "side_chat",
  "compaction",
  "goals",
  "subagents",
  "delegation",
  "wakeups",
  "catalog",
]);

/**
 * A side chat's snapshot presentation. Refusals this Desktop does not know
 * are dropped; they name controls it does not offer.
 */
function sideSnapshot(value: unknown, opened: boolean): NativeChatSideSnapshot {
  const side = object(value);
  const unavailable = side.unavailable;
  if (
    !opened ||
    side.temporary !== true ||
    !Array.isArray(unavailable) ||
    unavailable.length > 32 ||
    unavailable.some((entry) => typeof entry !== "string")
  )
    throw invalidResponse();
  const title =
    side.title === undefined ? null : catalogTitle(side.title as unknown);
  return Object.freeze({
    parentSessionId: identity(side.parentSessionId),
    temporary: true,
    unavailable: Object.freeze(
      (unavailable as string[]).filter(
        (entry): entry is NativeChatSideRefusal => SIDE_REFUSALS.has(entry)
      )
    ),
    ...(title !== null && { title }),
    ...(titleGenerationPending(side.titleGenerationPending) && {
      titleGenerationPending: true as const,
    }),
  });
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

/** Shared projection for the worker and offline catalog command. Both return ACP session/list. */
export function readNativeSessionList(
  value: unknown,
  cwd: string,
  cursor: string | null,
  archived = false
) {
  const result = object(value);
  if (
    !Array.isArray(result.sessions) ||
    result.sessions.length > MAX_CATALOG_SESSIONS
  )
    throw invalidResponse();
  const sessions = result.sessions.map((entry: unknown) => {
    const session = object(entry);
    if (session.cwd !== cwd) throw invalidResponse();
    const meta = session._meta == null ? {} : object(session._meta);
    return {
      sessionId: identity(session.sessionId),
      title: catalogTitle(session.title ?? null),
      lastActivityAtMs: catalogActivityTime(meta["co.grida/lastActivityAtMs"]),
      lastMessageAtMs: catalogActivityTime(
        meta["co.grida/lastMessageAtMs"] ?? undefined
      ),
    };
  });
  const listed = new Set(sessions.map((entry) => entry.sessionId));
  const meta = archived || result._meta == null ? {} : object(result._meta);
  const runningSessionIds = catalogIds(
    meta["co.grida/runningSessionIds"],
    listed
  );
  const inputNeededSessionIds = catalogIds(
    meta["co.grida/inputNeededSessionIds"],
    listed
  );
  const nextCursor = result.nextCursor ?? null;
  if (
    listed.size !== sessions.length ||
    (nextCursor !== null &&
      (!isCatalogCursor(nextCursor) ||
        nextCursor === cursor ||
        sessions.length === 0))
  )
    throw invalidResponse();
  return {
    sessions,
    nextCursor,
    ...(runningSessionIds !== undefined && { runningSessionIds }),
    ...(inputNeededSessionIds !== undefined && { inputNeededSessionIds }),
  };
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

function titleGenerationPending(value: unknown): boolean {
  return value !== undefined && flag(value);
}

function catalogEntry(
  value: unknown,
  sessionId: string
): NativeChatCatalogEntry {
  const entry = object(value);
  if (entry.sessionId !== sessionId) throw invalidResponse();
  const lastActivityAtMs = catalogActivityTime(entry.lastActivityAtMs);
  return Object.freeze({
    sessionId,
    revision: revision(entry.revision),
    title: catalogTitle(entry.title),
    archived: flag(entry.archived),
    ...(titleGenerationPending(entry.titleGenerationPending) && {
      titleGenerationPending: true as const,
    }),
    ...(lastActivityAtMs !== undefined && { lastActivityAtMs }),
  });
}

function catalogIds(
  value: unknown,
  listed: ReadonlySet<string>
): string[] | undefined {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.length > listed.size ||
    value.some((id) => !listed.has(id)) ||
    new Set(value).size !== value.length
  )
    throw invalidResponse();
  return value;
}

function catalogActivityTime(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  // Date's representable range is narrower than JavaScript's safe integers.
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 8_640_000_000_000_000
  )
    throw invalidResponse();
  return value;
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
    // Invalid optional accounting must not hide the settled result.
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

function optionalSelectionRevision(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    throw new Error("native_chat_selection_invalid");
  return value as number;
}
