import type {
  DesktopNativeChat,
  NativeChatApproval,
  NativeChatApprovalDecision,
  NativeChatAttachment,
  NativeChatCatalogChange,
  NativeChatCatalogEntry,
  NativeChatControl,
  NativeChatGoalAction,
  NativeChatGoalControl,
  NativeChatGoalObservation,
  NativeChatGoalRequest,
  NativeChatMessage,
  NativeChatObservation,
  NativeChatOperatingRegime,
  NativeChatPage,
  NativeChatQuestion,
  NativeChatQuestionAnswer,
  NativeChatQueueAction,
  NativeChatQueueChange,
  NativeChatQueuePage,
  NativeChatSteer,
  NativeChatReadiness,
  NativeChatTextUpdate,
  NativeChatTurnSummary,
  NativeChatUpdate,
  NativeContextLimit,
} from "@grida/desktop-bridge";
import { NativeSideChatController } from "./native-side-chat-controller";

const POLL_MS = 500;
const RECENTS_LIMIT = 12;
const MAX_LIVE_BYTES = 1024 * 1024;
const MAX_PNG_BYTES = 256 * 1024;
const MAX_CONFIGURATION_MESSAGE_BYTES = 1024;
const utf8 = new TextEncoder();

export type NativeChatView = Readonly<{
  scope: number;
  selected: string | null;
  sessions: readonly string[];
  catalogCursor: string | null;
  nextCatalogCursor: string | null;
  catalogLoading: boolean;
  catalogError: string | null;
  catalogArchived: boolean;
  catalogEntry: NativeChatCatalogEntry | null;
  catalogEntryError: string | null;
  catalogChanging: boolean;
  catalogDraft: Readonly<{
    text: string;
    basis: NativeChatCatalogEntry;
  }> | null;
  messages: readonly NativeChatMessage[];
  sideChat: NativeSideChatController | null;
  imageInput: boolean;
  imageReading: boolean;
  imageDraft: Readonly<{ name: string; size: number }> | null;
  contextLimitOpen: boolean;
  contextLimit: NativeContextLimit | null;
  contextLimitDraft: string;
  contextLimitBusy: boolean;
  contextLimitError: string | null;
  reviewConfiguration: boolean;
  observation: NativeChatObservation | null;
  turnSummary: NativeChatTurnSummary | null;
  approvals: readonly NativeChatApproval[];
  approvalError: string | null;
  questions: readonly NativeChatQuestion[];
  questionReady: boolean;
  questionError: string | null;
  queue: NativeChatQueuePage | null;
  queueLoading: boolean;
  queueDraft: Readonly<{ inputId: string; text: string }> | null;
  steering: boolean;
  operatingRegime: NativeChatOperatingRegime;
  goal: NativeChatGoalObservation | null;
  goalReady: boolean;
  loading: boolean;
  acting: boolean;
  repairing: boolean;
  error: string | null;
}>;

