// GRIDA-SEC-004 — child control revisions stay with the exact Main attachment.
import { randomUUID } from "node:crypto";
import type {
  NativeChatTurn,
  NativeSubagentAssignmentInput,
  NativeSubagentChildControl,
  NativeSubagentCreate,
  NativeSubagentEntry,
  NativeSubagentObservation,
  NativeSubagentPage,
  NativeSubagentResult,
  NativeSubagentTurn,
  NativeSubagentTurnControl,
  NativeSubagentWork,
} from "@grida/desktop-bridge";
import type { NativeChatSession } from "./native-agent-chat";
import { NativeAgentHistory } from "./native-agent-history";

const { identity, object, revision } = NativeAgentHistory;
const PAGE_SIZE = 32;
const MAX_WORK_TURNS = 8;
const MAX_NAME_BYTES = 128;
const MAX_INSTRUCTIONS_BYTES = 64 * 1024;
const MAX_MESSAGE_BYTES = 4 * 1024;
const MAX_PENDING_MESSAGES = 16;
const MAX_PREVIEW_BYTES = 1024;
const MAX_RESULT_BYTES = 8 * 1024;
const MAX_TURN_OBSERVATIONS = 16;
const MAX_SPONSORS = 16;
const DISPOSITIONS = [
  "queued",
  "claimed",
  "completed",
  "superseded",
  "withdrawn",
] as const;
const UNVERIFIED = new Set([
  "native_agent_request_timeout",
  "sqlite_commit_unconfirmed",
  "store_task_interrupted",
  "control_worker_interrupted",
  "admission_worker_interrupted",
  "native_agent_disconnected",
  "native_agent_input_failed",
  "native_agent_output_failed",
  "native_agent_diagnostics_failed",
  "native_agent_invalid_frame",
  "native_agent_invalid_response",
  "native_agent_provider_reply_failed",
  "native_chat_invalid_protocol_value",
  "native_chat_subagent_invalid_response",
]);

type TurnControlBasis = Readonly<{
  parentSessionId: string;
  childId: string;
  turnId: string;
  expectedSessionRevision: number;
  expectedControlRevision: number;
}>;

type ObservedTurn = Readonly<{
  parent: NativeChatSession;
  basis: TurnControlBasis;
  turn: NativeChatTurn;
}>;

type Sponsor = Readonly<{
  parent: NativeChatSession;
  input: NativeSubagentAssignmentInput;
  turnId: string;
}>;

type ChildCapabilities = Readonly<{ messaging: boolean; queue: boolean }>;

type ObservedChild = Readonly<{
  parent: NativeChatSession;
  childId: string;
  revision: number;
  held: boolean;
  queued: readonly string[];
}>;

type ChildChange = Readonly<{
  observationId: string;
  observed: ObservedChild;
  control: NativeSubagentChildControl;
}>;

export class NativeAgentSubagents {
  private readonly turns = new WeakMap<object, Map<string, ObservedTurn>>();
  private readonly sponsors = new WeakMap<object, Map<string, Sponsor>>();
  private readonly children = new WeakMap<object, Map<string, ObservedChild>>();
  private readonly childChanges = new WeakMap<
    object,
    Map<string, ChildChange>
  >();

  constructor(
    private readonly request: (
      method: string,
      params: unknown
    ) => Promise<unknown>,
    private readonly turn: (value: unknown) => NativeChatTurn
  ) {}

  async list(
    parent: NativeChatSession,
    afterChildId: string | undefined,
    check: () => void
  ): Promise<NativeSubagentPage> {
    if (afterChildId !== undefined && !identity(afterChildId))
      throw invalidInput();
    check();
    const response = object(
      await this.request("_co.grida/subagent/list", {
        parentSessionId: parent.id,
        ...(afterChildId && { afterChildId }),
      })
    );
    check();
    if (
      response?.parentSessionId !== parent.id ||
      !Array.isArray(response.children) ||
      response.children.length > PAGE_SIZE
    )
      throw invalidResponse();
    const seen = new Set<string>();
    const children = response.children.map((item) => {
      const entry = object(item);
      if (
        !identity(entry?.childId) ||
        entry.childId === parent.id ||
        entry.childId === afterChildId ||
        seen.has(entry.childId) ||
        !validName(entry.name)
      )
        throw invalidResponse();
      seen.add(entry.childId);
      return { childId: entry.childId, name: entry.name };
    });
    const next = response.nextAfterChildId;
    if (
      next !== null &&
      (!identity(next) ||
        children.length !== PAGE_SIZE ||
        next !== children.at(-1)?.childId)
    )
      throw invalidResponse();
    return { children, nextAfterChildId: next };
  }

