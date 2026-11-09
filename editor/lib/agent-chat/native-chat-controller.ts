import type {
  DesktopNativeChat,
  NativeChatAttachment,
  NativeChatControl,
  NativeChatMessage,
  NativeChatObservation,
  NativeChatPage,
  NativeChatTextUpdate,
  NativeChatUpdate,
} from "@grida/desktop-bridge";

const POLL_MS = 500;
const RECENTS_LIMIT = 12;
const MAX_LIVE_BYTES = 1024 * 1024;
const utf8 = new TextEncoder();

export type NativeChatView = Readonly<{
  scope: number;
  selected: string | null;
  sessions: readonly string[];
  catalogCursor: string | null;
  nextCatalogCursor: string | null;
  catalogLoading: boolean;
  catalogError: string | null;
  messages: readonly NativeChatMessage[];
  observation: NativeChatObservation | null;
  loading: boolean;
  acting: boolean;
  repairing: boolean;
  error: string | null;
}>;

type Scope = {
  id: number;
  requested: string | null;
  attachment?: NativeChatAttachment;
  opening?: Promise<void>;
  refreshing?: Promise<void>;
  timer?: ReturnType<typeof setTimeout>;
  durable: readonly NativeChatMessage[];
  live: Map<string, NativeChatMessage & { turnId: string; bytes: number }>;
  gaps: Set<string>;
  observation: NativeChatObservation | null;
  replay: boolean;
  pending?: { text: string; inputId: string };
  awaitingTurn?: string;
};

const EMPTY: NativeChatView = Object.freeze({
  scope: 0,
  selected: null,
  sessions: [],
  catalogCursor: null,
  nextCatalogCursor: null,
  catalogLoading: false,
  catalogError: null,
  messages: [],
  observation: null,
  loading: false,
  acting: false,
  repairing: false,
  error: null,
});

/** Renderer-owned observation and text projection. Work stays in the native host. */
export class NativeChatController {
  private view = EMPTY;
  private readonly listeners = new Set<() => void>();
  private scope?: Scope;
  private generation = 0;
  private attachments = Promise.resolve();
  private catalogConnection?: object;
  private catalog: NativeChatPage | null = null;
  private listing?: Promise<NativeChatPage>;
  private recents: readonly string[] = [];

  constructor(
    private readonly bridge: DesktopNativeChat,
    private readonly memory?: Pick<Storage, "getItem" | "setItem">,
    private readonly memoryKey?: string
  ) {}

  static watchAvailability(
    bridge: DesktopNativeChat,
    publish: (available: boolean | null) => void
  ): () => void {
    let watching = true;
    const probe = () => {
      void bridge.available().then(
        (available) => {
          if (watching) publish(available);
        },
        () => {
          if (watching) publish(null);
        }
      );
    };
    // Electron rejects chat attachment while its main frame is loading.
    if (typeof document !== "undefined" && document.readyState !== "complete")
      window.addEventListener("load", probe, { once: true });
    else probe();
    return () => {
      watching = false;
      if (typeof window !== "undefined")
        window.removeEventListener("load", probe);
    };
  }

  readonly read = () => this.view;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  connect(initial: string | null): void {
    const saved = this.restore();
    this.catalogConnection = {};
    this.catalog = null;
    this.recents = saved.sessions;
    this.update({
      sessions: this.recents,
      catalogCursor: null,
      nextCatalogCursor: null,
      catalogLoading: false,
      catalogError: null,
    });
    void this.listChats();
    void this.select(initial ?? saved.selected);
  }

  disconnect(): void {
    const previous = this.scope;
    this.scope = undefined;
    this.catalogConnection = undefined;
    this.queueRelease(previous);
  }

  async listChats(cursor: string | null = null): Promise<void> {
    const connection = this.catalogConnection;
    if (!connection || this.view.catalogLoading) return;
    this.update({ catalogLoading: true, catalogError: null });
    try {
      // A reconnect can happen before the old page releases the frame's slot.
      await this.listing?.catch(() => {});
      if (this.catalogConnection !== connection) return;
      this.listing = this.bridge.list(cursor).finally(() => {
        this.listing = undefined;
      });
      const page = await this.listing;
      if (this.catalogConnection !== connection) return;
      this.catalog = page;
      this.update({
        sessions: this.sessionChoices(),
        catalogCursor: cursor,
        nextCatalogCursor: page.nextCursor,
      });
    } catch {
      if (this.catalogConnection === connection)
        this.update({ catalogError: "Couldn't list saved chats." });
    } finally {
      if (this.catalogConnection === connection)
        this.update({ catalogLoading: false });
    }
  }

