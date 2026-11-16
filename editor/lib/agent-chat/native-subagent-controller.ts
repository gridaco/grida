import type {
  NativeChatObservation,
  NativeSubagentChildControl,
  NativeSubagentClient,
  NativeSubagentEntry,
  NativeSubagentObservation,
  NativeSubagentTurnControl,
  NativeSubagentActivityPage,
  NativeSubagentConversation,
  NativeSubagentLifecycleEvent,
  NativeSubagentSummary,
} from "@grida/desktop-bridge";

const POLL_MS = 650;
const ACTIVITY_POLL_MS = 2_000;
const MAX_VISIBLE_CHILDREN = 512;
const MAX_VISIBLE_EVENTS = 2_048;
const MAX_CONVERSATION_BYTES = 2 * 1024 * 1024;
const utf8 = new TextEncoder();

type View = Readonly<{
  open: boolean;
  detail: boolean;
  children: readonly NativeSubagentEntry[];
  next: string | null;
  selected: string | null;
  input: string | null;
  observation: NativeSubagentObservation | null;
  activityAvailable: boolean;
  activity: NativeSubagentActivityPage | null;
  activityError: string | null;
  summaries: readonly NativeSubagentSummary[];
  events: readonly NativeSubagentLifecycleEvent[];
  eventsComplete: boolean;
  conversation: NativeSubagentConversation | null;
  conversationLoading: boolean;
  conversationError: string | null;
  historyLimited: boolean;
  listLimited: boolean;
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
  detail: false,
  children: [],
  next: null,
  selected: null,
  input: null,
  observation: null,
  activityAvailable: false,
  activity: null,
  activityError: null,
  summaries: [],
  events: [],
  eventsComplete: true,
  conversation: null,
  conversationLoading: false,
  conversationError: null,
  historyLimited: false,
  listLimited: false,
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
  private activityTimer?: ReturnType<typeof setTimeout>;
  private activityRequest?: object;
  private activityNextAt = 0;
  private readonly activityPages = new Map<
    string,
    NativeSubagentActivityPage
  >();
  private activityDetached = false;
  private restartRequested = false;
  private conversationRequest?: object;
  private detailVersion = 0;
  private navigationVersion = 0;
  private olderPages = 0;
  private eventsTruncated = false;
  private pendingCreate?: {
    requestId: string;
    name: string;
    workTurns: number;
  };
  private readonly pendingAssignments = new Map<
    string,
    {
      childId: string;
      parentObservationId: string;
      inputId: string;
      instructions: string;
    }
  >();
  private readonly pendingStops = new Map<
    string,
    {
      childId: string;
      turnId: string;
      token: string;
      requestId: string;
    }
  >();
  private readonly pendingTurnControls = new Map<string, PendingTurnControl>();
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
    clearTimeout(this.activityTimer);
    this.listeners.clear();
  }

  toggle(): void {
    if (this.disposed) return;
    if (this.view.open) {
      this.readVersion++;
      this.detailVersion++;
      this.navigationVersion++;
      this.conversationRequest = undefined;
      this.listRequest = undefined;
      clearTimeout(this.timer);
      this.update({
        open: false,
        detail: false,
        observation: null,
        conversationLoading: false,
        listing: false,
        error: null,
      });
    } else {
      this.update({ open: true });
      void this.list();
    }
  }

  /** Opens observation without changing the selected parent conversation. */
  show(): void {
    if (this.disposed) return;
    if (!this.view.open) this.update({ open: true, detail: false });
    void this.list();
  }

  async openChild(
    childId: string,
    inputId: string | null = null
  ): Promise<void> {
    if (this.disposed) return;
    this.update({ open: true, detail: true });
    await this.select(childId, inputId);
  }

  back(): void {
    if (this.disposed) return;
    this.readVersion++;
    this.detailVersion++;
    this.navigationVersion++;
    this.conversationRequest = undefined;
    clearTimeout(this.timer);
    this.update({
      detail: false,
      selected: null,
      input: null,
      observation: null,
      conversationLoading: false,
    });
  }

  async list(more = false): Promise<void> {
    if (!this.view.open || this.view.listing || this.disposed) return;
    if (this.view.activityAvailable) return this.refreshActivity(more, true);
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
    if (changed) this.navigationVersion++;
    if (childId !== this.view.selected) {
      this.detailVersion++;
      this.conversationRequest = undefined;
      this.olderPages = 0;
      this.update({
        conversation: null,
        conversationError: null,
        conversationLoading: false,
        historyLimited: false,
      });
    }
    this.update({
      selected: childId,
      input: inputId,
      ...(changed && { observation: null }),
      error: null,
    });
    await Promise.all([this.inspect(), this.readConversation()]);
  }

  /** Parent updates discover new work even while the activity panel is closed. */
  parentUpdated(): void {
    if (this.disposed) return;
    const available =
      !!this.parent()?.snapshot.subagentActivityAvailable &&
      !!this.client.subagentActivity &&
      !!this.client.subagentConversation;
    if (available !== this.view.activityAvailable) {
      this.update({ activityAvailable: available });
      if (!available) {
        clearTimeout(this.activityTimer);
        this.activityRequest = undefined;
        return;
      }
    }
    if (available && Date.now() >= this.activityNextAt)
      void this.refreshActivity();
  }

  private async refreshActivity(more = false, explicit = false): Promise<void> {
    if (this.disposed || !this.view.activityAvailable || this.activityRequest)
      return;
    const after = more ? this.view.next : null;
    if (more && !after) return;
    const request = {};
    this.activityRequest = request;
    clearTimeout(this.activityTimer);
    const owns = () =>
      !this.disposed &&
      this.view.activityAvailable &&
      this.activityRequest === request;
    if (explicit || !this.view.activity)
      this.update({ listing: true, activityError: null });
    try {
      // One serialized cycle over at most sixteen loaded pages. Never poll
      // each child, and never overlap a slow cycle with a catch-up cycle.
      const fresh = new Map<string, NativeSubagentActivityPage>();
      const wanted = more ? 1 : Math.max(1, this.activityPages.size);
      let cursor: string | null = more ? after : "";
      const deepStart = this.activityDetached
        ? [...this.activityPages.keys()].find((key) => key !== "")
        : undefined;
      for (let index = 0; index < wanted && cursor !== null; index++) {
        const page = await this.client.subagentActivity!(
          this.attachmentId,
          cursor || undefined
        );
        if (!owns()) return;
        fresh.set(cursor, page);
        cursor = index === 0 && deepStart ? deepStart : page.nextAfterChildId;
      }
      if (!more) this.activityPages.clear();
      for (const [cursor, page] of fresh) this.activityPages.set(cursor, page);
      while (this.activityPages.size > MAX_VISIBLE_CHILDREN / 32) {
        const oldest = [...this.activityPages.keys()].find(
          (cursor) => cursor !== ""
        );
        if (oldest === undefined) break;
        this.activityPages.delete(oldest);
        this.activityDetached = true;
      }
      const pages = [...this.activityPages.values()];
      const head = this.activityPages.get("") ?? pages[0];
      const tail = pages.at(-1)!;
      const summaries = [
        ...new Map(
          pages
            .flatMap((page) => page.children)
            .map((child) => [child.childId, child])
        ).values(),
      ];
      const allEvents = [
        ...new Map(
          [...this.view.events, ...pages.flatMap((page) => page.events)].map(
            (event) => [event.eventId, event]
          )
        ).values(),
      ].sort((a, b) => a.atMs - b.atMs || a.eventId.localeCompare(b.eventId));
      this.eventsTruncated ||=
        pages.some((page) => !page.eventsComplete) ||
        allEvents.length > MAX_VISIBLE_EVENTS;
      const allLoaded =
        head.counts.complete &&
        summaries.length >= head.counts.active + head.counts.done;
      this.update({
        activity: head,
        activityError: null,
        summaries,
        children: summaries,
        next: tail.nextAfterChildId,
        events: allEvents.slice(-MAX_VISIBLE_EVENTS),
        eventsComplete: !this.eventsTruncated && allLoaded,
        listLimited: this.activityDetached,
      });
    } catch {
      if (owns())
        this.update({
          activityError:
            "Couldn't refresh subagent activity. The last observed work is still shown.",
        });
    } finally {
      if (owns()) {
        this.activityRequest = undefined;
        this.activityNextAt = Date.now() + ACTIVITY_POLL_MS;
        this.update({ listing: false });
        if (this.restartRequested) {
          this.restartRequested = false;
          this.restartList();
        } else
          this.activityTimer = setTimeout(
            () => void this.refreshActivity(),
            ACTIVITY_POLL_MS
          );
      }
    }
  }

  /** Returns to the newest children after a bounded older browse window. */
  restartList(): void {
    if (this.disposed) return;
    if (!this.view.activityAvailable) {
      void this.list();
      return;
    }
    if (this.activityRequest) {
      this.restartRequested = true;
      return;
    }
    this.activityPages.clear();
    this.activityDetached = false;
    this.update({
      summaries: [],
      children: [],
      next: null,
      listLimited: false,
    });
    void this.refreshActivity(false, true);
  }

  /** Reads only the selected child through the authorized observation contract. */
  async readConversation(more = false): Promise<void> {
    const selected = this.view.selected;
    if (
      this.disposed ||
      !this.view.open ||
      !this.view.detail ||
      !selected ||
      !this.view.activityAvailable ||
      this.conversationRequest
    )
      return;
    const before = more ? this.view.conversation?.older : undefined;
    if (more && (!before || this.view.historyLimited)) return;
    const version = this.detailVersion;
    const request = {};
    this.conversationRequest = request;
    const owns = () =>
      !this.disposed &&
      this.view.open &&
      this.view.detail &&
      this.view.selected === selected &&
      this.detailVersion === version &&
      this.conversationRequest === request;
    this.update({ conversationLoading: true, conversationError: null });
    try {
      const page = await this.client.subagentConversation!(
        this.attachmentId,
        selected,
        before ?? undefined
      );
      if (!owns()) return;
      if (page.childId !== selected)
        throw new Error("native_subagent_conversation_scope_changed");
      let previous = this.view.conversation;
      if (more && previous && previous.view !== page.view)
        throw new Error("native_subagent_conversation_view_changed");
      if (!more && previous && previous.view !== page.view) {
        previous = null;
        this.olderPages = 0;
      }
      let messages = [
        ...new Map(
          (more
            ? [
                ...this.prefixBeforeOverlap(
                  page.messages,
                  previous?.messages ?? []
                ),
                ...(previous?.messages ?? []),
              ]
            : [
                ...this.prefixBeforeOverlap(
                  previous?.messages.filter((message) => !message.live) ?? [],
                  page.messages
                ),
                ...page.messages,
              ]
          ).map((message) => [message.messageId, message])
        ).values(),
      ];
      let turns = [
        ...new Map(
          (more
            ? [...page.turns, ...(previous?.turns ?? [])]
            : [...(previous?.turns ?? []), ...page.turns]
          ).map((turn) => [turn.turnId, turn])
        ).values(),
      ];
      const limited =
        utf8.encode(JSON.stringify({ messages, turns })).length >
        MAX_CONVERSATION_BYTES;
      if (limited && previous && more) {
        this.update({
          historyLimited: true,
          conversationError:
            "This view has reached its retained conversation limit. Reopen the subagent to read its latest work.",
        });
        return;
      }
      if (limited) {
        while (
          messages.length > page.messages.length &&
          utf8.encode(JSON.stringify({ messages, turns })).length >
            MAX_CONVERSATION_BYTES
        )
          messages = messages.slice(1);
        const visibleTurns = new Set(messages.map((message) => message.turnId));
        turns = turns.filter((turn) => visibleTurns.has(turn.turnId));
      }
      if (more) this.olderPages++;
      this.update({
        conversation: {
          ...(more && previous ? previous : page),
          messages,
          turns,
          older: more
            ? page.older
            : this.olderPages > 0
              ? (previous?.older ?? null)
              : page.older,
        },
        historyLimited: (!!previous && this.view.historyLimited) || limited,
      });
    } catch {
      if (owns())
        this.update({
          conversationError:
            "Couldn't read this subagent's conversation. Retry to reconnect.",
        });
    } finally {
      if (owns()) {
        this.conversationRequest = undefined;
        this.update({ conversationLoading: false });
      }
    }
  }

  get canAssign(): boolean {
    const child = this.view.observation?.child;
    return (
      !!child &&
      (this.pendingAssignments.has(child.childId) ||
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
        const navigation = this.navigationVersion;
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
        if (navigation === this.navigationVersion && this.view.open) {
          this.update({ detail: true });
          await this.select(child.childId);
        }
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
    const previous = this.pendingAssignments.get(childId);
    if (previous && previous.instructions !== instructions) {
      this.update({
        error:
          "Confirm the earlier assignment with the same instructions before changing it.",
      });
      return false;
    }
    if (!this.hasControlRoom(this.pendingAssignments, childId)) return false;
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
        const navigation = this.navigationVersion;
        const input = retained ?? {
          childId,
          inputId: crypto.randomUUID(),
          parentObservationId: parent.observationId,
          instructions,
        };
        this.pendingAssignments.set(childId, input);
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
            this.pendingAssignments.delete(childId);
          throw error;
        }
        this.pendingAssignments.delete(childId);
        if (
          navigation === this.navigationVersion &&
          this.view.selected === childId
        )
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
    if (!this.hasControlRoom(this.pendingStops, childId)) return false;
    return this.act(
      "Couldn't confirm Stop. Check the current assignment and try again.",
      async () => {
        const previous = this.pendingStops.get(childId);
        const stop =
          previous?.childId === childId && previous.turnId === turnId
            ? previous
            : { childId, turnId, token, requestId: crypto.randomUUID() };
        this.pendingStops.set(childId, stop);
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
            this.pendingStops.delete(childId);
          throw error;
        }
        this.pendingStops.delete(childId);
      }
    );
  }

  get turnControls(): readonly NativeSubagentTurnControl["kind"][] {
    if (!this.client.controlSubagentTurn || this.canRetryTurnControl) return [];
    return this.view.observation?.turnControls ?? [];
  }

  get canRetryTurnControl(): boolean {
    const pending = this.view.selected
      ? this.pendingTurnControls.get(this.view.selected)
      : undefined;
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
    const pending = this.view.selected
      ? this.pendingTurnControls.get(this.view.selected)
      : undefined;
    return this.canRetryTurnControl && pending
      ? this.sendTurnControl(pending)
      : Promise.resolve(false);
  }

  private sendTurnControl(pending: PendingTurnControl): Promise<boolean> {
    if (!this.hasControlRoom(this.pendingTurnControls, pending.childId))
      return Promise.resolve(false);
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
          this.pendingTurnControls.delete(pending.childId);
        } catch (error) {
          if (
            error instanceof Error &&
            error.message.includes("native_chat_subagent_unverified")
          ) {
            this.pendingTurnControls.set(pending.childId, pending);
          } else this.pendingTurnControls.delete(pending.childId);
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
    if (!this.hasControlRoom(this.pendingChildControls, childId))
      return Promise.resolve(false);
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
    const navigation = this.navigationVersion;
    this.update({ acting: true, error: null });
    try {
      await run();
      return !this.disposed;
    } catch (failure) {
      if (navigation === this.navigationVersion)
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
      void this.readConversation();
      if (this.view.activityAvailable) void this.refreshActivity();
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
    } catch {
      if (current() && !this.view.error)
        this.update({ error: "Couldn't refresh the selected subagent." });
    } finally {
      const child = this.view.observation?.child;
      if (
        current() &&
        !this.view.acting &&
        (child?.current ||
          (child?.queuedInputIds.length && !child.admissionPaused) ||
          (this.view.activityAvailable && this.view.detail))
      )
        this.timer = setTimeout(() => {
          void this.inspect();
          void this.readConversation();
        }, POLL_MS);
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

  private hasControlRoom(
    pending: ReadonlyMap<string, unknown>,
    childId: string
  ): boolean {
    if (pending.has(childId) || pending.size < 16) return true;
    this.update({
      error:
        "Resolve earlier unconfirmed subagent actions before starting another.",
    });
    return false;
  }

  private prefixBeforeOverlap<T extends { messageId: string }>(
    prefix: readonly T[],
    following: readonly { messageId: string }[]
  ): readonly T[] {
    const ids = new Set(following.map((message) => message.messageId));
    const overlap = prefix.findIndex((message) => ids.has(message.messageId));
    return overlap < 0 ? prefix : prefix.slice(0, overlap);
  }

  private update(patch: Partial<View>): void {
    if (this.disposed) return;
    this.view = Object.freeze({ ...this.view, ...patch });
    for (const listener of this.listeners) listener();
  }
}