  async inspect(
    attachment: object,
    parent: NativeChatSession,
    childId: string,
    inputId: string | undefined,
    check: () => void,
    allowTurnControls = false,
    childCapabilities?: ChildCapabilities
  ): Promise<NativeSubagentObservation> {
    if (
      !identity(childId) ||
      childId === parent.id ||
      (inputId !== undefined && !identity(inputId))
    )
      throw invalidInput();
    check();
    const response = object(
      await this.request("_co.grida/subagent/inspect", {
        parentSessionId: parent.id,
        childId,
        ...(inputId && { inputId }),
      })
    );
    check();
    const allocation = object(response?.allocation);
    if (
      response?.parentSessionId !== parent.id ||
      response.childId !== childId ||
      !validName(response.name) ||
      typeof response.admissionPaused !== "boolean" ||
      !revision(response.sessionRevision) ||
      !validWorkTurns(allocation?.workTurns) ||
      !revision(allocation.reserved) ||
      allocation.reserved > allocation.workTurns
    )
      throw invalidResponse();
    const queuedInputIds = identifiers(response.queuedInputIds);
    if (allocation.reserved + queuedInputIds.length > allocation.workTurns)
      throw invalidResponse();
    const current =
      response.current === null ? null : this.turn(response.current);
    const latest = response.latest === null ? null : this.turn(response.latest);
    const selected = inputId
      ? response.assignment
      : response.observedAssignment;
    const assignment =
      selected === null || selected === undefined
        ? null
        : this.work(childId, selected, inputId);
    if (
      (inputId && !assignment) ||
      (!inputId && assignment?.turn?.turnId !== (current ?? latest)?.turnId)
    )
      throw invalidResponse();
    const stopObservationId =
      current &&
      current.disposition !== "settled" &&
      !current.cancelled &&
      assignment?.turn?.turnId === current.turnId
        ? this.rememberTurn(
            attachment,
            {
              parent,
              basis: {
                parentSessionId: parent.id,
                childId,
                turnId: current.turnId,
                expectedSessionRevision: response.sessionRevision,
                expectedControlRevision: current.controlRevision,
              },
              turn: current,
            },
            allowTurnControls
          )
        : null;
    const available: NativeSubagentChildControl["kind"][] = [];
    const pendingMessages = childCapabilities?.messaging
      ? identifiers(response.pendingMessageIds, MAX_PENDING_MESSAGES).length
      : undefined;
    if (childCapabilities?.messaging) available.push("message");
    if (childCapabilities?.queue) {
      if (queuedInputIds.length) available.push("withdraw");
      if (response.admissionPaused) available.push("resume-queue");
    }
    return {
      child: {
        childId,
        name: response.name,
        workTurns: allocation.workTurns,
        reserved: allocation.reserved,
        admissionPaused: response.admissionPaused,
        queuedInputIds,
        current: current && visibleTurn(current),
        assignment,
      },
      stopObservationId,
      ...(available.length && {
        childControls: {
          observationId: this.rememberChild(attachment, {
            parent,
            childId,
            revision: response.sessionRevision,
            held: response.admissionPaused,
            queued: queuedInputIds,
          }),
          available,
          ...(pendingMessages !== undefined && { pendingMessages }),
        },
      }),
      ...(allowTurnControls &&
        stopObservationId &&
        current && {
          turnControls: turnControls(current),
        }),
    };
  }