type Scope = {
  id: number;
  requested: string | null;
  attachment?: NativeChatAttachment;
  sideChat?: NativeSideChatController;
  image?: ArrayBuffer;
  imageRead?: object;
  opening?: Promise<void>;
  refreshing?: Promise<void>;
  timer?: ReturnType<typeof setTimeout>;
  durable: readonly NativeChatMessage[];
  live: Map<string, NativeChatMessage & { turnId: string; bytes: number }>;
  gaps: Set<string>;
  observation: NativeChatObservation | null;
  summaryRequest?: { turnId: string; failed?: boolean };
  approvalBasis?: string;
  questionBasis?: string;
  queueBasis?: { revision: number; offset: number; observationId: string };
  queueListing?: Promise<void>;
  pendingQueueChange?: { key: string; change: NativeChatQueueChange };
  steeringTarget?: string;
  pendingSteering?: NativeChatSteer;
  goalRevision?: number;
  goalNeedsRefresh?: boolean;
  awaitingGoalId?: string;
  pendingGoalStart?: { key: string; inputId: string };
  pendingGoalControl?: NativeChatGoalControl;
  replay: boolean;
  pending?: {
    text: string;
    inputId: string;
    mode: "submit" | "enqueue";
    operatingRegime?: NativeChatOperatingRegime;
    image?: ArrayBuffer;
    reviewConfiguration: boolean;
  };
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
  catalogArchived: false,
  catalogEntry: null,
  catalogEntryError: null,
  catalogChanging: false,
  catalogDraft: null,
  messages: [],
  sideChat: null,
  imageInput: false,
  imageReading: false,
  imageDraft: null,
  contextLimitOpen: false,
  contextLimit: null,
  contextLimitDraft: "",
  contextLimitBusy: false,
  contextLimitError: null,
  reviewConfiguration: false,
  observation: null,
  turnSummary: null,
  approvals: [],
  approvalError: null,
  questions: [],
  questionReady: false,
  questionError: null,
  queue: null,
  queueLoading: false,
  queueDraft: null,
  steering: false,
  operatingRegime: "act",
  goal: null,
  goalReady: false,
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
  private catalogRequest?: object;
  private catalog: NativeChatPage | null = null;
  private listing?: Promise<NativeChatPage>;
  private recents: readonly string[] = [];

  constructor(
    private readonly bridge: DesktopNativeChat,
    private readonly memory?: Pick<Storage, "getItem" | "setItem">,
    private readonly memoryKey?: string
  ) {}

  static watchReadiness(
    bridge: DesktopNativeChat,
    publish: (state: NativeChatReadiness | null) => void
  ): () => void {
    let watching = true;
    const probe = async () => {
      try {
        const state = bridge.status
          ? await bridge.status()
          : (await bridge.available())
            ? "native-ready"
            : "legacy";
        if (!watching) return;
        publish(state);
        if (watching && state === "native-starting" && bridge.status) {
          const ready = await bridge.status(true);
          if (watching)
            publish(ready === "native-ready" ? ready : "native-unavailable");
        }
      } catch {
        if (watching) publish(null);
      }
    };
    // Electron rejects chat attachment while its main frame is loading.
    if (typeof document !== "undefined" && document.readyState !== "complete")
      window.addEventListener("load", probe, { once: true });
    else void probe();
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
      sessions: this.sessionChoices(),
      catalogCursor: null,
      nextCatalogCursor: null,
      catalogLoading: false,
      catalogError: null,
      catalogArchived: false,
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

  async listChats(
    cursor: string | null = null,
    archived = this.view.catalogArchived
  ): Promise<void> {
    const connection = this.catalogConnection;
    const list = archived ? this.bridge.listArchived : this.bridge.list;
    if (!connection || !list) return;
    const request = {};
    this.catalogRequest = request;
    const owns = () =>
      this.catalogConnection === connection && this.catalogRequest === request;
    if (archived !== this.view.catalogArchived) {
      this.catalog = null;
      this.update({
        catalogArchived: archived,
        sessions: [],
        catalogCursor: null,
        nextCatalogCursor: null,
      });
    }
    this.update({ catalogLoading: true, catalogError: null });
    try {
      // A reconnect can happen before the old page releases the frame's slot.
      await this.listing?.catch(() => {});
      if (!owns()) return;
      this.listing = list.call(this.bridge, cursor).finally(() => {
        this.listing = undefined;
      });
      const page = await this.listing;
      if (!owns()) return;
      this.catalog = page;
      this.update({
        sessions: this.sessionChoices(),
        catalogCursor: cursor,
        nextCatalogCursor: page.nextCursor,
      });
    } catch {
      if (owns()) this.update({ catalogError: "Couldn't list saved chats." });
    } finally {
      if (owns()) this.update({ catalogLoading: false });
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
      catalogEntry: null,
      catalogEntryError: null,
      catalogChanging: false,
      catalogDraft: null,
      messages: [],
      sideChat: null,
      imageInput: false,
      imageReading: false,
      imageDraft: null,
      contextLimitOpen: false,
      contextLimit: null,
      contextLimitDraft: "",
      contextLimitBusy: false,
      contextLimitError: null,
      reviewConfiguration: false,
      observation: null,
      turnSummary: null,
      approvals: [],
      approvalError: null,
      questions: [],
      questionReady: false,
      questionError: null,
      queue: null,
      queueLoading: false,
      queueDraft: null,
      steering: false,
      operatingRegime: "act",
      goal: null,
      goalReady: false,
      loading: sessionId !== null,
      acting: false,
      repairing: false,
      error: null,
    });
    void this.readImageCapability(scope);
    if (sessionId === null) {
      this.save();
      return;
    }
    try {
      await this.open(scope);
      await this.refresh(scope);
    } catch (error) {
      if (this.owns(scope)) {
        if (deletedAttachment(error)) this.forgetDeletedChat(scope);
        else
          this.update({ error: describe(error, "Couldn't open this chat.") });
      }
    } finally {
      if (this.owns(scope)) this.update({ loading: false });
    }
  }

  get canSubmit(): boolean {
    return (
      !!this.scope &&
      !this.view.loading &&
      !this.view.acting &&
      !this.view.imageReading &&
      (!this.scope.image || this.view.imageInput) &&
      (this.view.steering
        ? this.canSteer &&
          this.scope.steeringTarget ===
            this.view.observation?.snapshot.current?.turnId
        : !this.needsQueue || !!this.bridge.enqueue)
    );
  }

  get canAttachPng(): boolean {
    return (
      !!this.scope &&
      this.view.imageInput &&
      !this.view.loading &&
      !this.view.acting &&
      !this.view.steering &&
      !this.view.reviewConfiguration
    );
  }

  async pickPng(
    scopeId: number,
    file: Pick<File, "name" | "size" | "arrayBuffer">
  ): Promise<void> {
    const scope = this.scope;
    if (!scope || scope.id !== scopeId || !this.canAttachPng) return;
    const read = {};
    scope.imageRead = read;
    this.update({ imageReading: true, error: null });
    const ownsRead = () => this.owns(scope) && scope.imageRead === read;
    try {
      if (file.size <= 0 || file.size > MAX_PNG_BYTES)
        throw new Error("image_size_limit");
      const bytes = await file.arrayBuffer();
      if (!ownsRead()) return;
      if (bytes.byteLength !== file.size) throw new Error("invalid_png_image");
      const previous = scope.image && new Uint8Array(scope.image);
      if (
        previous?.byteLength !== bytes.byteLength ||
        !new Uint8Array(bytes).every((byte, index) => byte === previous[index])
      ) {
        scope.image = bytes;
        if (scope.pending?.image) scope.pending = undefined;
      }
      this.update({
        imageDraft: { name: file.name.slice(0, 256), size: bytes.byteLength },
      });
    } catch (error) {
      if (ownsRead())
        this.update({
          error: describe(error, "Couldn't read the selected PNG."),
        });
    } finally {
      if (ownsRead()) {
        scope.imageRead = undefined;
        this.update({ imageReading: false });
      }
    }
  }

  removePng(scopeId: number): void {
    const scope = this.scope;
    if (!scope || scope.id !== scopeId || this.view.acting) return;
    scope.imageRead = undefined;
    scope.image = undefined;
    if (scope.pending?.image) scope.pending = undefined;
    this.update({ imageDraft: null, imageReading: false, error: null });
  }

  private async readImageCapability(scope: Scope): Promise<void> {
    if (!this.bridge.acceptsPng || !this.bridge.submitImage) return;
    const supported = await this.bridge.acceptsPng().catch(() => false);
    if (this.owns(scope)) this.update({ imageInput: supported === true });
  }

  get hasContextLimit(): boolean {
    return !!this.bridge.contextLimit && !!this.bridge.saveContextLimit;
  }

  get canReviewConfiguration(): boolean {
    return (
      !!this.scope &&
      !!this.bridge.submitWithConfigurationReview &&
      this.view.contextLimit?.exactCounting === true &&
      this.view.contextLimit.source !== "invalid" &&
      this.view.operatingRegime === "act" &&
      !this.view.steering &&
      !this.view.acting &&
      !this.scope.image &&
      !this.scope.imageRead
    );
  }

  setConfigurationReview(requested: boolean): void {
    if (!this.view.acting && (!requested || this.canReviewConfiguration))
      this.update({ reviewConfiguration: requested });
  }

  async toggleContextLimit(): Promise<void> {
    if (!this.hasContextLimit || this.view.contextLimitBusy) return;
    const open = !this.view.contextLimitOpen;
    this.update({ contextLimitOpen: open });
    if (open) await this.refreshContextLimit();
  }

  changeContextLimitDraft(draft: string): void {
    if (!this.view.contextLimitBusy) this.update({ contextLimitDraft: draft });
  }

  async refreshContextLimit(): Promise<void> {
    const scope = this.scope;
    if (!scope || !this.bridge.contextLimit || this.view.contextLimitBusy)
      return;
    this.update({ contextLimitBusy: true, contextLimitError: null });
    try {
      const contextLimit = await this.bridge.contextLimit();
      if (this.owns(scope))
        this.update({
          contextLimit,
          contextLimitDraft: contextLimit.limit?.toString() ?? "",
          ...((!contextLimit.exactCounting ||
            contextLimit.source === "invalid") && {
            reviewConfiguration: false,
          }),
        });
    } catch {
      if (this.owns(scope))
        this.update({
          contextLimitError: "Couldn't read the context input limit.",
        });
    } finally {
      if (this.owns(scope)) this.update({ contextLimitBusy: false });
    }
  }

  async saveContextLimit(reset = false): Promise<void> {
    const scope = this.scope;
    const basis = this.view.contextLimit;
    const draft = this.view.contextLimitDraft;
    if (
      !scope ||
      !basis ||
      basis.source === "invalid" ||
      (!reset && !basis.exactCounting) ||
      !this.bridge.saveContextLimit ||
      this.view.contextLimitBusy
    )
      return;
    const limit = reset ? null : Number(draft);
    if (
      !reset &&
      (!/^[0-9]+$/.test(draft) || !Number.isSafeInteger(limit) || limit! < 1)
    ) {
      this.update({
        contextLimitError: "Enter a positive whole number of tokens.",
      });
      return;
    }
    this.update({ contextLimitBusy: true, contextLimitError: null });
    let refresh = false;
    try {
      const result = await this.bridge.saveContextLimit(basis.reviewId, limit);
      if (!this.owns(scope)) return;
      this.update({
        contextLimit: { ...basis, limit: result.limit, source: "active" },
      });
      refresh = true;
    } catch (error) {
      if (!this.owns(scope)) return;
      if (
        error instanceof Error &&
        error.message.includes("config_revision_changed")
      ) {
        refresh = true;
      } else {
        this.update({
          contextLimitError: describe(
            error,
            "Couldn't confirm the setting change. Check the current value."
          ),
        });
      }
    } finally {
      if (this.owns(scope)) this.update({ contextLimitBusy: false });
    }
    if (refresh && this.owns(scope)) {
      await this.refreshContextLimit();
      if (this.owns(scope) && this.view.contextLimit?.limit !== limit)
        this.update({
          contextLimitDraft: draft,
          contextLimitError:
            "The default changed. Review it before saving again.",
        });
    }
  }

  get canOrganizeChats(): boolean {
    return (
      !!this.bridge.listArchived &&
      !!this.bridge.catalogEntry &&
      !!this.bridge.organize
    );
  }

  chatTitle(sessionId: string): string {
    const selected = this.view.catalogEntry;
    const title =
      selected?.sessionId === sessionId
        ? selected.title
        : this.catalog?.titles?.find((entry) => entry.sessionId === sessionId)
            ?.title;
    return title ?? `Chat ${sessionId.slice(0, 8)}`;
  }

  beginRename(): void {
    const basis = this.view.catalogEntry;
    if (basis && !this.view.catalogChanging)
      this.update({
        catalogDraft: { text: basis.title ?? "", basis },
        catalogEntryError: null,
      });
  }

  changeTitle(text: string): void {
    const draft = this.view.catalogDraft;
    if (draft && !this.view.catalogChanging)
      this.update({ catalogDraft: { ...draft, text } });
  }

  cancelRename(): void {
    if (!this.view.catalogChanging)
      this.update({ catalogDraft: null, catalogEntryError: null });
  }

  async saveTitle(): Promise<void> {
    const draft = this.view.catalogDraft;
    if (!draft) return;
    const text = draft.text.trim();
    if (/\p{Cc}/u.test(text) || utf8.encode(text).length > 256) {
      this.update({
        catalogEntryError:
          "Use a title of at most 256 UTF-8 bytes without control characters.",
      });
      return;
    }
    await this.organize({
      revision: draft.basis.revision,
      title: text || null,
      archived: draft.basis.archived,
    });
  }

  async setChatArchived(archived: boolean): Promise<void> {
    const entry = this.view.catalogEntry;
    if (!entry || this.view.catalogDraft || entry.archived === archived) return;
    await this.organize({
      revision: entry.revision,
      title: entry.title,
      archived,
    });
  }

  get canDeleteSavedChat(): boolean {
    const snapshot = this.scope?.observation?.snapshot;
    return !!(
      this.bridge.deleteSavedChat &&
      this.scope?.attachment &&
      snapshot &&
      this.view.catalogEntry?.deletionAvailable &&
      !snapshot.current &&
      !snapshot.queuedInputs &&
      !this.view.catalogChanging &&
      !this.view.acting
    );
  }

  async deleteSavedChat(): Promise<void> {
    const scope = this.scope;
    const connection = this.catalogConnection;
    const attachment = scope?.attachment;
    const observation = scope?.observation;
    const entry = this.view.catalogEntry;
    if (
      !this.canDeleteSavedChat ||
      !scope ||
      !attachment ||
      !observation ||
      !entry ||
      !this.bridge.deleteSavedChat
    )
      return;
    this.update({ catalogChanging: true, catalogEntryError: null });
    try {
      const deleted = await this.bridge.deleteSavedChat(
        attachment.attachmentId,
        observation.observationId,
        entry.revision
      );
      if (deleted && this.catalogConnection === connection)
        this.forgetDeletedChat(scope);
    } catch (error) {
      if (!this.owns(scope)) return;
      if (deletedAttachment(error)) {
        this.forgetDeletedChat(scope);
        return;
      }
      const reason = error instanceof Error ? error.message : "";
      if (
        reason.includes("session_catalog_revision_changed") ||
        reason.includes("stale_session_revision")
      ) {
        await Promise.all([this.readCatalogEntry(scope), this.refresh(scope)]);
        if (!this.owns(scope)) return;
      }
      this.update({ catalogEntryError: deletionError(reason) });
    } finally {
      if (this.owns(scope)) this.update({ catalogChanging: false });
    }
  }

  async readChatDetails(): Promise<void> {
    if (this.scope) await this.readCatalogEntry(this.scope);
  }

  get canOpenSideChat(): boolean {
    return (
      !!this.scope?.attachment &&
      !this.scope.sideChat &&
      NativeSideChatController.supported(this.bridge)
    );
  }

  openSideChat(): void {
    const scope = this.scope;
    if (
      !scope?.attachment ||
      scope.sideChat ||
      !NativeSideChatController.supported(this.bridge)
    )
      return;
    const side = new NativeSideChatController(
      this.bridge,
      scope.attachment.attachmentId
    );
    scope.sideChat = side;
    this.update({ sideChat: side });
    void side.open();
  }

  async closeSideChat(): Promise<void> {
    const scope = this.scope;
    const side = scope?.sideChat;
    if (!scope || !side) return;
    try {
      await side.close();
    } catch {
      if (this.owns(scope))
        this.update({ error: "Couldn't confirm that the side chat closed." });
    } finally {
      if (this.owns(scope) && scope.sideChat === side) {
        scope.sideChat = undefined;
        this.update({ sideChat: null });
      }
    }
  }

  stageSideAnswer(
    side: NativeSideChatController,
    turnId: string,
    append: (text: string) => boolean
  ): void {
    const scope = this.scope;
    if (
      !scope?.attachment ||
      scope.sideChat !== side ||
      this.view.steering ||
      this.view.acting
    )
      return;
    const quote = side.quote(turnId);
    if (quote && !append(quote))
      this.update({ error: "Couldn't add the side answer to this draft." });
  }

  get canSteer(): boolean {
    const turn = this.view.observation?.snapshot.current;
    return (
      !!this.bridge.steer &&
      !this.scope?.image &&
      !this.scope?.imageRead &&
      !this.view.reviewConfiguration &&
      !!turn &&
      !turn.cancelled &&
      (turn.disposition === "running" || turn.disposition === "suspended")
    );
  }

  get canStartGoal(): boolean {
    const scope = this.scope;
    const snapshot = scope?.observation?.snapshot;
    const goal = this.view.goal?.goal;
    return (
      !!scope &&
      !!this.bridge.goal &&
      !!this.bridge.startGoal &&
      !this.view.loading &&
      !this.view.acting &&
      !scope.awaitingGoalId &&
      (!scope.attachment || this.view.goalReady) &&
      !snapshot?.current &&
      !snapshot?.queuedInputs &&
      !snapshot?.admissionPaused &&
      (!goal ||
        (!goal.reservation &&
          (goal.state.status === "complete" ||
            goal.state.status === "cleared")))
    );
  }

  canControlGoal(action: NativeChatGoalAction): boolean {
    const goal = this.view.goal?.goal;
    const snapshot = this.scope?.observation?.snapshot;
    const current = snapshot?.current;
    if (
      !this.bridge.controlGoal ||
      !this.view.goalReady ||
      this.view.acting ||
      !goal ||
      goal.state.status === "cleared" ||
      (current && current.turnId !== goal.reservation?.turnId)
    )
      return false;
    if (action === "clear") return true;
    if (action === "pause")
      return (
        goal.state.status === "active" &&
        !goal.paused &&
        !current?.cancelled &&
        (!!current || goal.automatic)
      );
    if (
      snapshot?.admissionPaused ||
      goal.state.status === "exhausted" ||
      goal.state.status === "complete" ||
      goal.reservation?.uncertain
    )
      return false;
    return current
      ? goal.paused &&
          current.paused &&
          !current.cancelled &&
          current.disposition === "suspended"
      : goal.automatic &&
          !goal.reservation &&
          (goal.paused || goal.state.status === "blocked");
  }

  async startGoal(request: NativeChatGoalRequest): Promise<boolean> {
    const scope = this.scope;
    if (!scope || !this.canStartGoal || !this.bridge.startGoal) return false;
    const problem = goalRequestProblem(request);
    if (problem) {
      this.update({ error: problem });
      return false;
    }
    const key = JSON.stringify(request);
    const pending =
      scope.pendingGoalStart?.key === key
        ? scope.pendingGoalStart
        : { key, inputId: crypto.randomUUID() };
    scope.pendingGoalStart = pending;
    this.update({ acting: true, error: null });
    try {
      await this.open(scope);
      const attachment = this.attachment(scope);
      const receipt = await this.bridge.startGoal(
        attachment.attachmentId,
        pending.inputId,
        request
      );
      if (
        receipt.disposition === "withdrawn" ||
        receipt.disposition === "superseded"
      )
        throw new Error("native_chat_goal_start_unavailable");
      scope.pendingGoalStart = undefined;
      if (!this.owns(scope)) return false;
      scope.awaitingGoalId =
        this.view.goal?.goal?.goalId === receipt.inputId
          ? undefined
          : receipt.inputId;
      scope.replay = true;
      await this.refresh(scope);
      return true;
    } catch {
      if (this.owns(scope)) {
        this.update({
          error: "Couldn't confirm the goal start. Your draft is still here.",
        });
        await this.refresh(scope);
      }
      return false;
    } finally {
      if (this.owns(scope)) this.update({ acting: false });
    }
  }

  async controlGoal(action: NativeChatGoalAction): Promise<void> {
    const scope = this.scope;
    const observationId = this.view.goal?.observationId;
    if (
      !scope?.attachment ||
      !observationId ||
      !this.bridge.controlGoal ||
      !this.canControlGoal(action)
    )
      return;
    const change =
      scope.pendingGoalControl?.action === action
        ? scope.pendingGoalControl
        : { action, observationId, requestId: crypto.randomUUID() };
    scope.pendingGoalControl = change;
    this.update({ acting: true, error: null });
    try {
      await this.bridge.controlGoal(scope.attachment.attachmentId, change);
      scope.pendingGoalControl = undefined;
    } catch (error) {
      if (revisionChanged(error)) scope.pendingGoalControl = undefined;
      if (this.owns(scope))
        this.update({
          error:
            "Couldn't confirm the goal control. Check the goal and try again.",
        });
    } finally {
      if (this.owns(scope)) {
        await this.refresh(scope);
        if (this.owns(scope)) this.update({ acting: false });
      }
    }
  }

  private get needsQueue(): boolean {
    const snapshot = this.view.observation?.snapshot;
    return (
      !!snapshot &&
      (!!snapshot.current ||
        snapshot.admissionPaused ||
        snapshot.queuedInputs > 0)
    );
  }

  toggleSteering(): void {
    const scope = this.scope;
    if (!scope || this.view.acting) return;
    if (this.view.steering) {
      scope.steeringTarget = undefined;
      scope.pendingSteering = undefined;
      this.update({ steering: false, error: null });
    } else if (this.canSteer) {
      scope.steeringTarget = scope.observation?.snapshot.current?.turnId;
      this.update({ steering: true, error: null });
    }
  }

  selectOperatingRegime(operatingRegime: NativeChatOperatingRegime): void {
    if (this.bridge.submitInRegime && !this.view.acting && !this.view.steering)
      this.update({
        operatingRegime,
        ...(operatingRegime === "plan" && { reviewConfiguration: false }),
      });
  }

  async submit(text: string): Promise<void> {
    const scope = this.scope;
    if (!scope || !this.canSubmit || !text.trim())
      throw new Error("native_chat_not_ready");
    if (this.view.steering) return this.submitSteering(scope, text);
    const mode = this.needsQueue ? "enqueue" : "submit";
    const image = scope.image;
    const reviewConfiguration = this.view.reviewConfiguration;
    if (reviewConfiguration && !this.canReviewConfiguration)
      throw new Error("native_context_limit_unavailable");
    if (
      reviewConfiguration &&
      utf8.encode(text).length > MAX_CONFIGURATION_MESSAGE_BYTES
    ) {
      const error = "Use a message of at most 1 KiB for settings review.";
      this.update({ error });
      throw new Error(error);
    }
    const operatingRegime =
      image || reviewConfiguration || this.bridge.submitInRegime
        ? this.view.operatingRegime
        : undefined;
    this.update({ acting: true, error: null });
    try {
      await this.open(scope);
      const attachment = this.attachment(scope);
      const retained =
        scope.pending?.text === text && scope.pending.image === image
          ? scope.pending
          : undefined;
      if (retained && retained.operatingRegime !== operatingRegime)
        throw new Error("native_chat_pending_regime_changed");
      if (retained && retained.reviewConfiguration !== reviewConfiguration)
        throw new Error("native_context_limit_pending_review_changed");
      const pending: NonNullable<Scope["pending"]> = retained ?? {
        text,
        inputId: crypto.randomUUID(),
        mode,
        operatingRegime,
        image,
        reviewConfiguration,
      };
      scope.pending = pending;
      let accepted;
      try {
        if (pending.reviewConfiguration) {
          if (!this.bridge.submitWithConfigurationReview)
            throw new Error("native_context_limit_unavailable");
          accepted = await this.bridge.submitWithConfigurationReview(
            attachment.attachmentId,
            {
              action: pending.mode,
              inputId: pending.inputId,
              text: pending.text,
            }
          );
        } else if (pending.image) {
          if (!this.bridge.submitImage || !pending.operatingRegime)
            throw new Error("image_input_unavailable");
          accepted = await this.bridge.submitImage(attachment.attachmentId, {
            action: pending.mode,
            inputId: pending.inputId,
            text: pending.text,
            png: pending.image,
            operatingRegime: pending.operatingRegime,
          });
        } else if (pending.operatingRegime) {
          if (!this.bridge.submitInRegime)
            throw new Error("native_chat_operating_regime_unavailable");
          accepted = await this.bridge.submitInRegime(
            pending.mode,
            attachment.attachmentId,
            pending.inputId,
            pending.text,
            pending.operatingRegime
          );
        } else {
          const send = this.bridge[pending.mode];
          if (!send) throw new Error("native_chat_enqueue_unavailable");
          accepted = await send.call(
            this.bridge,
            attachment.attachmentId,
            pending.inputId,
            pending.text
          );
        }
      } catch (error) {
        this.attachment(scope);
        if (pending.reviewConfiguration) throw error;
        // A lost acknowledgement does not authorize sending a second input.
        accepted = await this.bridge
          .inputReceipt(attachment.attachmentId, pending.inputId)
          .catch(() => {
            throw error;
          });
      }
      scope.pending = undefined;
      if (this.owns(scope)) {
        if (pending.reviewConfiguration)
          this.update({ reviewConfiguration: false });
        if (pending.image && scope.image === pending.image) {
          scope.image = undefined;
          this.update({ imageDraft: null });
        }
        scope.awaitingTurn = accepted.turnId ?? undefined;
        scope.replay = true;
        await this.refresh(scope);
      }
    } catch (error) {
      const reviewDeclined =
        error instanceof Error &&
        error.message.includes("native_context_limit_review_declined");
      if (
        reviewDeclined ||
        (error instanceof Error &&
          /session_(queue_waiting|prompt_in_progress|admission_paused|turn_requires_recovery)/.test(
            error.message
          ))
      )
        scope.pending = undefined;
      if (this.owns(scope)) {
        this.update({
          ...(reviewDeclined && { reviewConfiguration: false }),
          error: describe(
            error,
            "Couldn't confirm the send. Your draft is still here."
          ),
        });
        await this.refresh(scope);
      }
      throw error;
    } finally {
      if (this.owns(scope)) this.update({ acting: false });
    }
  }

  private async submitSteering(scope: Scope, text: string): Promise<void> {
    const attachment = this.attachment(scope);
    const observation = scope.observation;
    if (!observation || !this.bridge.steer)
      throw new Error("native_chat_steering_unavailable");
    const pending =
      scope.pendingSteering?.text === text
        ? scope.pendingSteering
        : {
            text,
            observationId: observation.observationId,
            requestId: crypto.randomUUID(),
          };
    scope.pendingSteering = pending;
    this.update({ acting: true, error: null });
    try {
      await this.bridge.steer(attachment.attachmentId, pending);
      scope.pendingSteering = undefined;
      scope.steeringTarget = undefined;
      if (this.owns(scope)) {
        this.update({ steering: false });
        scope.replay = true;
        await this.refresh(scope);
      }
    } catch (error) {
      if (revisionChanged(error)) scope.pendingSteering = undefined;
      if (this.owns(scope)) {
        this.update({
          error:
            "Couldn't confirm the update to this turn. Your draft is still here.",
        });
        await this.refresh(scope);
      }
      throw error;
    } finally {
      if (this.owns(scope)) this.update({ acting: false });
    }
  }

  async showQueuePage(offset: number): Promise<void> {
    const scope = this.scope;
    if (scope) await this.refreshQueue(scope, offset);
  }

  async editQueuedText(inputId: string): Promise<void> {
    const scope = this.scope;
    if (
      !scope?.attachment ||
      !scope.queueBasis ||
      !this.queueCurrent ||
      !this.bridge.queuedText ||
      this.view.acting ||
      this.view.queueDraft ||
      scope.observation?.snapshot.pendingGoalId === inputId ||
      this.view.queue?.items.some(
        (item) => item.inputId === inputId && item.allowsConfigurationChange
      )
    )
      return;
    this.update({ acting: true, error: null });
    try {
      const text = await this.bridge.queuedText(
        scope.attachment.attachmentId,
        scope.queueBasis.observationId,
        inputId
      );
      if (this.owns(scope)) this.update({ queueDraft: { inputId, text } });
    } catch {
      if (this.owns(scope))
        this.update({ error: "Couldn't open the queued message." });
    } finally {
      if (this.owns(scope)) this.update({ acting: false });
    }
  }

  changeQueueDraft(text: string): void {
    if (this.view.queueDraft && !this.view.acting)
      this.update({ queueDraft: { ...this.view.queueDraft, text } });
  }

  closeQueueDraft(): void {
    if (!this.view.acting) this.update({ queueDraft: null });
  }

  async saveQueueDraft(): Promise<void> {
    const draft = this.view.queueDraft;
    if (draft?.text.trim())
      await this.editQueue({ action: "replace", ...draft });
  }

  get queueCurrent(): boolean {
    const scope = this.scope;
    return (
      !!scope?.queueBasis &&
      !this.view.queueLoading &&
      scope.queueBasis.revision === scope.observation?.snapshot.sessionRevision
    );
  }

  async editQueue(action: NativeChatQueueAction): Promise<void> {
    const scope = this.scope;
    if (
      !scope?.attachment ||
      !scope.observation ||
      !this.bridge.editQueue ||
      this.view.acting ||
      (action.action === "replace" &&
        (scope.observation.snapshot.pendingGoalId === action.inputId ||
          this.view.queue?.items.some(
            (item) =>
              item.inputId === action.inputId && item.allowsConfigurationChange
          )))
    )
      return;
    const observationId =
      action.action === "resume"
        ? scope.observation.observationId
        : this.queueCurrent
          ? scope.queueBasis?.observationId
          : undefined;
    const key = JSON.stringify(action);
    if (!observationId && scope.pendingQueueChange?.key !== key) return;
    const change =
      scope.pendingQueueChange?.key === key
        ? scope.pendingQueueChange.change
        : {
            ...action,
            observationId: observationId!,
            requestId: crypto.randomUUID(),
          };
    scope.pendingQueueChange = { key, change };
    this.update({ acting: true, error: null });
    try {
      await this.bridge.editQueue(scope.attachment.attachmentId, change);
      scope.pendingQueueChange = undefined;
      if (this.owns(scope) && action.action === "replace")
        this.update({ queueDraft: null });
    } catch (error) {
      if (revisionChanged(error)) scope.pendingQueueChange = undefined;
      if (this.owns(scope))
        this.update({
          error:
            "Couldn't confirm the queue change. Check the queue and try again.",
        });
    } finally {
      if (this.owns(scope)) {
        await this.refresh(scope);
        if (this.owns(scope)) this.update({ acting: false });
      }
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
    void this.readImageCapability(scope);
    if (scope.summaryRequest?.failed) scope.summaryRequest = undefined;
    this.update({ error: null });
    try {
      await this.open(scope);
      await this.refresh(scope);
    } catch (error) {
      if (this.owns(scope))
        this.update({ error: describe(error, "Couldn't open this chat.") });
    }
  }

  async answerApproval(
    reviewId: string,
    decision: NativeChatApprovalDecision
  ): Promise<void> {
    const scope = this.scope;
    if (
      !scope?.attachment ||
      !this.bridge.answerApproval ||
      this.view.acting ||
      !this.view.approvals.some((review) => review.reviewId === reviewId)
    )
      return;
    this.update({ acting: true, error: null });
    try {
      await this.bridge.answerApproval(
        scope.attachment.attachmentId,
        reviewId,
        decision
      );
      if (this.owns(scope)) this.update({ approvals: [] });
    } catch {
      if (this.owns(scope))
        this.update({
          error:
            "Couldn't confirm the permission decision. Check the pending request.",
        });
    } finally {
      if (this.owns(scope)) {
        await this.refresh(scope);
        if (this.owns(scope)) this.update({ acting: false });
      }
    }
  }

  async answerQuestion(
    questionId: string,
    answer: NativeChatQuestionAnswer
  ): Promise<boolean> {
    const scope = this.scope;
    const question = this.view.questions.find(
      (entry) => entry.questionId === questionId
    );
    if (
      !scope?.attachment ||
      !this.bridge.answerQuestion ||
      !question ||
      !this.view.questionReady ||
      this.view.acting
    )
      return false;
    if (answer.kind === "text" && utf8.encode(answer.text).length > 4096) {
      this.update({ error: "The answer exceeds the 4 KiB limit." });
      return false;
    }
    this.update({ acting: true, error: null });
    try {
      await this.bridge.answerQuestion(
        scope.attachment.attachmentId,
        question.reviewId,
        answer
      );
      if (this.owns(scope))
        this.update({
          questions: this.view.questions.filter(
            (entry) => entry.questionId !== questionId
          ),
          questionReady: false,
        });
      return true;
    } catch {
      if (this.owns(scope))
        this.update({
          error:
            "Couldn't confirm the answer. Check the question and try again.",
        });
      return false;
    } finally {
      if (this.owns(scope)) {
        await this.refresh(scope);
        if (this.owns(scope)) this.update({ acting: false });
      }
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
      void this.readCatalogEntry(scope);
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
    void scope.sideChat?.close().catch(() => {});
    this.attachments = this.attachments.then(async () => {
      // Detach removes the subscription. It does not stop accepted work.
      if (scope.attachment)
        await this.bridge.detach(scope.attachment.attachmentId).catch(() => {});
    });
  }

  private async readCatalogEntry(
    scope: Scope
  ): Promise<NativeChatCatalogEntry | null> {
    const attachment = scope.attachment;
    if (!attachment || !this.canOrganizeChats || !this.bridge.catalogEntry)
      return null;
    try {
      const entry = await this.bridge.catalogEntry(attachment.attachmentId);
      if (!this.owns(scope)) return null;
      if (entry.sessionId !== attachment.sessionId)
        throw new Error("native_chat_catalog_entry_mismatch");
      return this.installCatalogEntry(entry);
    } catch {
      if (this.owns(scope))
        this.update({ catalogEntryError: "Couldn't load the chat details." });
      return null;
    }
  }

  private installCatalogEntry(
    entry: NativeChatCatalogEntry
  ): NativeChatCatalogEntry {
    const current = this.view.catalogEntry;
    if (current && current.revision > entry.revision) return current;
    if (this.catalog && entry.archived !== this.view.catalogArchived)
      this.catalog = {
        ...this.catalog,
        sessionIds: this.catalog.sessionIds.filter(
          (id) => id !== entry.sessionId
        ),
      };
    this.update({
      catalogEntry: entry,
      catalogEntryError: null,
      sessions: this.sessionChoices(entry),
    });
    return entry;
  }

  private async organize(change: NativeChatCatalogChange): Promise<void> {
    const scope = this.scope;
    const attachment = scope?.attachment;
    if (
      !scope ||
      !attachment ||
      !this.bridge.organize ||
      this.view.catalogChanging
    )
      return;
    this.update({ catalogChanging: true, catalogEntryError: null });
    try {
      const saved = await this.bridge.organize(attachment.attachmentId, change);
      if (!this.owns(scope)) return;
      if (saved.sessionId !== attachment.sessionId)
        throw new Error("native_chat_catalog_entry_mismatch");
      this.installCatalogEntry(saved);
      this.update({ catalogDraft: null });
      void this.listChats();
    } catch (error) {
      if (!this.owns(scope)) return;
      if (
        error instanceof Error &&
        error.message.includes("session_catalog_revision_changed")
      ) {
        const entry = await this.readCatalogEntry(scope);
        if (!this.owns(scope)) return;
        const draft = this.view.catalogDraft;
        this.update({
          ...(draft && entry && { catalogDraft: { ...draft, basis: entry } }),
          catalogEntryError:
            "The chat changed. Review its details and try again.",
        });
      } else {
        this.update({
          catalogEntryError: "Couldn't confirm the change. Try again.",
        });
      }
    } finally {
      if (this.owns(scope)) this.update({ catalogChanging: false });
    }
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
        const turnChanged =
          scope.observation?.snapshot.current?.turnId !==
          next.snapshot.current?.turnId;
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
        this.update({
          observation: next,
          ...(turnChanged && {
            questions: [],
            questionReady: false,
            questionError: null,
          }),
        });
        this.refreshTurnSummary(scope, attachment, next);
        void this.refreshQueue(scope, this.view.queue?.offset ?? 0);
        await Promise.all([
          this.refreshApprovals(scope, attachment, next),
          this.refreshQuestions(scope, attachment, next),
          this.refreshGoal(scope, attachment, next),
        ]);
        if (!this.owns(scope)) return;
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
        if (deletedAttachment(error)) {
          this.forgetDeletedChat(scope);
          return;
        }
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
            (scope.observation?.snapshot.queuedInputs &&
              !scope.observation.snapshot.admissionPaused) ||
            scope.replay ||
            scope.awaitingTurn ||
            scope.awaitingGoalId ||
            scope.goalNeedsRefresh)
        ) {
          scope.timer = setTimeout(() => {
            void this.refresh(scope);
          }, POLL_MS);
        }
      });
    return scope.refreshing;
  }

  private refreshTurnSummary(
    scope: Scope,
    attachment: NativeChatAttachment,
    observation: NativeChatObservation
  ): void {
    const latest = observation.snapshot.latest;
    if (!this.bridge.turnSummary) return;
    if (latest?.disposition !== "settled" || !latest.status) {
      if (scope.summaryRequest) {
        scope.summaryRequest = undefined;
        this.update({ turnSummary: null });
      }
      return;
    }
    if (scope.summaryRequest?.turnId === latest.turnId) return;
    const request: NonNullable<Scope["summaryRequest"]> = {
      turnId: latest.turnId,
    };
    scope.summaryRequest = request;
    this.update({ turnSummary: null });
    void this.bridge
      .turnSummary(attachment.attachmentId, observation.observationId)
      .then((turnSummary) => {
        if (!this.owns(scope) || scope.summaryRequest !== request) return;
        if (
          turnSummary.turnId !== latest.turnId ||
          turnSummary.status !== latest.status
        ) {
          request.failed = true;
          return;
        }
        this.update({ turnSummary });
      })
      .catch(() => {
        request.failed = true;
      });
  }

  private async refreshApprovals(
    scope: Scope,
    attachment: NativeChatAttachment,
    observation: NativeChatObservation
  ): Promise<void> {
    if (!this.bridge.approvals || !this.bridge.answerApproval) return;
    const turn = observation.snapshot.current;
    if (turn?.disposition !== "suspended" || turn.paused || turn.cancelled) {
      scope.approvalBasis = undefined;
      if (this.view.approvals.length || this.view.approvalError)
        this.update({ approvals: [], approvalError: null });
      return;
    }
    if (scope.approvalBasis === observation.observationId) return;
    if (this.view.approvals.length) this.update({ approvals: [] });
    try {
      const approvals = await this.bridge.approvals(
        attachment.attachmentId,
        observation.observationId
      );
      if (!this.owns(scope)) return;
      scope.approvalBasis = observation.observationId;
      this.update({ approvals, approvalError: null });
    } catch {
      if (this.owns(scope))
        this.update({ approvalError: "Couldn't load the permission request." });
    }
  }

  private async refreshGoal(
    scope: Scope,
    attachment: NativeChatAttachment,
    observation: NativeChatObservation
  ): Promise<void> {
    if (!this.bridge.goal || !this.bridge.startGoal) return;
    const snapshot = observation.snapshot;
    if (scope.goalRevision === snapshot.sessionRevision) return;
    if (this.view.goalReady) this.update({ goalReady: false });
    scope.goalNeedsRefresh = false;
    try {
      const goal = await this.bridge.goal(
        attachment.attachmentId,
        observation.observationId
      );
      if (!this.owns(scope)) return;
      scope.goalRevision = snapshot.sessionRevision;
      if (scope.awaitingGoalId) {
        if (goal.goal?.goalId === scope.awaitingGoalId) {
          scope.awaitingGoalId = undefined;
        } else {
          const receipt = await this.bridge
            .inputReceipt(attachment.attachmentId, scope.awaitingGoalId)
            .catch(() => undefined);
          if (!this.owns(scope)) return;
          if (
            receipt &&
            receipt.disposition !== "queued" &&
            receipt.disposition !== "claimed"
          ) {
            scope.awaitingGoalId = undefined;
            this.update({
              error: "The accepted goal is no longer waiting to start.",
            });
          }
        }
      }
      this.update({
        goal,
        goalReady: true,
      });
    } catch (error) {
      if (!this.owns(scope)) return;
      scope.goalNeedsRefresh =
        error instanceof Error &&
        error.message.includes("native_chat_goal_changed");
      if (!scope.goalNeedsRefresh && this.view.goal?.goal)
        this.update({ error: "Couldn't refresh this goal." });
    }
  }

  private refreshQueue(scope: Scope, offset: number): Promise<void> {
    const observation = scope.observation;
    const attachment = scope.attachment;
    if (!this.owns(scope) || !attachment || !observation || !this.bridge.queue)
      return Promise.resolve();
    if (!observation.snapshot.queuedInputs) {
      scope.queueBasis = undefined;
      if (this.view.queue) this.update({ queue: null });
      return Promise.resolve();
    }
    if (scope.queueListing) return scope.queueListing;
    const revision = observation.snapshot.sessionRevision;
    if (
      scope.queueBasis?.revision === revision &&
      scope.queueBasis.offset === offset
    ) {
      scope.queueBasis.observationId = observation.observationId;
      return Promise.resolve();
    }
    this.update({ queueLoading: true });
    scope.queueListing = this.bridge
      .queue(attachment.attachmentId, observation.observationId, offset)
      .then((page) => {
        if (
          !this.owns(scope) ||
          scope.observation?.snapshot.sessionRevision !== revision
        )
          return;
        scope.queueBasis = {
          revision,
          offset: page.offset,
          observationId: observation.observationId,
        };
        this.update({ queue: page });
      })
      .catch((error: unknown) => {
        if (
          this.owns(scope) &&
          scope.observation?.snapshot.sessionRevision === revision &&
          !revisionChanged(error)
        )
          this.update({ error: "Couldn't read the queued messages." });
      })
      .finally(() => {
        scope.queueListing = undefined;
        if (!this.owns(scope)) return;
        this.update({ queueLoading: false });
        if (scope.observation?.snapshot.sessionRevision !== revision)
          void this.refreshQueue(scope, offset);
      });
    return scope.queueListing;
  }

  private async refreshQuestions(
    scope: Scope,
    attachment: NativeChatAttachment,
    observation: NativeChatObservation
  ): Promise<void> {
    if (!this.bridge.questions || !this.bridge.answerQuestion) return;
    const turn = observation.snapshot.current;
    if (!turn || turn.cancelled) {
      scope.questionBasis = undefined;
      if (
        this.view.questions.length ||
        this.view.questionReady ||
        this.view.questionError
      )
        this.update({
          questions: [],
          questionReady: false,
          questionError: null,
        });
      return;
    }
    if (scope.questionBasis === observation.observationId) return;
    if (this.view.questionReady) this.update({ questionReady: false });
    try {
      const questions = await this.bridge.questions(
        attachment.attachmentId,
        observation.observationId
      );
      if (!this.owns(scope)) return;
      scope.questionBasis = observation.observationId;
      this.update({ questions, questionReady: true, questionError: null });
    } catch (error) {
      if (
        this.owns(scope) &&
        this.view.questions.length > 0 &&
        !(
          error instanceof Error &&
          error.message.includes("native_chat_question_changed")
        )
      )
        this.update({ questionError: "Couldn't load the pending question." });
    }
  }

  private receive(scope: Scope, update: NativeChatUpdate): void {
    if (update.kind === "closed" && update.reason === "session_deleted") {
      this.forgetDeletedChat(scope);
      return;
    }
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
    } catch (error) {
      if (this.owns(scope) && deletedAttachment(error))
        this.forgetDeletedChat(scope);
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

  private sessionChoices(entry = this.view.catalogEntry): readonly string[] {
    const catalog = this.catalog?.sessionIds ?? [];
    if (this.canOrganizeChats) {
      return entry && entry.archived !== this.view.catalogArchived
        ? catalog.filter((id) => id !== entry.sessionId)
        : catalog;
    }
    return [...new Set([...this.recents, ...catalog])];
  }

  private forgetDeletedChat(scope: Scope): void {
    const session = scope.attachment?.sessionId ?? scope.requested;
    if (!session) return;
    const selected = this.owns(scope);
    if (
      !selected &&
      !this.recents.includes(session) &&
      !this.catalog?.sessionIds.includes(session)
    )
      return;
    this.recents = this.recents.filter((id) => id !== session);
    if (this.catalog) {
      this.catalog = {
        ...this.catalog,
        sessionIds: this.catalog.sessionIds.filter((id) => id !== session),
        titles: this.catalog.titles?.filter(
          (entry) => entry.sessionId !== session
        ),
      };
    }
    if (selected) void this.select(null);
    this.update({ sessions: this.sessionChoices() });
    this.save();
    void this.listChats();
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

function deletedAttachment(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("native_chat_session_deleted")
  );
}

function deletionError(reason: string): string {
  if (reason.includes("deletion_unverified"))
    return "Couldn't confirm deletion. Try Delete chat again to check the same request.";
  if (reason.includes("has_side_chat"))
    return "Close the side chat before deleting this chat.";
  if (reason.includes("has_subagents"))
    return "This chat has named subagents and can't be deleted.";
  if (reason.includes("has_retained_inputs"))
    return "This chat has retained inputs and can't be deleted.";
  if (reason.includes("session_goal_exists"))
    return "Finish or clear the Goal before deleting this chat.";
  if (reason.includes("work_unresolved"))
    return "This chat has unresolved work and can't be deleted.";
  if (
    reason.includes("requires_idle") ||
    reason.includes("requires_empty_queue")
  )
    return "This chat still has running, paused, or queued work.";
  if (
    reason.includes("revision_changed") ||
    reason.includes("stale_session_revision")
  )
    return "This chat changed. Review it before deleting.";
  return "Couldn't delete this chat. Try again.";
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
  if (!(error instanceof Error)) return fallback;
  if (error.message.includes("native_chat_transcript_too_large"))
    return "This chat is too large to restore in the workspace pane.";
  if (error.message.includes("native_chat_pending_regime_changed"))
    return "Retry this draft in its original mode, or edit it to send a new message.";
  if (error.message.includes("image_size_limit"))
    return "Choose a PNG of at most 256 KiB within the supported image dimensions.";
  if (error.message.includes("invalid_png_image"))
    return "Choose a valid PNG image.";
  if (error.message.includes("image_input_unavailable"))
    return "This chat's current provider does not accept PNG inputs.";
  if (error.message.includes("native_agent_frame_limit"))
    return "This message exceeds the connection limit. Shorten it and try again.";
  if (error.message.includes("native_context_limit_review_declined"))
    return "Settings review cancelled.";
  if (error.message.includes("native_context_limit_pending_review_changed"))
    return "Retry with the original settings permission, or edit the message to send a new one.";
  if (error.message.includes("native_context_limit_unavailable"))
    return "This workspace cannot apply a hard context input limit with the selected provider.";
  return fallback;
}

function revisionChanged(error: unknown): boolean {
  return (
    error instanceof Error &&
    /stale_session_revision|stale_journal_change|history_position_changed|driver_state_revision_changed|goal_revision_changed|native_chat_(observation_unavailable|queue_changed|goal_observation_unavailable)/.test(
      error.message
    )
  );
}

function goalRequestProblem(request: NativeChatGoalRequest): string | null {
  if (!request.objective.trim() || utf8.encode(request.objective).length > 8192)
    return "Enter a goal objective of at most 8 KiB.";
  if (
    !request.criteria.length ||
    request.criteria.length > 16 ||
    request.criteria.some(
      (line) => !line.trim() || utf8.encode(line).length > 1024
    )
  )
    return "Enter 1–16 success criteria, each at most 1 KiB.";
  if (
    [request.allowance.workTurns, request.allowance.inferenceSteps].some(
      (limit) => !Number.isSafeInteger(limit) || limit < 1 || limit > 0xffffffff
    )
  )
    return "Enter a positive whole number for each allowance.";
  return null;
}