  async select(sessionId: string | null): Promise<void> {
    if (
      this.scope &&
      (this.scope.opening || this.scope.attachment) &&
      sessionId !== null &&
      (this.scope.attachment?.sessionId ?? this.scope.requested) === sessionId
    )
      return;
    this.queueRelease(this.scope);
    const scope: Scope = {
      id: ++this.generation,
      requested: sessionId,
      durable: [],
      live: new Map(),
      gaps: new Set(),
      observation: null,
      replay: true,
    };
    this.scope = scope;
    this.update({
      scope: scope.id,
      selected: sessionId,
      messages: [],
      observation: null,
      loading: sessionId !== null,
      acting: false,
      repairing: false,
      error: null,
    });
    if (sessionId === null) {
      this.save();
      return;
    }
    try {
      await this.open(scope);
      await this.refresh(scope);
    } catch (error) {
      if (this.owns(scope))
        this.update({ error: describe(error, "Couldn't open this chat.") });
    } finally {
      if (this.owns(scope)) this.update({ loading: false });
    }
  }

  async submit(text: string): Promise<void> {
    const scope = this.scope;
    if (
      !scope ||
      this.view.loading ||
      this.view.acting ||
      this.view.observation?.snapshot.current ||
      this.view.observation?.snapshot.admissionPaused ||
      !text.trim()
    )
      throw new Error("native_chat_not_ready");
    this.update({ acting: true, error: null });
    try {
      await this.open(scope);
      const attachment = this.attachment(scope);
      const pending =
        scope.pending?.text === text
          ? scope.pending
          : { text, inputId: crypto.randomUUID() };
      scope.pending = pending;
      let accepted;
      try {
        accepted = await this.bridge.submit(
          attachment.attachmentId,
          pending.inputId,
          pending.text
        );
      } catch (error) {
        this.attachment(scope);
        // A lost acknowledgement does not authorize sending a second input.
        accepted = await this.bridge
          .inputReceipt(attachment.attachmentId, pending.inputId)
          .catch(() => {
            throw error;
          });
      }
      scope.pending = undefined;
      if (this.owns(scope)) {
        scope.awaitingTurn = accepted.turnId ?? undefined;
        scope.replay = true;
        await this.refresh(scope);
      }
    } catch (error) {
      if (this.owns(scope))
        this.update({
          error: describe(
            error,
            "Couldn't confirm the send. Your draft is still here."
          ),
        });
      throw error;
    } finally {
      if (this.owns(scope)) this.update({ acting: false });
    }
  }

  async control(action: NativeChatControl["action"]): Promise<void> {
    const scope = this.scope;
    if (
      !scope?.attachment ||
      this.view.acting ||
      !scope.observation?.snapshot.current
    )
      return;
    const observationId = scope.observation.observationId;
    this.update({ acting: true, error: null });
    try {
      await this.bridge.control(scope.attachment.attachmentId, {
        action,
        observationId,
        requestId: crypto.randomUUID(),
      });
    } catch (error) {
      if (this.owns(scope))
        this.update({
          error: describe(
            error,
            "The task changed. Check its status and try again."
          ),
        });
    } finally {
      if (this.owns(scope)) {
        this.update({ acting: false });
        await this.refresh(scope);
      }
    }
  }

  async repair(): Promise<void> {
    const scope = this.scope;
    if (!scope || (!scope.attachment && !scope.requested)) return;
    scope.replay = true;
    this.update({ error: null });
    try {
      await this.open(scope);
      await this.refresh(scope);
    } catch (error) {
      if (this.owns(scope))
        this.update({ error: describe(error, "Couldn't open this chat.") });
    }
  }