  async create(
    parent: NativeChatSession,
    input: NativeSubagentCreate,
    check: () => void
  ): Promise<NativeSubagentEntry> {
    const { requestId, workTurns } = input;
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!identity(requestId) || !validName(name) || !validWorkTurns(workTurns))
      throw invalidInput();
    check();
    const child = await this.change(
      "_co.grida/subagent/create",
      { parentSessionId: parent.id, requestId, name, workTurns },
      (reply) => {
        if (!identity(reply?.childId) || reply.childId === parent.id)
          throw invalidResponse();
        return { childId: reply.childId, name };
      }
    );
    check();
    return child;
  }

  async assign(
    attachment: object,
    parent: NativeChatSession,
    input: NativeSubagentAssignmentInput,
    selectSponsor: () => string,
    check: () => void
  ): Promise<NativeSubagentWork> {
    const { childId, inputId, instructions } = input;
    if (
      !identity(childId) ||
      childId === parent.id ||
      !identity(inputId) ||
      !boundedText(instructions, MAX_INSTRUCTIONS_BYTES) ||
      !instructions.trim()
    )
      throw invalidInput();
    check();
    const parentTurnId = this.sponsor(attachment, parent, input, selectSponsor);
    const work = await this.change(
      "_co.grida/subagent/assign",
      {
        parentSessionId: parent.id,
        childId,
        parentTurnId,
        inputId,
        instructions,
      },
      (reply) => this.work(childId, reply, inputId, parentTurnId)
    );
    check();
    return work;
  }

  private sponsor(
    attachment: object,
    parent: NativeChatSession,
    input: NativeSubagentAssignmentInput,
    select: () => string
  ): string {
    let sponsors = this.sponsors.get(attachment);
    const previous = sponsors?.get(input.inputId);
    if (previous) {
      if (
        previous.parent !== parent ||
        previous.input.childId !== input.childId ||
        previous.input.parentObservationId !== input.parentObservationId ||
        previous.input.instructions !== input.instructions
      )
        throw new Error("native_chat_subagent_identity_reused");
      return previous.turnId;
    }
    const turnId = select();
    if (!identity(turnId)) throw invalidInput();
    if (!sponsors) this.sponsors.set(attachment, (sponsors = new Map()));
    if (sponsors.size >= MAX_SPONSORS) {
      const oldest = sponsors.keys().next().value;
      if (oldest) sponsors.delete(oldest);
    }
    sponsors.set(input.inputId, { parent, input: { ...input }, turnId });
    return turnId;
  }

  async stop(
    attachment: object,
    parent: NativeChatSession,
    observationId: string,
    requestId: string,
    check: () => void
  ): Promise<void> {
    const { basis } = this.observedTurn(attachment, parent, observationId);
    if (!identity(requestId)) throw invalidInput();
    check();
    await this.change(
      "_co.grida/subagent/stop",
      { ...basis, requestId },
      (reply) => verifyTurnReceipt(reply, basis, requestId)
    );
    check();
  }

  async controlTurn(
    attachment: object,
    parent: NativeChatSession,
    observationId: string,
    requestId: string,
    value: unknown,
    check: () => void
  ): Promise<void> {
    const observed = this.observedTurn(attachment, parent, observationId);
    const control = parseTurnControl(value);
    if (
      !identity(requestId) ||
      !turnControls(observed.turn).includes(control.kind)
    )
      throw invalidInput();
    const { basis, turn } = observed;
    const task = { ...basis, requestId };
    check();
    if (control.kind === "resume") {
      await this.change(
        "_co.grida/subagent/resume",
        {
          task,
          expectedEpoch: turn.epoch,
          expectedJournalPosition: turn.journalPosition,
        },
        (reply) => {
          const resumed = this.turn(reply?.turn);
          if (
            reply?.requestId !== requestId ||
            resumed.turnId !== turn.turnId ||
            resumed.epoch <= turn.epoch
          )
            throw invalidResponse();
        }
      );
    } else {
      await this.change(
        `_co.grida/subagent/${control.kind}`,
        control.kind === "steer"
          ? {
              task,
              expectedHistoryPosition: turn.historyPosition,
              instructions: control.instructions,
            }
          : task,
        (reply) => verifyTurnReceipt(reply, basis, requestId)
      );
    }
    check();
  }

  async controlChild(
    attachment: object,
    parent: NativeChatSession,
    observationId: string,
    requestId: string,
    value: unknown,
    capabilities: ChildCapabilities,
    check: () => void
  ): Promise<void> {
    const control = parseChildControl(value);
    if (!identity(requestId)) throw invalidInput();
    if (
      !(control.kind === "message"
        ? capabilities.messaging
        : capabilities.queue)
    )
      throw new Error("native_chat_subagent_unavailable");
    check();
    let changes = this.childChanges.get(attachment);
    const previous = changes?.get(requestId);
    if (
      previous &&
      (previous.observationId !== observationId ||
        JSON.stringify(previous.control) !== JSON.stringify(control))
    )
      throw new Error("native_chat_subagent_identity_reused");
    const observed =
      previous?.observed ?? this.children.get(attachment)?.get(observationId);
    if (observed?.parent !== parent)
      throw new Error("native_chat_subagent_observation_unavailable");
    if (
      (control.kind === "resume-queue" && !observed.held) ||
      (control.kind === "withdraw" &&
        !observed.queued.includes(control.inputId))
    )
      throw invalidInput();
    if (!previous) {
      if (!changes) this.childChanges.set(attachment, (changes = new Map()));
      rememberBounded(changes, requestId, { observationId, observed, control });
    }
    const { childId, revision: expectedSessionRevision } = observed;
    const target = { parentSessionId: parent.id, childId };
    if (control.kind === "message") {
      await this.change(
        "_co.grida/subagent/send-message",
        { ...target, inputId: requestId, text: control.text },
        (reply) => {
          if (
            reply?.parentSessionId !== parent.id ||
            reply.childId !== childId ||
            reply.inputId !== requestId ||
            reply.text !== control.text ||
            !revision(reply.inputPosition) ||
            !DISPOSITIONS.some(
              (kind) => object(reply.disposition)?.kind === kind
            )
          )
            throw invalidResponse();
        }
      );
    } else {
      const queue = { ...target, requestId, expectedSessionRevision };
      await this.change(
        `_co.grida/subagent/${control.kind}`,
        control.kind === "withdraw"
          ? { queue, inputId: control.inputId }
          : queue,
        (reply) => {
          if (
            reply?.sessionId !== childId ||
            reply.requestId !== requestId ||
            !revision(reply.sessionRevision) ||
            reply.sessionRevision <= expectedSessionRevision
          )
            throw invalidResponse();
        }
      );
    }
    check();
  }

  private rememberChild(attachment: object, child: ObservedChild): string {
    let children = this.children.get(attachment);
    if (!children) this.children.set(attachment, (children = new Map()));
    for (const [id, prior] of children) {
      if (
        prior.parent === child.parent &&
        prior.childId === child.childId &&
        prior.revision === child.revision
      )
        return id;
    }
    const id = randomUUID();
    rememberBounded(children, id, child);
    return id;
  }

  private observedTurn(
    attachment: object,
    parent: NativeChatSession,
    observationId: string
  ): ObservedTurn {
    const observed = this.turns.get(attachment)?.get(observationId);
    if (observed?.parent !== parent)
      throw new Error("native_chat_subagent_observation_unavailable");
    return observed;
  }

  private work(
    childId: string,
    value: unknown,
    inputId?: string,
    parentTurnId?: string
  ): NativeSubagentWork {
    const work = object(value);
    const disposition = object(work?.disposition);
    const kind = DISPOSITIONS.find((option) => option === disposition?.kind);
    if (
      work?.childId !== childId ||
      !identity(work.inputId) ||
      (inputId && work.inputId !== inputId) ||
      !identity(work.parentTurnId) ||
      (parentTurnId && work.parentTurnId !== parentTurnId) ||
      !boundedText(work.instructionPreview, MAX_PREVIEW_BYTES) ||
      !work.instructionPreview.length ||
      typeof work.instructionTruncated !== "boolean" ||
      !kind
    )
      throw invalidResponse();
    const turn = work.turn === null ? null : this.turn(work.turn);
    const attached = kind === "claimed" || kind === "completed";
    if (attached ? !turn || turn.turnId !== disposition?.turn : !!turn)
      throw invalidResponse();
    let result: NativeSubagentResult | null = null;
    if (work.result !== null) {
      const summary = object(work.result);
      if (
        !summary ||
        !turn ||
        turn.disposition !== "settled" ||
        !turn.status ||
        summary.turnId !== turn.turnId ||
        summary.status !== turn.status ||
        !boundedText(summary.text, MAX_RESULT_BYTES) ||
        typeof summary.textTruncated !== "boolean"
      )
        throw invalidResponse();
      result = {
        turnId: turn.turnId,
        status: turn.status,
        text: summary.text,
        textTruncated: summary.textTruncated,
      };
    }
    return {
      inputId: work.inputId,
      parentTurnId: work.parentTurnId,
      instructionPreview: work.instructionPreview,
      instructionTruncated: work.instructionTruncated,
      disposition: kind,
      turn: turn && visibleTurn(turn),
      result,
    };
  }

  private rememberTurn(
    attachment: object,
    observed: ObservedTurn,
    exactTurn: boolean
  ): string {
    const { parent, basis, turn } = observed;
    let observations = this.turns.get(attachment);
    if (!observations) this.turns.set(attachment, (observations = new Map()));
    for (const [id, previous] of observations) {
      if (
        previous.parent === parent &&
        previous.basis.childId === basis.childId &&
        previous.basis.turnId === basis.turnId &&
        previous.basis.expectedSessionRevision ===
          basis.expectedSessionRevision &&
        previous.basis.expectedControlRevision ===
          basis.expectedControlRevision &&
        (!exactTurn || previous.turn.journalPosition === turn.journalPosition)
      )
        return id;
    }
    if (observations.size >= MAX_TURN_OBSERVATIONS) {
      const oldest = observations.keys().next().value;
      if (oldest) observations.delete(oldest);
    }
    const id = randomUUID();
    observations.set(id, observed);
    return id;
  }

  private async change<T>(
    method: string,
    input: unknown,
    decode: (reply: Record<string, unknown> | null) => T
  ): Promise<T> {
    try {
      return decode(object(await this.request(method, input)));
    } catch (error) {
      if (error instanceof Error && UNVERIFIED.has(error.message))
        throw new Error("native_chat_subagent_unverified", { cause: error });
      throw error;
    }
  }
}

