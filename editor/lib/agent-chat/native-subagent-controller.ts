import type {
  NativeChatObservation,
  NativeSubagentChildControl,
  NativeSubagentClient,
  NativeSubagentEntry,
  NativeSubagentObservation,
  NativeSubagentTurnControl,
} from "@grida/desktop-bridge";

const POLL_MS = 650;
const utf8 = new TextEncoder();

type View = Readonly<{
  open: boolean;
  children: readonly NativeSubagentEntry[];
  next: string | null;
  selected: string | null;
  input: string | null;
  observation: NativeSubagentObservation | null;
  listing: boolean;
  acting: boolean;
  error: string | null;
}>;

type PendingTurnControl = Readonly<{
  childId: string;
  turnId: string;
  token: string;
  requestId: string;
  control: NativeSubagentTurnControl;
}>;

type PendingChildControl = Readonly<{
  token: string;
  requestId: string;
  control: NativeSubagentChildControl;
}>;

const EMPTY: View = Object.freeze({
  open: false,
  children: [],
  next: null,
  selected: null,
  input: null,
  observation: null,
  listing: false,
  acting: false,
  error: null,
});

/** Observes one attached parent's children without taking ownership of their work. */
export class NativeSubagentController {
  private view = EMPTY;
  private readonly listeners = new Set<() => void>();
  private disposed = false;
  private readVersion = 0;
  private listRequest?: object;
  private timer?: ReturnType<typeof setTimeout>;
  private pendingCreate?: {
    requestId: string;
    name: string;
    workTurns: number;
  };
  private pendingAssignment?: {
    childId: string;
    parentObservationId: string;
    inputId: string;
    instructions: string;
  };
  private pendingStop?: {
    childId: string;
    turnId: string;
    token: string;
    requestId: string;
  };
  private pendingTurnControl?: PendingTurnControl;
  private readonly pendingChildControls = new Map<
    string,
    PendingChildControl
  >();

  constructor(
    private readonly client: NativeSubagentClient,
    private readonly attachmentId: string,
    private readonly parent: () => NativeChatObservation | null
  ) {}

