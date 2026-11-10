// GRIDA-SEC-004 — project exact attached child work and retain Main-owned Stop bases.
import { randomUUID } from "node:crypto";
import type {
  NativeChatTurn,
  NativeSubagentAssignmentInput,
  NativeSubagentCreate,
  NativeSubagentEntry,
  NativeSubagentObservation,
  NativeSubagentPage,
  NativeSubagentResult,
  NativeSubagentTurn,
  NativeSubagentWork,
} from "@grida/desktop-bridge";
import type { NativeChatSession } from "./native-agent-chat";
import { NativeAgentHistory } from "./native-agent-history";

const { identity, object, revision } = NativeAgentHistory;
const PAGE_SIZE = 32;
const MAX_WORK_TURNS = 8;
const MAX_NAME_BYTES = 128;
const MAX_INSTRUCTIONS_BYTES = 64 * 1024;
const MAX_PREVIEW_BYTES = 1024;
const MAX_RESULT_BYTES = 8 * 1024;
const MAX_STOP_OBSERVATIONS = 16;
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

type StopBasis = Readonly<{
  parentSessionId: string;
  childId: string;
  turnId: string;
  expectedSessionRevision: number;
  expectedControlRevision: number;
}>;

type Sponsor = Readonly<{
  parent: NativeChatSession;
  input: NativeSubagentAssignmentInput;
  turnId: string;
}>;

export class NativeAgentSubagents {
  private readonly stops = new WeakMap<
    object,
    Map<string, { parent: NativeChatSession; basis: StopBasis }>
  >();
  private readonly sponsors = new WeakMap<object, Map<string, Sponsor>>();

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
    check: () => void
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
        ? this.rememberStop(attachment, parent, {
            parentSessionId: parent.id,
            childId,
            turnId: current.turnId,
            expectedSessionRevision: response.sessionRevision,
            expectedControlRevision: current.controlRevision,
          })
        : null;
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
    const observed = this.stops.get(attachment)?.get(observationId);
    if (observed?.parent !== parent)
      throw new Error("native_chat_subagent_observation_unavailable");
    if (!identity(requestId)) throw invalidInput();
    const basis = observed.basis;
    check();
    await this.change(
      "_co.grida/subagent/stop",
      { ...basis, requestId },
      (reply) => {
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
    );
    check();
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

  private rememberStop(
    attachment: object,
    parent: NativeChatSession,
    basis: StopBasis
  ): string {
    let observations = this.stops.get(attachment);
    if (!observations) this.stops.set(attachment, (observations = new Map()));
    for (const [id, previous] of observations) {
      if (
        previous.parent === parent &&
        previous.basis.childId === basis.childId &&
        previous.basis.turnId === basis.turnId &&
        previous.basis.expectedSessionRevision ===
          basis.expectedSessionRevision &&
        previous.basis.expectedControlRevision === basis.expectedControlRevision
      )
        return id;
    }
    if (observations.size >= MAX_STOP_OBSERVATIONS) {
      const oldest = observations.keys().next().value;
      if (oldest) observations.delete(oldest);
    }
    const id = randomUUID();
    observations.set(id, { parent, basis });
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

function visibleTurn(turn: NativeChatTurn): NativeSubagentTurn {
  const { turnId, disposition, status, paused, cancelled } = turn;
  return { turnId, disposition, status, paused, cancelled };
}

function identifiers(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > MAX_WORK_TURNS ||
    !value.every(identity) ||
    new Set(value).size !== value.length
  )
    throw invalidResponse();
  return [...value];
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