function turnControls(
  turn: NativeChatTurn
): NativeSubagentTurnControl["kind"][] {
  if (turn.cancelled || turn.disposition === "settled") return [];
  if (turn.paused && turn.disposition === "suspended")
    return ["resume", "steer"];
  if (!turn.paused && turn.disposition === "running") return ["pause", "steer"];
  return [];
}

function parseTurnControl(value: unknown): NativeSubagentTurnControl {
  const entry = object(value);
  if (
    entry &&
    Object.keys(entry).length === 1 &&
    (entry.kind === "pause" || entry.kind === "resume")
  )
    return { kind: entry.kind };
  if (
    entry &&
    Object.keys(entry).length === 2 &&
    entry.kind === "steer" &&
    boundedText(entry.instructions, MAX_INSTRUCTIONS_BYTES) &&
    entry.instructions.trim()
  )
    return { kind: "steer", instructions: entry.instructions };
  throw invalidInput();
}

function parseChildControl(value: unknown): NativeSubagentChildControl {
  const entry = object(value);
  if (entry) {
    const fields = Object.keys(entry).length;
    if (fields === 1 && entry.kind === "resume-queue")
      return { kind: entry.kind };
    if (fields === 2 && entry.kind === "withdraw" && identity(entry.inputId))
      return { kind: entry.kind, inputId: entry.inputId };
    if (
      fields === 2 &&
      entry.kind === "message" &&
      boundedText(entry.text, MAX_MESSAGE_BYTES) &&
      entry.text.trim()
    )
      return { kind: entry.kind, text: entry.text };
  }
  throw invalidInput();
}