  private open(scope: Scope): Promise<void> {
    if (scope.attachment) return Promise.resolve();
    if (scope.opening) return scope.opening;
    const opening = this.attachments.then(async () => {
      if (!this.owns(scope)) return;
      const attachment = scope.requested
        ? await this.bridge.load(scope.requested)
        : await this.bridge.create();
      scope.attachment = attachment;
      if (!this.owns(scope)) return;
      this.recents = [
        attachment.sessionId,
        ...this.recents.filter((id) => id !== attachment.sessionId),
      ].slice(0, RECENTS_LIMIT);
      this.update({
        selected: attachment.sessionId,
        sessions: this.sessionChoices(),
      });
      this.save();
      await this.renewSubscription(scope);
    });
    this.attachments = opening.catch(() => {});
    scope.opening = opening.finally(() => {
      scope.opening = undefined;
    });
    return scope.opening;
  }

  private queueRelease(scope: Scope | undefined): void {
    if (!scope) return;
    clearTimeout(scope.timer);
    this.attachments = this.attachments.then(async () => {
      // Detach removes the subscription. It does not stop accepted work.
      if (scope.attachment)
        await this.bridge.detach(scope.attachment.attachmentId).catch(() => {});
    });
  }

  private refresh(scope: Scope): Promise<void> {
    if (!this.owns(scope) || !scope.attachment) return Promise.resolve();
    if (scope.refreshing) return scope.refreshing;
    clearTimeout(scope.timer);
    const attachment = scope.attachment;
    let observable = true;
    scope.refreshing = this.bridge
      .observe(attachment.attachmentId)
      .then(async (next) => {
        if (!this.owns(scope)) return;
        const replay =
          scope.replay ||
          lifecycleBasis(scope.observation) !== lifecycleBasis(next) ||
          (scope.gaps.size > 0 &&
            historyPosition(scope.observation) !== historyPosition(next));
        scope.observation = next;
        if (
          scope.awaitingTurn &&
          (next.snapshot.current?.turnId === scope.awaitingTurn ||
            next.snapshot.latest?.turnId === scope.awaitingTurn)
        )
          scope.awaitingTurn = undefined;
        this.update({ observation: next });
        if (!replay) return;
        scope.replay = false;
        const messages = await this.bridge.transcript(attachment.attachmentId);
        if (!this.owns(scope)) return;
        scope.durable = messages;
        const committed = new Set(messages.map((message) => message.messageId));
        const current = next.snapshot.current?.turnId;
        const latest = next.snapshot.latest?.turnId;
        for (const [id, message] of scope.live) {
          const retired = current
            ? message.turnId !== current
            : message.turnId === latest;
          if (committed.has(id) || retired) scope.live.delete(id);
        }
        for (const id of scope.gaps) {
          if (committed.has(id) || !current) scope.gaps.delete(id);
        }
        this.publishMessages(scope);
      })
      .catch((error: unknown) => {
        observable = false;
        if (!this.owns(scope)) return;
        this.update({
          error: describe(error, "Couldn't refresh this chat. Try Refresh."),
        });
      })
      .finally(() => {
        scope.refreshing = undefined;
        if (
          observable &&
          this.owns(scope) &&
          (scope.observation?.snapshot.current ||
            scope.replay ||
            scope.awaitingTurn)
        ) {
          scope.timer = setTimeout(() => {
            void this.refresh(scope);
          }, POLL_MS);
        }
      });
    return scope.refreshing;
  }

  private receive(scope: Scope, update: NativeChatUpdate): void {
    if (update.kind !== "text") {
      scope.live.clear();
      scope.gaps.clear();
      scope.replay = true;
      this.publishMessages(scope, true);
      if (update.kind === "closed") void this.renewSubscription(scope);
      void this.refresh(scope);
      return;
    }
    const known = scope.observation?.snapshot.current;
    if (known && known.turnId !== update.turnId) {
      void this.refresh(scope);
      return;
    }
    if (
      known?.turnId !== update.turnId &&
      scope.observation?.snapshot.latest?.turnId === update.turnId
    )
      return;
    if (scope.durable.some((message) => message.messageId === update.messageId))
      return;
    const previous = scope.live.get(update.messageId);
    const patch = applyText(previous, update);
    if (patch === "duplicate") return;
    if (!patch) {
      if (scope.gaps.has(update.messageId)) return;
      scope.live.delete(update.messageId);
      scope.gaps.add(update.messageId);
      scope.replay = true;
      this.publishMessages(scope);
      void this.refresh(scope);
      return;
    }
    scope.gaps.delete(update.messageId);
    scope.live.set(update.messageId, patch);
    this.publishMessages(scope);
    if (!known) void this.refresh(scope);
  }

