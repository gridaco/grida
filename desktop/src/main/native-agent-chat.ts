// GRIDA-SEC-004 — attached native chat controls owned by Electron main.
import { createHash } from "node:crypto";
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
  NativeChatGoalControl,
  NativeChatGoalReceipt,
  NativeChatGoalRequest,
  NativeChatImageArtifact,
  NativeChatMessage,
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
import type {
  NativeEditorSurfaceDelivery,
  NativeEditorSurfaceSelection,
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
  type NativeAgentLaunch,
} from "./native-agent-process";

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
const MAX_PNG_BYTES = 256 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_UPDATE_BYTES = 8 * 1024;
const MAX_SUMMARY_BYTES = 8 * 1024;
const MAX_SUMMARY_CHECKS = 8;
const MAX_TRANSCRIPT_BYTES = 1024 * 1024;
const MAX_TRANSCRIPT_MESSAGES = 1024;
const MAX_CATALOG_SESSIONS = 32;
const MAX_TITLE_BYTES = 256;
const MAX_QUEUE_INPUTS = 256;
const QUEUE_PAGE_SIZE = 8;
const QUEUE_PREVIEW_LENGTH = 2048;
const CATALOG_CURSOR = /^[!-~]{1,512}$/;
const IDENTITY = /^[A-Za-z0-9_.:@/-]{1,256}$/;

export type NativeAgentChatLaunch = Omit<
  NativeAgentLaunch,
  "capabilities" | "onSessionUpdate"
> & {
  /** Canonical workspace context selected by main for this process. */
  cwd: string;
};

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

  get acceptsEffort(): boolean {
    return this.connected && this.process.acceptsEffort;
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
    private readonly scope: string
  ) {}

  static async start({
    cwd,
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
      capabilities: CAPABILITIES,
      onSessionUpdate: (params) => client?.publish(params),
    });
    client = new NativeAgentChat(
      process,
      cwd,
      JSON.stringify([launch.stateDirectory, cwd])
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
    requestId: string
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
    });
    if (!this.ownsSession(session)) return;
    this.attached.delete(sessionId);
    this.loading.delete(sessionId);
    this.transcripts.delete(sessionId);
    this.unverifiedTranscripts.delete(sessionId);
    this.listeners.delete(sessionId);
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
    deliver: NativeEditorSurfaceDelivery,
    revision?: number
  ) {
    return this.process.registerEditorSurfaces(
      this.requireAttached(session),
      snapshot,
      requireCurrent,
      deliver,
      revision
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
        : choice(input.effort, ["standard", "ultra"] as const);
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

  private async send(
    mode: "submit" | "enqueue",
    session: NativeChatSession,
    inputId: string,
    text: string,
    operatingRegime?: NativeChatOperatingRegime,
    options: {
      image?: ReturnType<typeof pngPrompt>;
      allowConfigurationChanges?: true;
      allowWakeups?: true;
      editorSurfaces?: NativeEditorSurfaceSelection;
      effort?: NativeChatEffort;
    } = {}
  ): Promise<NativeChatAcceptance> {
    const sessionId = this.requireAttached(session);
    identity(inputId);
    const {
      image,
      allowConfigurationChanges,
      allowWakeups,
      editorSurfaces,
      effort,
    } = options;
    if (effort !== undefined && !this.acceptsEffort)
      throw new Error("native_chat_effort_unavailable");
    return acceptance(
      await this.process.request(`_co.grida/session/${mode}`, {
        sessionId,
        inputId,
        prompt: [...textPrompt(text), ...(image ? [image] : [])],
        ...(operatingRegime && { operatingRegime }),
        ...(effort && { effort }),
        ...(allowConfigurationChanges && { allowConfigurationChanges }),
        ...(allowWakeups && { allowWakeups }),
        ...(mode === "submit" &&
          operatingRegime === "act" &&
          !image &&
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
        (settings.effort ?? "standard") !== (input.effort ?? "standard") ||
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
      ...(current?.disposition === "running" &&
        !current.paused &&
        !current.cancelled &&
        typeof retryAt === "number" &&
        Number.isSafeInteger(retryAt) &&
        retryAt > 0 && { retryNotBeforeMs: retryAt }),
      admissionPaused: flag(result.admissionPaused),
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
    snapshot: NativeChatSnapshot
  ): Promise<NativeChatTurnSummary> {
    const sessionId = this.requireObservation(session, snapshot);
    const latest = snapshot.latest;
    if (latest?.disposition !== "settled" || latest.status === null)
      throw new Error("native_chat_turn_summary_unavailable");
    const result = object(
      await this.process.request("_co.grida/session/turn-summary", {
        sessionId,
        turnId: latest.turnId,
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
      ...(typeof result.reviewFindingsCollected === "boolean" && {
        reviewFindingsCollected: result.reviewFindingsCollected,
      }),
      ...(this.process.acceptsArtifacts &&
        result.artifacts !== undefined && {
          artifacts: NativeAgentArtifacts.describe(result.artifacts),
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
      if (!snapshot.admissionPaused)
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
        const other = index + (change.direction === "up" ? -1 : 1);
        if (other < 0 || other >= ids.length)
          throw new Error("native_chat_queue_move_unavailable");
        [ids[index], ids[other]] = [ids[other], ids[index]];
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
      this.process.acceptsGoalCompletion
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
      request
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
      change
    );
  }

  async transcript(
    session: NativeChatSession
  ): Promise<readonly NativeChatMessage[]> {
    const id = this.requireAttached(session);
    if (this.unverifiedTranscripts.has(id))
      throw new Error("native_chat_transcript_delivery_unverified");
    const existing = this.transcripts.get(id)?.result;
    if (existing) return existing;
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
      .finally(() => this.transcripts.delete(id));
    return capture.result;
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
      const listeners = this.listeners.get(sessionId);
      const capture = this.transcripts.get(sessionId);
      if (!listeners && !capture) return;
      const update = object(notification.update);
      const role =
        update.sessionUpdate === "agent_message_chunk"
          ? "assistant"
          : update.sessionUpdate === "user_message_chunk"
            ? "user"
            : null;
      if (!role) return;
      const content = object(update.content);
      if (
        content.type !== "text" ||
        typeof content.text !== "string" ||
        Buffer.byteLength(content.text) > MAX_UPDATE_BYTES
      )
        return;
      const meta = notification._meta
        ? object(notification._meta)["co.grida/session/updates"]
        : undefined;
      if (meta === undefined) {
        if (capture)
          captureText(capture, identity(update.messageId), role, content.text);
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

function captureText(
  capture: TranscriptCapture,
  messageId: string,
  role: NativeChatMessage["role"],
  text: string
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
  capture.messages.set(messageId, {
    messageId,
    role,
    text: (previous?.text ?? "") + text,
  });
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
  if (!(value instanceof ArrayBuffer) || value.byteLength > MAX_PNG_BYTES)
    throw new Error("image_size_limit");
  const bytes = Buffer.from(value);
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE))
    throw new Error("invalid_png_image");
  return {
    type: "image",
    mimeType: "image/png",
    data: bytes.toString("base64"),
  };
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
            goalStart: NativeAgentGoals.readStoredRequest(settings.goalStart),
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