function verifyTurnReceipt(
  reply: Record<string, unknown> | null,
  basis: TurnControlBasis,
  requestId: string
): void {
  if (
    reply?.sessionId !== basis.childId ||
    reply.turnId !== basis.turnId ||
    reply.requestId !== requestId ||
    !revision(reply.sessionRevision) ||
    reply.sessionRevision < basis.expectedSessionRevision ||
    !revision(reply.journalPosition)
  )
    throw invalidResponse();
}

function visibleTurn(turn: NativeChatTurn): NativeSubagentTurn {
  const { turnId, disposition, status, paused, cancelled } = turn;
  return { turnId, disposition, status, paused, cancelled };
}

function identifiers(value: unknown, limit = MAX_WORK_TURNS): string[] {
  if (
    !Array.isArray(value) ||
    value.length > limit ||
    !Array.from(value).every(identity) ||
    new Set(value).size !== value.length
  )
    throw invalidResponse();
  return [...value];
}

function rememberBounded<T>(map: Map<string, T>, id: string, value: T): void {
  if (map.size >= MAX_TURN_OBSERVATIONS) {
    const oldest = map.keys().next().value;
    if (oldest) map.delete(oldest);
  }
  map.set(id, value);
}

function validWorkTurns(value: unknown): value is number {
  return revision(value) && value > 0 && value <= MAX_WORK_TURNS;
}

function validName(value: unknown): value is string {
  return (
    boundedText(value, MAX_NAME_BYTES) &&
    value.length > 0 &&
    value.trim() === value &&
    !/\p{Cc}/u.test(value)
  );
}

function boundedText(value: unknown, limit: number): value is string {
  return typeof value === "string" && Buffer.byteLength(value) <= limit;
}

function invalidInput(): Error {
  return new Error("native_chat_subagent_invalid_input");
}

function invalidResponse(): Error {
  return new Error("native_chat_subagent_invalid_response");
}