  read = (): View => this.view;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.timer);
    this.listeners.clear();
  }

  toggle(): void {
    if (this.disposed || this.view.acting) return;
    if (this.view.open) {
      this.readVersion++;
      this.listRequest = undefined;
      clearTimeout(this.timer);
      this.update({
        open: false,
        observation: null,
        listing: false,
        error: null,
      });
    } else {
      this.update({ open: true });
      void this.list();
    }
  }

  async list(more = false): Promise<void> {
    if (!this.view.open || this.view.listing || this.disposed) return;
    const after = more ? this.view.next : null;
    if (more && !after) return;
    const request = {};
    this.listRequest = request;
    const owns = () =>
      !this.disposed && this.view.open && this.listRequest === request;
    this.update({ listing: true, error: null });
    try {
      const page = await this.client.listSubagents(
        this.attachmentId,
        after ?? undefined
      );
      if (!owns()) return;
      const children = after
        ? [
            ...new Map(
              [...this.view.children, ...page.children].map((child) => [
                child.childId,
                child,
              ])
            ).values(),
          ]
        : page.children;
      this.update({ children, next: page.nextAfterChildId });
      const childId = this.view.selected ?? children[0]?.childId;
      if (childId) await this.select(childId, this.view.input);
    } catch {
      if (owns()) this.update({ error: "Couldn't load subagents." });
    } finally {
      if (owns()) {
        this.listRequest = undefined;
        this.update({ listing: false });
      }
    }
  }

  async select(childId: string, inputId: string | null = null): Promise<void> {
    if (this.disposed || !this.view.open) return;
    clearTimeout(this.timer);
    const changed =
      childId !== this.view.selected || inputId !== this.view.input;
    this.update({
      selected: childId,
      input: inputId,
      ...(changed && { observation: null }),
      error: null,
    });
    await this.inspect();
  }

  get canAssign(): boolean {
    const child = this.view.observation?.child;
    return (
      !!child &&
      (this.pendingAssignment?.childId === child.childId ||
        this.hasAssignmentAllowance())
    );
  }

  async create(name: string, workTurns: number): Promise<boolean> {
    name = name.trim();
    if (
      !name ||
      utf8.encode(name).length > 128 ||
      !Number.isInteger(workTurns) ||
      workTurns < 1 ||
      workTurns > 8
    ) {
      this.update({
        error: "Enter a name and an allowance of one to eight assignments.",
      });
      return false;
    }
    return this.act(
      "Couldn't confirm the new subagent. Retry with the same details.",
      async () => {
        const previous = this.pendingCreate;
        const input =
          previous?.name === name && previous.workTurns === workTurns
            ? previous
            : { requestId: crypto.randomUUID(), name, workTurns };
        this.pendingCreate = input;
        const child = await this.client.createSubagent(
          this.attachmentId,
          input
        );
        this.pendingCreate = undefined;
        this.update({
          selected: child.childId,
          input: null,
          observation: null,
        });
        await this.list();
      }
    );
  }

  async assign(instructions: string): Promise<boolean> {
    const childId = this.view.selected;
    const parent = this.parent();
    if (!childId || !parent) return false;
    if (!instructions.trim() || utf8.encode(instructions).length > 64 * 1024) {
      this.update({
        error: "Enter assignment instructions of at most 64 KiB.",
      });
      return false;
    }
    const previous = this.pendingAssignment;
    const retained =
      previous?.childId === childId && previous.instructions === instructions
        ? previous
        : undefined;
    if (!retained && !this.hasAssignmentAllowance()) {
      this.update({
        error:
          "A new assignment needs a finished Act turn and remaining allowance.",
      });
      return false;
    }
    return this.act(
      "Couldn't confirm the assignment. Retry with the same instructions.",
      async () => {
        const input = retained ?? {
          childId,
          inputId: crypto.randomUUID(),
          parentObservationId: parent.observationId,
          instructions,
        };
        this.pendingAssignment = input;
        try {
          await this.client.assignSubagent(this.attachmentId, input);
        } catch (error) {
          if (
            !retained &&
            error instanceof Error &&
            /subagent_(sponsor_|allocation_exhausted|authority_changed)/.test(
              error.message
            )
          )
            this.pendingAssignment = undefined;
          throw error;
        }
        this.pendingAssignment = undefined;
        this.update({ input: input.inputId, observation: null });
      }
    );
  }

  async stop(): Promise<boolean> {
    const observed = this.view.observation;
    const childId = this.view.selected;
    const turnId = observed?.child.current?.turnId;
    const token = observed?.stopObservationId;
    if (!token || !childId || !turnId) return false;
    return this.act(
      "Couldn't confirm Stop. Check the current assignment and try again.",
      async () => {
        const previous = this.pendingStop;
        const stop =
          previous?.childId === childId && previous.turnId === turnId
            ? previous
            : { childId, turnId, token, requestId: crypto.randomUUID() };
        this.pendingStop = stop;
        try {
          await this.client.stopSubagent(
            this.attachmentId,
            stop.token,
            stop.requestId
          );
        } catch (error) {
          if (
            error instanceof Error &&
            /stale_session_revision|stale_journal_change|native_chat_subagent_observation_unavailable/.test(
              error.message
            )
          )
            this.pendingStop = undefined;
          throw error;
        }
        this.pendingStop = undefined;
      }
    );
  }

  get turnControls(): readonly NativeSubagentTurnControl["kind"][] {
    if (!this.client.controlSubagentTurn || this.canRetryTurnControl) return [];
    return this.view.observation?.turnControls ?? [];
  }

  get canRetryTurnControl(): boolean {
    const pending = this.pendingTurnControl;
    return (
      !!pending &&
      pending.childId === this.view.selected &&
      pending.turnId === this.view.observation?.child.assignment?.turn?.turnId
    );
  }

  async controlTurn(control: NativeSubagentTurnControl): Promise<boolean> {
    const observation = this.view.observation;
    const childId = this.view.selected;
    const turnId = observation?.child.current?.turnId;
    const token = observation?.stopObservationId;
    if (
      !token ||
      !childId ||
      !turnId ||
      !this.turnControls.includes(control.kind)
    )
      return false;
    if (
      control.kind === "steer" &&
      (!control.instructions.trim() ||
        utf8.encode(control.instructions).length > 64 * 1024)
    ) {
      this.update({ error: "Enter steering instructions of at most 64 KiB." });
      return false;
    }
    return this.sendTurnControl({
      childId,
      turnId,
      token,
      requestId: crypto.randomUUID(),
      control,
    });
  }

  retryTurnControl(): Promise<boolean> {
    return this.canRetryTurnControl && this.pendingTurnControl
      ? this.sendTurnControl(this.pendingTurnControl)
      : Promise.resolve(false);
  }

  private sendTurnControl(pending: PendingTurnControl): Promise<boolean> {
    return this.act(
      "Couldn't confirm the subagent control. Check the current assignment or retry the same action.",
      async () => {
        try {
          await this.client.controlSubagentTurn!(
            this.attachmentId,
            pending.token,
            pending.requestId,
            pending.control
          );
          this.pendingTurnControl = undefined;
        } catch (error) {
          this.pendingTurnControl =
            error instanceof Error &&
            error.message.includes("native_chat_subagent_unverified")
              ? pending
              : undefined;
          throw error;
        }
      }
    );
  }

  get childControls(): readonly NativeSubagentChildControl["kind"][] {
    if (!this.client.controlSubagentChild || this.retryableChildControl)
      return [];
    const { observation, input } = this.view;
    return (
      observation?.childControls?.available.filter(
        (kind) =>
          kind !== "withdraw" ||
          (input !== null && observation.child.queuedInputIds.includes(input))
      ) ?? []
    );
  }

  get retryableChildControl(): NativeSubagentChildControl["kind"] | undefined {
    const selected = this.view.selected;
    return selected
      ? this.pendingChildControls.get(selected)?.control.kind
      : undefined;
  }

  controlChild(control: NativeSubagentChildControl): Promise<boolean> {
    const { observation, selected, input } = this.view;
    const token = observation?.childControls?.observationId;
    if (
      !token ||
      !selected ||
      !this.childControls.includes(control.kind) ||
      (control.kind === "withdraw" && control.inputId !== input)
    )
      return Promise.resolve(false);
    if (
      control.kind === "message" &&
      (!control.text.trim() || utf8.encode(control.text).length > 4096)
    ) {
      this.update({ error: "Enter a message of at most 4 KiB." });
      return Promise.resolve(false);
    }
    return this.sendChildControl(selected, {
      token,
      requestId: crypto.randomUUID(),
      control: { ...control },
    });
  }

  retryChildControl(): Promise<boolean> {
    const selected = this.view.selected;
    const pending = selected && this.pendingChildControls.get(selected);
    return selected && pending
      ? this.sendChildControl(selected, pending)
      : Promise.resolve(false);
  }

  private sendChildControl(
    childId: string,
    pending: PendingChildControl
  ): Promise<boolean> {
    return this.act(
      "Couldn't confirm the subagent action. Check the current state or retry the same action if offered.",
      async () => {
        try {
          await this.client.controlSubagentChild!(
            this.attachmentId,
            pending.token,
            pending.requestId,
            pending.control
          );
          this.pendingChildControls.delete(childId);
        } catch (error) {
          if (
            error instanceof Error &&
            error.message.includes("native_chat_subagent_unverified")
          ) {
            if (this.pendingChildControls.size >= 16) {
              const oldest = this.pendingChildControls.keys().next().value;
              if (oldest) this.pendingChildControls.delete(oldest);
            }
            this.pendingChildControls.set(childId, pending);
          } else {
            this.pendingChildControls.delete(childId);
          }
          throw error;
        }
      }
    );
  }

  private async act(error: string, run: () => Promise<void>): Promise<boolean> {
    if (this.disposed || !this.view.open || this.view.acting) return false;
    this.readVersion++;
    clearTimeout(this.timer);
    this.update({ acting: true, error: null });
    try {
      await run();
      return !this.disposed;
    } catch (failure) {
      this.update({
        error:
          failure instanceof Error &&
          failure.message.includes("subagent_sponsor_requires_act")
            ? "Finish an Act turn in the parent chat before assigning work."
            : error,
      });
      return false;
    } finally {
      this.update({ acting: false });
      await this.inspect();
    }
  }

  private async inspect(): Promise<void> {
    const { selected, input } = this.view;
    if (this.disposed || !this.view.open || !selected) return;
    const version = ++this.readVersion;
    const current = () =>
      !this.disposed && this.view.open && version === this.readVersion;
    try {
      const observation = await this.client.inspectSubagent(
        this.attachmentId,
        selected,
        input ?? undefined
      );
      if (!current()) return;
      this.update({ observation });
      const { child } = observation;
      if (
        !this.view.acting &&
        (child.current ||
          (child.queuedInputIds.length && !child.admissionPaused))
      )
        this.timer = setTimeout(() => void this.inspect(), POLL_MS);
    } catch {
      if (current() && !this.view.error)
        this.update({ error: "Couldn't refresh the selected subagent." });
    }
  }

  private hasAssignmentAllowance(): boolean {
    const child = this.view.observation?.child;
    return (
      !!child &&
      this.parent()?.snapshot.latest?.disposition === "settled" &&
      child.reserved + child.queuedInputIds.length < child.workTurns
    );
  }

  private update(patch: Partial<View>): void {
    if (this.disposed) return;
    this.view = Object.freeze({ ...this.view, ...patch });
    for (const listener of this.listeners) listener();
  }
}