  private async renewSubscription(scope: Scope): Promise<void> {
    try {
      const attachment = this.attachment(scope);
      const id = await this.bridge.subscribe(
        attachment.attachmentId,
        (update) => {
          if (this.owns(scope)) this.receive(scope, update);
        }
      );
      if (!this.owns(scope)) await this.bridge.unsubscribe(id).catch(() => {});
    } catch {
      if (this.owns(scope))
        this.update({
          error:
            "Live updates are unavailable. Use Refresh to read committed messages.",
        });
    }
  }

  private publishMessages(scope: Scope, repairing = scope.gaps.size > 0): void {
    this.update({
      messages: [...scope.durable, ...scope.live.values()],
      repairing,
    });
  }

  private owns(scope: Scope): boolean {
    return this.scope === scope;
  }

  private attachment(scope: Scope): NativeChatAttachment {
    if (!this.owns(scope) || !scope.attachment)
      throw new Error("native_chat_selection_changed");
    return scope.attachment;
  }

  private update(change: Partial<NativeChatView>): void {
    this.view = { ...this.view, ...change };
    for (const listener of this.listeners) listener();
  }

  private sessionChoices(): readonly string[] {
    return [...new Set([...this.recents, ...(this.catalog?.sessionIds ?? [])])];
  }

  private restore(): { selected: string | null; sessions: string[] } {
    try {
      const value = JSON.parse(
        this.memoryKey
          ? (this.memory?.getItem(this.memoryKey) ?? "null")
          : "null"
      );
      if (value && Array.isArray(value.sessions)) {
        const sessions = value.sessions
          .filter(
            (id: unknown): id is string =>
              typeof id === "string" && /^[a-z0-9-]{1,256}$/i.test(id)
          )
          .slice(0, RECENTS_LIMIT);
        return {
          sessions,
          selected: sessions.includes(value.selected) ? value.selected : null,
        };
      }
    } catch {
      /* Browser storage may be disabled. */
    }
    return { selected: null, sessions: [] };
  }

  private save(): void {
    try {
      if (this.memoryKey)
        this.memory?.setItem(
          this.memoryKey,
          JSON.stringify({
            selected: this.view.selected,
            sessions: this.recents,
          })
        );
    } catch {
      /* Browser storage may be disabled. */
    }
  }
}

function lifecycleBasis(observation: NativeChatObservation | null): string {
  const current = observation?.snapshot.current;
  const latest = observation?.snapshot.latest;
  return JSON.stringify([
    current?.turnId,
    current?.disposition,
    latest?.turnId,
    latest?.status,
  ]);
}

function historyPosition(
  observation: NativeChatObservation | null
): number | undefined {
  return (
    observation?.snapshot.current?.historyPosition ??
    observation?.snapshot.latest?.historyPosition
  );
}

function applyText(
  previous: (NativeChatMessage & { turnId: string; bytes: number }) | undefined,
  update: NativeChatTextUpdate
):
  | (NativeChatMessage & { turnId: string; bytes: number })
  | "duplicate"
  | null {
  const existing = update.replace ? undefined : previous;
  if (
    existing &&
    (existing.turnId !== update.turnId || existing.role !== update.role)
  )
    return null;
  const bytes = existing?.bytes ?? 0;
  const added = utf8.encode(update.text);
  if (!update.replace && update.offsetBytes < bytes && existing) {
    const prefix = utf8
      .encode(existing.text)
      .subarray(update.offsetBytes, update.offsetBytes + added.length);
    if (
      prefix.length === added.length &&
      prefix.every((byte, index) => byte === added[index])
    )
      return "duplicate";
  }
  if (update.offsetBytes !== bytes || bytes + added.length > MAX_LIVE_BYTES)
    return null;
  return {
    messageId: update.messageId,
    role: update.role,
    turnId: update.turnId,
    bytes: bytes + added.length,
    text: (existing?.text ?? "") + update.text,
  };
}

function describe(error: unknown, fallback: string): string {
  return error instanceof Error &&
    error.message.includes("native_chat_transcript_too_large")
    ? "This chat is too large to restore in the workspace pane."
    : fallback;
}
