import type {
  NativeHookInspection,
  DesktopNativeChat,
  NativeChatArtifactSaveResult,
  NativeChatApproval,
  NativeChatApprovalDecision,
  NativeChatAttachment,
  NativeChatCatalogChange,
  NativeChatCatalogEntry,
  NativeChatCommand,
  NativeChatCommandResult,
  NativeChatControl,
  NativeChatGatewayAttemptRef,
  NativeChatGatewayChildRef,
  NativeChatGoalAction,
  NativeChatGoalChange,
  NativeChatGoalControl,
  NativeChatGoalObjective,
  NativeChatGoalObservation,
  NativeChatGoalRequest,
  NativeChatLibrarySelection,
  NativeChatLibrarySelectionAnswer,
  NativeChatActivityUpdate,
  NativeChatMessage,
  NativeChatObservation,
  NativeChatRevisionInput,
  NativeChatRevisionTarget,
  NativeChatOperatingRegime,
  NativeChatEffort,
  NativeChatPage,
  NativeChatProfileCatalog,
  NativeChatProfileSelection,
  NativeChatQuestion,
  NativeChatQuestionAnswer,
  NativeChatQueueAction,
  NativeChatQueueChange,
  NativeChatQueuePage,
  NativeChatSteer,
  NativeChatReadiness,
  NativeChatTextUpdate,
  NativeChatTranscriptPage,
  NativeChatTurnRecord,
  NativeChatTurnSummary,
  NativeChatUpdate,
  NativeChatWakeup,
  NativeChatWakeupAction,
  NativeContextLimit,
  NativeEditorSurfaceSnapshot,
  NativeEditorSvgText,
  NativeSubagentClient,
} from "@grida/desktop-bridge";
import { GoalSpending } from "./goal-spending";
import { isSupportedImageType } from "./image-attachment";
import { NativeSideChatController } from "./native-side-chat-controller";
import { NativeSubagentController } from "./native-subagent-controller";

export type NativeChatEditorSurfaces = {
  readEditorSurfaces(): NativeEditorSurfaceSnapshot;
  subscribeToEditorSurfaces(listener: () => void): () => void;
  open?(path: string, requireCurrent: () => boolean): Promise<void>;
  svgText?: {
    capture(): string | undefined;
    invoke(request: NativeEditorSvgText.Request): NativeEditorSvgText.Result;
  };
};

const POLL_MS = 500;
const RECENTS_LIMIT = 12;
const MAX_LIVE_ACTIVITY = 64;
const EMPTY_TURNS: readonly NativeChatTurnRecord[] = [];
const MAX_LIVE_BYTES = 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 256 * 1024;

type AttachmentKind = "png" | "file";
type BrowserAttachment = Pick<File, "name" | "size" | "arrayBuffer">;
type TransferredAttachment =
  | { kind: "file"; file: BrowserAttachment & Pick<File, "type"> }
  | { kind: "directory" };
type AttachmentSource =
  | { kind: "file"; file: BrowserAttachment }
  | {
      kind: "library";
      name: string;
      readPng: (maxBytes: number) => Promise<ArrayBuffer>;
    };
type SelectedAttachment = Readonly<{
  kind: AttachmentKind;
  name: string;
  bytes: ArrayBuffer;
}>;
const MAX_CONFIGURATION_MESSAGE_BYTES = 1024;
const utf8 = new TextEncoder();

const TERMINAL_OUTCOME: Record<NativeChatTurnSummary["status"], string> = {
  succeeded: "The turn finished.",
  failed: "The turn failed.",
  cancelled: "The turn was stopped.",
  uncertain: "The turn ended with unverified work.",
};

export type NativeChatView = Readonly<{
  scope: number;
  selected: string | null;
  sessions: readonly string[];
  catalogCursor: string | null;
  nextCatalogCursor: string | null;
  catalogLoading: boolean;
  catalogError: string | null;
  catalogArchived: boolean;
  profiles: NativeChatProfileCatalog | null;
  profileBusy: boolean;
  profileError: string | null;
  catalogEntry: NativeChatCatalogEntry | null;
  catalogEntryError: string | null;
  catalogChanging: boolean;
  commands: readonly NativeChatCommand[];
  commandRunning: NativeChatCommand | null;
  commandNotice: string | null;
  commandFork: string | null;
  revisionDraft: (NativeChatRevisionTarget & { unverified: boolean }) | null;
  revisionSubmitting: boolean;
  catalogDraft: Readonly<{
    text: string;
    basis: NativeChatCatalogEntry;
  }> | null;
  messages: readonly NativeChatMessage[];
  /** Recorded outcome and timing for turns in the displayed messages. */
  turnRecords: readonly NativeChatTurnRecord[];
  earlierMessages: boolean;
  canReadEarlier: boolean;
  readingEarlier: boolean;
  earlierError: string | null;
  sideChat: NativeSideChatController | null;
  subagents: NativeSubagentController | null;
  imageInput: boolean;
  fileInput: boolean;
  attachmentReading: boolean;
  attachmentNotice: string | null;
  attachmentDraft: Readonly<{
    kind: AttachmentKind;
    name: string;
    size: number;
    error?: string;
  }> | null;
  wakeupsAvailable: boolean;
  allowWakeup: boolean;
  scheduledWakeup: NativeChatWakeup | null;
  wakeupError: string | null;
  contextLimitOpen: boolean;
  contextLimit: NativeContextLimit | null;
  contextLimitDraft: string;
  contextLimitBusy: boolean;
  contextLimitError: string | null;
  hooksOpen: boolean;
  hooks: NativeHookInspection | null;
  hooksBusy: boolean;
  hooksError: string | null;
  reviewConfiguration: boolean;
  observation: NativeChatObservation | null;
  turnSummary: (NativeChatTurnSummary & { detailsUnavailable?: true }) | null;
  gatewayBillingRefresh:
    | (NativeChatGatewayAttemptRef & {
        status: "loading" | "unavailable";
      })
    | null;
  gatewayChildPage: Readonly<{
    status: "idle" | "loading" | "unavailable";
    hasPrevious: boolean;
  }>;
  approvals: readonly NativeChatApproval[];
  approvalError: string | null;
  questions: readonly NativeChatQuestion[];
  questionReady: boolean;
  questionError: string | null;
  librarySelection: NativeChatLibrarySelection | null;
  librarySelectionError: string | null;
  librarySelectionRetry: boolean;
  queue: NativeChatQueuePage | null;
  queueLoading: boolean;
  queueDraft: Readonly<{ inputId: string; text: string }> | null;
  steering: boolean;
  operatingRegime: NativeChatOperatingRegime;
  effort: NativeChatEffort;
  effortAvailable: boolean;
  goalEffortAvailable: boolean;
  goal: NativeChatGoalObservation | null;
  goalReady: boolean;
  goalIntent: boolean;
  loading: boolean;
  acting: boolean;
  repairing: boolean;
  error: string | null;
}>;

type Scope = {
  id: number;
  requested: string | null;
  attachment?: NativeChatAttachment;
  stopEditorSurfaceUpdates?: () => void;
  stopEditorSurfaceOpen?: () => void;
  stopEditorSvgText?: () => void;
  editorPresentationRevision?: number;
  sideChat?: NativeSideChatController;
  subagents?: NativeSubagentController;
  selectedAttachment?: SelectedAttachment;
  attachmentRead?: object;
  attachmentCapabilityRead?: object;
  wakeupRead?: { observationId: string };
  wakeupSettled?: string;
  pendingWakeupContinue?: NativeChatControl;
  opening?: Promise<void>;
  refreshing?: Promise<void>;
  timer?: ReturnType<typeof setTimeout>;
  durable: readonly NativeChatMessage[];
  recentWindow?: Pick<NativeChatTranscriptPage, "view" | "older" | "turns">;
  earlierWindow?: NativeChatTranscriptPage;
  earlierRead?: object;
  live: Map<string, NativeChatMessage & { turnId: string; bytes: number }>;
  gaps: Set<string>;
  observation: NativeChatObservation | null;
  summaryRequest?: {
    turnId: string;
    failed?: boolean;
    childAfter?: NativeChatGatewayChildRef;
  };
  approvalBasis?: string;
  questionBasis?: string;
  librarySelectionAvailable?: boolean;
  librarySelectionBasis?: string;
  pendingLibraryAnswer?: {
    selectionId: string;
    reviewId: string;
    answer: NativeChatLibrarySelectionAnswer;
  };
  queueBasis?: { revision: number; offset: number; observationId: string };
  queueListing?: Promise<void>;
  pendingQueueChange?: { key: string; change: NativeChatQueueChange };
  steeringTarget?: string;
  pendingSteering?: NativeChatSteer;
  goalRevision?: number;
  goalNeedsRefresh?: boolean;
  awaitingGoalId?: string;
  pendingGoalStart?: { key: string; inputId: string };
  pendingGoalControl?: {
    key: string;
    change: NativeChatGoalControl;
    manualGoalId?: string;
  };
  pendingCommand?: { command: NativeChatCommand; requestId: string };
  pendingRevision?: NativeChatRevisionInput;
  replay: boolean;
  pending?: {
    text: string;
    inputId: string;
    mode: "submit" | "enqueue";
    operatingRegime?: NativeChatOperatingRegime;
    effort?: NativeChatEffort;
    attachment?: SelectedAttachment;
    reviewConfiguration: boolean;
    allowWakeup: boolean;
    allowLibrarySelection: boolean;
    editorSvgTargetId?: string;
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
  profiles: null,
  profileBusy: false,
  profileError: null,
  catalogEntry: null,
  catalogEntryError: null,
  catalogChanging: false,
  commands: [],
  commandRunning: null,
  commandNotice: null,
  commandFork: null,
  revisionDraft: null,
  revisionSubmitting: false,
  catalogDraft: null,
  messages: [],
  turnRecords: [],
  earlierMessages: false,
  canReadEarlier: false,
  readingEarlier: false,
  earlierError: null,
  sideChat: null,
  subagents: null,
  imageInput: false,
  fileInput: false,
  attachmentReading: false,
  attachmentNotice: null,
  attachmentDraft: null,
  wakeupsAvailable: false,
  allowWakeup: false,
  scheduledWakeup: null,
  wakeupError: null,
  contextLimitOpen: false,
  contextLimit: null,
  contextLimitDraft: "",
  contextLimitBusy: false,
  contextLimitError: null,
  hooksOpen: false,
  hooks: null,
  hooksBusy: false,
  hooksError: null,
  reviewConfiguration: false,
  observation: null,
  turnSummary: null,
  gatewayBillingRefresh: null,
  gatewayChildPage: { status: "idle" as const, hasPrevious: false },
  approvals: [],
  approvalError: null,
  questions: [],
  questionReady: false,
  questionError: null,
  librarySelection: null,
  librarySelectionError: null,
  librarySelectionRetry: false,
  queue: null,
  queueLoading: false,
  queueDraft: null,
  steering: false,
  operatingRegime: "act",
  effort: "medium",
  effortAvailable: false,
  goalEffortAvailable: false,
  goal: null,
  goalReady: false,
  goalIntent: false,
  loading: false,
  acting: false,
  repairing: false,
  error: null,
});

/** Renderer-owned observation and text projection. Work stays in the native host. */
export class NativeChatController {
  static readonly goalComposerAllowance = Object.freeze({
    workTurns: 8,
    inferenceSteps: 64,
  });
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
  private profileId: string | null = null;
  private profileRead?: object;
  private profileSelection?: Promise<void>;
  private pendingFocus?: { sessionId: string; profileId?: string };

  constructor(
    private readonly bridge: DesktopNativeChat,
    private readonly memory?: Pick<Storage, "getItem" | "setItem">,
    private readonly memoryKey?: string,
    private readonly editorSurfaces?: NativeChatEditorSurfaces,
    private readonly libraryPicker = false
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
        if (state === "legacy") {
          publish(state);
          return;
        }
        let result: NativeChatReadiness = state;
        if (state === "native-starting" && bridge.status) {
          publish(state);
          if (!watching) return;
          result = await bridge.status(true);
        }
        if (!watching) return;
        switch (result) {
          case "native-ready":
          case "native-provider-key-required":
          case "native-provider-model-unavailable":
          case "native-provider-endpoint-https-required":
          case "native-provider-endpoint-approval-required":
          case "native-gateway-unavailable":
            publish(result);
            break;
          default:
            publish("native-unavailable");
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

  connect(
    initial: string | null,
    profileId?: string | null,
    startNewChat = false
  ): void {
    const saved = this.restore();
    this.pendingFocus = undefined;
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
      profileBusy: false,
      profileError: null,
    });
    void this.readProfiles();
    if (profileId !== null && profileId !== undefined) {
      if (initial) void this.focusChat(initial, profileId);
      else
        void this.selectProfile({
          kind: startNewChat ? "new" : "saved",
          id: profileId,
        });
      return;
    }
    void this.listChats();
    void this.select(initial ?? saved.selected);
  }

  disconnect(): void {
    const previous = this.scope;
    this.scope = undefined;
    this.catalogConnection = undefined;
    this.profileRead = undefined;
    this.pendingFocus = undefined;
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

  /** Inspect connection choices without starting the default provider or opening history. */
  connectForSelection(): void {
    if (this.scope || this.catalogConnection) return;
    this.catalogConnection = {};
    this.update({ profiles: null, profileBusy: false, profileError: null });
    void this.readProfiles();
  }

  /** Commit only an explicit connection choice; the full pane owns chat/history loading. */
  async selectConnection(
    selection: NativeChatProfileSelection
  ): Promise<boolean> {
    const connection = this.catalogConnection;
    if (
      this.scope ||
      !connection ||
      !this.bridge.selectProfile ||
      this.view.profileBusy
    )
      return false;
    this.update({ profileBusy: true, profileError: null });
    try {
      if (!(await this.commitProfile(selection, connection))) return false;
      return this.catalogConnection === connection;
    } catch {
      if (this.catalogConnection === connection)
        this.update({
          profileError:
            "This model connection is unavailable. Check its saved settings.",
        });
      return false;
    } finally {
      if (this.catalogConnection === connection)
        this.update({ profileBusy: false });
    }
  }

  async readProfiles(): Promise<void> {
    const connection = this.catalogConnection;
    if (!connection || !this.bridge.profiles) return;
    const request = {};
    this.profileRead = request;
    const owns = () =>
      this.catalogConnection === connection && this.profileRead === request;
    try {
      const profiles = await this.bridge.profiles();
      if (owns()) this.update({ profiles, profileError: null });
    } catch {
      if (owns())
        this.update({ profileError: "Couldn't load model connections." });
    }
  }

  private async commitProfile(
    selection: NativeChatProfileSelection,
    connection: object
  ): Promise<boolean> {
    // A disconnected pane can still own an outstanding host selection.
    await this.profileSelection?.catch(() => {});
    if (this.catalogConnection !== connection) return false;
    const pending = this.bridge.selectProfile!(selection);
    this.profileSelection = pending;
    try {
      await pending;
      return this.catalogConnection === connection;
    } finally {
      if (this.profileSelection === pending) this.profileSelection = undefined;
    }
  }

  async focusChat(sessionId: string, profileId?: string): Promise<void> {
    if (!this.catalogConnection) return;
    if (profileId !== undefined && !/^[a-f0-9]{64}$/.test(profileId)) {
      this.update({ profileError: "This model connection is unavailable." });
      return;
    }
    const request = { sessionId, profileId };
    this.pendingFocus = request;
    await this.applyFocus(request);
  }

  private focusBlocked(): boolean {
    return (
      this.view.profileBusy ||
      this.view.acting ||
      !!this.view.attachmentDraft ||
      this.view.attachmentReading
    );
  }

  private async applyFocus(request: {
    sessionId: string;
    profileId?: string;
  }): Promise<void> {
    if (this.pendingFocus !== request || this.focusBlocked()) return;
    this.pendingFocus = undefined;
    const active = this.view.profiles?.active ?? this.profileId;
    if ((request.profileId ?? null) !== active) {
      await this.selectProfile(
        request.profileId
          ? { kind: "saved", id: request.profileId }
          : { kind: "default" },
        request.sessionId
      );
      return;
    }
    await this.select(request.sessionId);
  }

  async selectProfile(
    selection: NativeChatProfileSelection,
    initialSession?: string
  ): Promise<void> {
    const connection = this.catalogConnection;
    if (
      !connection ||
      !this.bridge.selectProfile ||
      this.view.profileBusy ||
      this.view.acting
    )
      return;
    this.profileRead = undefined;
    if (this.scope?.observation?.snapshot.current) {
      this.update({
        profileError:
          "Finish or stop the current turn before changing the model.",
      });
      return;
    }
    if (this.view.attachmentDraft || this.view.attachmentReading) {
      this.update({
        profileError:
          "Send or remove the attachment before changing the model connection.",
      });
      return;
    }
    this.update({ profileBusy: true, profileError: null });
    try {
      if (!(await this.commitProfile(selection, connection))) return;
      if (this.catalogConnection !== connection) return;
      this.profileId = selection.kind === "default" ? null : selection.id;
      this.catalogConnection = {};
      this.catalog = null;
      const saved = this.restore();
      this.recents = saved.sessions;
      this.update({
        ...(this.view.profiles && {
          profiles: { ...this.view.profiles, active: this.profileId },
        }),
        sessions: this.sessionChoices(),
        catalogCursor: null,
        nextCatalogCursor: null,
        catalogLoading: false,
        catalogError: null,
        catalogArchived: false,
        profileBusy: false,
      });
      void this.listChats();
      void this.readProfiles();
      // The open chat continues with the selected model on its next turn.
      const continuing = initialSession ?? this.view.selected;
      await this.select(continuing ?? saved.selected, {
        reattach: !!continuing,
      });
    } catch {
      if (this.catalogConnection === connection)
        this.update({
          profileError:
            "This model connection is unavailable. Check its saved settings.",
        });
    } finally {
      if (this.catalogConnection === connection)
        this.update({ profileBusy: false });
    }
  }

  async select(
    sessionId: string | null,
    { reattach = false }: { reattach?: boolean } = {}
  ): Promise<void> {
    const retained =
      reattach && sessionId !== null && this.view.selected === sessionId
        ? { messages: this.view.messages, turnRecords: this.view.turnRecords }
        : undefined;
    if (
      !reattach &&
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
      operatingRegime: "act",
      goalIntent: false,
      catalogEntry: null,
      catalogEntryError: null,
      catalogChanging: false,
      commands: [],
      commandRunning: null,
      commandNotice: null,
      commandFork: null,
      revisionDraft: null,
      revisionSubmitting: false,
      catalogDraft: null,
      messages: retained?.messages ?? [],
      turnRecords: retained?.turnRecords ?? [],
      earlierMessages: false,
      canReadEarlier: false,
      readingEarlier: false,
      earlierError: null,
      sideChat: null,
      subagents: null,
      imageInput: false,
      fileInput: false,
      attachmentReading: false,
      attachmentNotice: null,
      attachmentDraft: null,
      wakeupsAvailable: false,
      allowWakeup: false,
      scheduledWakeup: null,
      wakeupError: null,
      contextLimitOpen: false,
      contextLimit: null,
      contextLimitDraft: "",
      contextLimitBusy: false,
      contextLimitError: null,
      hooksOpen: false,
      hooks: null,
      hooksBusy: false,
      hooksError: null,
      reviewConfiguration: false,
      observation: null,
      turnSummary: null,
      gatewayBillingRefresh: null,
      gatewayChildPage: { status: "idle", hasPrevious: false },
      approvals: [],
      approvalError: null,
      questions: [],
      questionReady: false,
      questionError: null,
      librarySelection: null,
      librarySelectionError: null,
      librarySelectionRetry: false,
      queue: null,
      queueLoading: false,
      queueDraft: null,
      steering: false,
      effort: "medium",
      effortAvailable: false,
      goalEffortAvailable: false,
      goal: null,
      goalReady: false,
      loading: sessionId !== null,
      acting: false,
      repairing: false,
      error: null,
    });
    void this.readEffortCapability(scope);
    void this.readWakeupCapability(scope);
    if (sessionId === null) {
      void this.readInputCapabilities(scope);
      this.save();
      return;
    }
    try {
      await this.open(scope);
      await this.readInputCapabilities(scope);
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
      !this.view.profileBusy &&
      !this.view.acting &&
      !this.view.commandRunning &&
      !this.view.revisionDraft &&
      !this.view.revisionSubmitting &&
      !this.view.attachmentReading &&
      !this.view.attachmentDraft?.error &&
      (!this.scope.selectedAttachment ||
        this.acceptsAttachment(this.scope.selectedAttachment.kind) ||
        this.scope.pending?.attachment === this.scope.selectedAttachment) &&
      (this.view.steering
        ? this.canSteer &&
          this.scope.steeringTarget ===
            this.view.observation?.snapshot.current?.turnId
        : (this.view.goalIntent && !!this.scope.pendingGoalStart) ||
          !this.needsQueue ||
          !!this.bridge.enqueue ||
          !!this.scope.pending?.allowLibrarySelection ||
          (this.view.allowWakeup && !!this.scope.pending?.allowWakeup))
    );
  }

  canAttach(kind: AttachmentKind): boolean {
    return (
      !!this.scope &&
      this.acceptsAttachment(kind) &&
      !this.view.loading &&
      !this.view.profileBusy &&
      !this.view.acting &&
      !this.view.steering &&
      !this.view.goalIntent &&
      !this.view.reviewConfiguration &&
      !this.view.allowWakeup
    );
  }

  private acceptsAttachment(kind: AttachmentKind): boolean {
    return kind === "png" ? this.view.imageInput : this.view.fileInput;
  }

  async pickTransferredAttachment(
    scopeId: number,
    resources: readonly TransferredAttachment[]
  ): Promise<void> {
    if (this.scope?.id !== scopeId || resources.length === 0) return;
    if (resources.length !== 1) {
      this.update({ attachmentNotice: "Attach one file at a time." });
      return;
    }
    const resource = resources[0];
    if (resource.kind === "directory") {
      this.update({ attachmentNotice: "Choose a file instead of a folder." });
      return;
    }
    const { file } = resource;
    const png =
      file.type === "image/png" || (!file.type && /\.png$/i.test(file.name));
    if (!png && isSupportedImageType(file.type)) {
      this.update({
        attachmentNotice: "Use a PNG to send an image to this chat.",
      });
      return;
    }
    const kind = png ? "png" : "file";
    if (!this.canAttach(kind)) {
      this.update({
        attachmentNotice: this.view.goalIntent
          ? "Use workspace file references for a goal, or remove the goal intent to attach this file."
          : this.view.loading || this.acceptsAttachment(kind)
            ? "Wait until the chat is ready to attach a file."
            : kind === "png"
              ? "This connection cannot use a PNG attachment."
              : "This chat cannot inspect a file attachment.",
      });
      return;
    }
    await this.pickAttachment(scopeId, kind, file);
  }

  pickAttachment(
    scopeId: number,
    kind: AttachmentKind,
    file: BrowserAttachment
  ): Promise<void> {
    return this.readAttachment(scopeId, kind, { kind: "file", file });
  }

  pickLibraryImage(
    scopeId: number,
    name: string,
    readPng: (maxBytes: number) => Promise<ArrayBuffer>
  ): Promise<void> {
    return this.readAttachment(scopeId, "png", {
      kind: "library",
      name,
      readPng,
    });
  }

  private async readAttachment(
    scopeId: number,
    kind: AttachmentKind,
    source: AttachmentSource
  ): Promise<void> {
    const scope = this.scope;
    if (!scope || scope.id !== scopeId || !this.canAttach(kind)) return;
    const read = {};
    scope.attachmentRead = read;
    const name = (
      source.kind === "file" ? source.file.name : source.name
    ).slice(0, 256);
    this.update({
      attachmentReading: true,
      attachmentNotice: null,
      error: null,
    });
    const ownsRead = () => this.owns(scope) && scope.attachmentRead === read;
    try {
      let bytes: ArrayBuffer;
      if (source.kind === "file") {
        const { file } = source;
        if (
          file.size > MAX_ATTACHMENT_BYTES ||
          (kind === "png" && file.size <= 0)
        )
          throw new Error(
            kind === "png" ? "image_size_limit" : "file_size_limit"
          );
        bytes = await file.arrayBuffer();
        if (bytes.byteLength !== file.size)
          throw new Error(
            kind === "png" ? "invalid_png_image" : "invalid_file_attachment"
          );
      } else {
        bytes = await source.readPng(MAX_ATTACHMENT_BYTES);
        if (bytes.byteLength <= 0 || bytes.byteLength > MAX_ATTACHMENT_BYTES)
          throw new Error("image_size_limit");
      }
      if (!ownsRead()) return;
      const original = scope.selectedAttachment ?? scope.pending?.attachment;
      const previous = original && new Uint8Array(original.bytes);
      if (
        original?.kind !== kind ||
        (kind === "file" && original.name !== name) ||
        previous?.byteLength !== bytes.byteLength ||
        !new Uint8Array(bytes).every((byte, index) => byte === previous[index])
      ) {
        scope.selectedAttachment = { kind, name, bytes };
        if (scope.pending?.attachment) scope.pending = undefined;
      } else scope.selectedAttachment = original;
      this.update({ attachmentDraft: { kind, name, size: bytes.byteLength } });
    } catch (error) {
      if (ownsRead()) {
        if (source.kind === "library") {
          this.update({
            attachmentNotice:
              "Couldn't add this Library image. Your current draft is still here.",
          });
          return;
        }
        scope.selectedAttachment = undefined;
        this.update({
          attachmentDraft: {
            kind,
            name,
            size: source.file.size,
            error: describe(
              error,
              kind === "png"
                ? "Couldn't read the selected PNG."
                : "Couldn't read the selected file."
            ),
          },
        });
      }
    } finally {
      if (ownsRead()) {
        scope.attachmentRead = undefined;
        this.update({ attachmentReading: false });
      }
    }
  }

  removeAttachment(scopeId: number): void {
    const scope = this.scope;
    if (!scope || scope.id !== scopeId || this.view.acting) return;
    scope.attachmentRead = undefined;
    scope.selectedAttachment = undefined;
    if (scope.pending?.attachment) scope.pending = undefined;
    this.update({
      attachmentDraft: null,
      attachmentReading: false,
      attachmentNotice: null,
      error: null,
    });
  }

  private async readInputCapabilities(
    scope: Scope
  ): Promise<{ png: boolean; file: boolean } | null> {
    const attachment = scope.attachment;
    const read = {};
    scope.attachmentCapabilityRead = read;
    const [png, file, library] = await Promise.all([
      this.bridge.submitImage && this.bridge.acceptsPng?.().catch(() => false),
      this.bridge.submitFile && this.bridge.acceptsFile?.().catch(() => false),
      this.libraryPicker &&
        this.bridge.submitWithLibrarySelection &&
        this.bridge.librarySelections &&
        this.bridge.answerLibrarySelection &&
        this.bridge.acceptsLibrarySelection?.().catch(() => false),
    ]);
    if (
      !this.owns(scope) ||
      scope.attachment !== attachment ||
      scope.attachmentCapabilityRead !== read
    )
      return null;
    scope.librarySelectionAvailable = library === true;
    this.update({ imageInput: png === true, fileInput: file === true });
    return { png: png === true, file: file === true };
  }

  /** The running connection confirms Ultra, or the chosen model offers it. */
  private ultraOffered(): boolean {
    const profiles = this.view.profiles;
    const active = profiles?.active;
    return (
      this.view.effortAvailable ||
      (!!active &&
        !!(
          profiles?.choices.find((choice) => choice.id === active) ??
          profiles?.saved.find((choice) => choice.id === active)
        )?.ultra)
    );
  }

  private async readEffortCapability(scope: Scope): Promise<void> {
    const [supported, goalSupported] = await Promise.all([
      this.bridge.submitInRegime &&
        this.bridge.acceptsEffort?.().catch(() => false),
      this.bridge.startGoal &&
        this.bridge.acceptsGoalEffort?.().catch(() => false),
    ]);
    if (!this.owns(scope)) return;
    this.update({
      effortAvailable: supported === true,
      goalEffortAvailable: goalSupported === true,
      ...(supported !== true &&
        this.view.effort === "ultra" && {
          effort: "xhigh",
          error: "Ultra effort is unavailable on this connection.",
        }),
    });
  }

  private async readWakeupCapability(scope: Scope): Promise<void> {
    if (
      !this.bridge.acceptsWakeups ||
      !this.bridge.submitWithWakeup ||
      !this.bridge.scheduledWakeup ||
      !this.bridge.controlWakeup
    )
      return;
    const supported = await this.bridge.acceptsWakeups().catch(() => false);
    if (!this.owns(scope)) return;
    this.update({ wakeupsAvailable: supported });
    if (supported && scope.attachment && scope.observation)
      this.refreshWakeup(scope, scope.attachment, scope.observation);
  }

  get canAllowWakeup(): boolean {
    return (
      !!this.scope &&
      this.view.wakeupsAvailable &&
      this.view.operatingRegime === "act" &&
      !this.view.loading &&
      !this.view.acting &&
      !this.view.commandRunning &&
      !this.view.steering &&
      !this.view.reviewConfiguration &&
      !this.view.attachmentDraft &&
      !this.scope.attachmentRead &&
      (!this.needsQueue || this.scope.pending?.allowWakeup === true)
    );
  }

  setAllowWakeup(requested: boolean): void {
    if (!this.view.acting && (!requested || this.canAllowWakeup))
      this.update({ allowWakeup: requested, error: null });
  }

  get hasContextLimit(): boolean {
    return !!this.bridge.contextLimit && !!this.bridge.saveContextLimit;
  }

  get hasHooks(): boolean {
    return (
      !!this.bridge.inspectHooks &&
      !!this.bridge.importHook &&
      !!this.bridge.removeHook
    );
  }

  async toggleHooks(): Promise<void> {
    if (!this.hasHooks || this.view.hooksBusy) return;
    const hooksOpen = !this.view.hooksOpen;
    this.update({ hooksOpen });
    if (hooksOpen) await this.refreshHooks();
  }

  async refreshHooks(): Promise<void> {
    const scope = this.scope;
    if (!scope || !this.bridge.inspectHooks || this.view.hooksBusy) return;
    this.update({ hooksBusy: true, hooksError: null });
    try {
      const hooks = await this.bridge.inspectHooks(
        scope.attachment?.attachmentId
      );
      if (this.owns(scope)) this.update({ hooks });
    } catch {
      if (this.owns(scope))
        this.update({ hooksError: "Couldn't inspect lifecycle checks." });
    } finally {
      if (this.owns(scope)) this.update({ hooksBusy: false });
    }
  }

  async importHook(): Promise<void> {
    if (!this.bridge.importHook) return;
    await this.changeHooks(() => this.bridge.importHook!());
  }

  async removeHook(id: string, revision: string): Promise<void> {
    if (
      !this.bridge.removeHook ||
      !this.view.hooks?.saved.some(
        (hook) => hook.id === id && hook.revision === revision
      )
    )
      return;
    await this.changeHooks(() => this.bridge.removeHook!(id, revision));
  }

  private async changeHooks(
    change: () => Promise<NativeHookInspection | null>
  ): Promise<void> {
    const scope = this.scope;
    if (!scope || this.view.hooksBusy) return;
    this.update({ hooksBusy: true, hooksError: null });
    try {
      const hooks = await change();
      if (this.owns(scope) && hooks) this.update({ hooks });
    } catch {
      if (this.owns(scope))
        this.update({
          hooksError:
            "Couldn't save the lifecycle check. Review its definition and try again.",
        });
    } finally {
      if (this.owns(scope)) this.update({ hooksBusy: false });
    }
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
      !this.view.allowWakeup &&
      !this.view.attachmentDraft &&
      !this.scope.attachmentRead
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
    const firstInput =
      this.view.selected === sessionId
        ? this.view.messages.find((message) => message.role === "user")?.text
        : undefined;
    return (
      title ??
      (firstInput?.trim().split("\n")[0].slice(0, 64) || "Untitled chat")
    );
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
        reason.includes("session_deletion_dependencies_changed") ||
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

  async readTurnArtifact(turnId: string, artifactId: string): Promise<Blob> {
    const read = this.bridge.readArtifact;
    if (!read) throw new Error("native_chat_artifact_unavailable");
    const { attachment, observation, artifact, requireCurrent } =
      this.captureTurnArtifact(turnId, artifactId);
    const bytes = await read.call(
      this.bridge,
      attachment.attachmentId,
      observation.observationId,
      artifactId
    );
    requireCurrent();
    if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== artifact.bytes)
      throw new Error("native_chat_artifact_unavailable");
    return new Blob([bytes], { type: artifact.mimeType });
  }

  get canSaveTurnArtifact(): boolean {
    return typeof this.bridge.saveArtifact === "function";
  }

  async saveTurnArtifact(
    turnId: string,
    artifactId: string
  ): Promise<NativeChatArtifactSaveResult> {
    const save = this.bridge.saveArtifact;
    if (!save) throw new Error("native_chat_artifact_unavailable");
    const { attachment, observation, requireCurrent } =
      this.captureTurnArtifact(turnId, artifactId);
    const result = await save.call(
      this.bridge,
      attachment.attachmentId,
      observation.observationId,
      artifactId
    );
    requireCurrent();
    if (result !== "saved" && result !== "cancelled" && result !== "failed")
      throw new Error("native_chat_artifact_unavailable");
    return result;
  }

  private captureTurnArtifact(turnId: string, artifactId: string) {
    const scope = this.scope;
    const attachment = scope?.attachment;
    const observation = scope?.observation;
    const summary = this.view.turnSummary;
    const artifact = summary?.artifacts?.find((item) => item.id === artifactId);
    if (
      !scope ||
      !attachment ||
      !observation ||
      !artifact ||
      summary?.turnId !== turnId ||
      observation.snapshot.current ||
      observation.snapshot.latest?.turnId !== turnId
    )
      throw new Error("native_chat_artifact_unavailable");
    const requireCurrent = () => {
      if (
        !this.owns(scope) ||
        scope.observation?.snapshot.current ||
        scope.observation?.snapshot.latest?.turnId !== turnId
      )
        throw new Error("native_chat_artifact_unavailable");
    };
    return { attachment, observation, artifact, requireCurrent };
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
      !this.view.attachmentDraft &&
      !this.scope?.attachmentRead &&
      !this.view.reviewConfiguration &&
      !this.view.allowWakeup &&
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
      (!!scope.pendingGoalStart ||
        (!snapshot?.current &&
          !snapshot?.queuedInputs &&
          !snapshot?.admissionPaused &&
          (!goal ||
            (!goal.reservation &&
              (goal.state.status === "complete" ||
                goal.state.status === "cleared")))))
    );
  }

  get showsManualGoalContinuation(): boolean {
    const goal = this.view.goal?.goal;
    const snapshot = this.scope?.observation?.snapshot;
    return (
      goal?.automatic === false &&
      snapshot?.goalManualContinuationAvailable === true &&
      !snapshot.current &&
      !goal.reservation &&
      (goal.state.status === "active" || goal.state.status === "blocked")
    );
  }

  get canRetryManualGoalConfirmation(): boolean {
    const goal = this.view.goal?.goal;
    return (
      !!goal &&
      (goal.continuationPending === true || this.showsManualGoalContinuation) &&
      this.scope?.observation?.snapshot.goalManualContinuationAvailable ===
        true &&
      this.scope?.pendingGoalControl?.manualGoalId === goal.goalId
    );
  }

  canControlGoal(action: NativeChatGoalChange["action"]): boolean {
    const goal = this.view.goal?.goal;
    const snapshot = this.scope?.observation?.snapshot;
    const current = snapshot?.current;
    if (
      !this.bridge.controlGoal ||
      !this.view.goalReady ||
      this.view.acting ||
      !goal
    )
      return false;
    if (
      action === "resume" &&
      goal.continuationPending &&
      this.canRetryManualGoalConfirmation
    )
      return true;
    if (current && current.turnId !== goal.reservation?.turnId) return false;
    const funded = !!goal.reservation?.reviewInferenceSteps;
    if (action === "reconcile_review")
      return (
        this.view.goalEffortAvailable &&
        !current &&
        funded &&
        !!goal.reservation?.uncertain
      );
    if (goal.state.status === "cleared" || (current && funded)) return false;
    if (action === "clear") return true;
    if (action === "revise")
      return (
        this.view.goal?.goalRevision !== undefined &&
        goal.state.status !== "complete"
      );
    if (action === "confirm_completion")
      return (
        !current &&
        !goal.reservation &&
        !goal.paused &&
        goal.review?.status === "pending"
      );
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
      goal.reservation?.uncertain ||
      (goal.review?.status === "pending" &&
        (!goal.remaining.workTurns || !goal.remaining.inferenceSteps))
    )
      return false;
    if (current)
      return (
        goal.paused &&
        current.paused &&
        !current.cancelled &&
        current.disposition === "suspended"
      );
    if (goal.automatic)
      return (
        !goal.reservation && (goal.paused || goal.state.status === "blocked")
      );
    return (
      this.showsManualGoalContinuation &&
      !goal.continuationPending &&
      goal.remaining.workTurns > 0 &&
      goal.remaining.inferenceSteps > 0
    );
  }

  async startGoal(
    request: Omit<NativeChatGoalRequest, "operatingRegime">,
    maximumUsd?: string
  ): Promise<boolean> {
    const scope = this.scope;
    if (!scope || !this.canStartGoal || !this.bridge.startGoal) return false;
    try {
      const maxCostMills =
        maximumUsd === undefined
          ? request.maxCostMills
          : GoalSpending.fromUsd(maximumUsd);
      const { maxCostMills: _previousMaximum, ...rest } = request;
      request = {
        ...rest,
        ...(maxCostMills !== undefined ? { maxCostMills } : {}),
      };
      if (
        maxCostMills !== undefined &&
        (!GoalSpending.validMills(maxCostMills, true) ||
          !this.view.observation?.snapshot.goalSpendingAvailable)
      )
        throw new Error("unavailable");
    } catch {
      this.update({
        error:
          "Enter a positive USD spending limit on a connection that supports enforced goal spending.",
      });
      return false;
    }
    const problem = goalRequestProblem(request, this.view);
    if (problem) {
      this.update({ error: problem });
      return false;
    }
    const payload: NativeChatGoalRequest = {
      ...request,
      operatingRegime: this.view.operatingRegime,
    };
    const key = JSON.stringify(payload);
    if (scope.pendingGoalStart && scope.pendingGoalStart.key !== key) {
      this.update({
        error:
          "Retry the original goal draft before starting a different goal.",
      });
      return false;
    }
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
        payload
      );
      if (
        receipt.disposition === "withdrawn" ||
        receipt.disposition === "superseded"
      ) {
        scope.pendingGoalStart = undefined;
        throw new Error("native_chat_goal_start_unavailable");
      }
      scope.pendingGoalStart = undefined;
      if (!this.owns(scope)) return false;
      scope.awaitingGoalId =
        this.view.goal?.goal?.goalId === receipt.inputId
          ? undefined
          : receipt.inputId;
      scope.replay = true;
      await this.refresh(scope);
      return true;
    } catch (error) {
      if (this.owns(scope)) {
        // These refusals precede admission; an unknown outcome must keep its identity.
        if (
          error instanceof Error &&
          /goal_child_allowance_unavailable|goal_named_child_unavailable/.test(
            error.message
          )
        )
          scope.pendingGoalStart = undefined;
        this.update({
          error:
            error instanceof Error &&
            error.message.includes("goal_child_allowance_unavailable")
              ? "Increase the inference allowance to fund an Ultra review, or choose Standard."
              : error instanceof Error &&
                  error.message.includes("goal_named_child_unavailable")
                ? "Choose an available named subagent from this chat."
                : "Couldn't confirm the goal start. Your draft is still here.",
        });
        await this.refresh(scope);
      }
      return false;
    } finally {
      if (this.owns(scope)) this.update({ acting: false });
    }
  }

  async controlGoal(action: NativeChatGoalAction): Promise<void> {
    await this.applyGoalControl({ action });
  }

  async reviseGoal(
    basis: { scope: number; goalId: string; goalRevision: number },
    objective: NativeChatGoalObjective
  ): Promise<boolean> {
    if (basis.scope !== this.view.scope) return false;
    const problem = goalObjectiveProblem(
      objective.description,
      objective.criteria
    );
    if (problem) {
      this.update({ error: problem });
      return false;
    }
    return this.applyGoalControl({ action: "revise", objective }, basis);
  }

  private async applyGoalControl(
    decision: NativeChatGoalChange,
    basis?: { goalId: string; goalRevision: number }
  ): Promise<boolean> {
    const scope = this.scope;
    const goal = this.view.goal;
    const observationId = goal?.observationId;
    const { action } = decision;
    if (
      !scope?.attachment ||
      !observationId ||
      !this.bridge.controlGoal ||
      !this.canControlGoal(action)
    )
      return false;
    const reviewTurn =
      action === "reconcile_review"
        ? goal.goal?.reservation?.turnId
        : action === "confirm_completion"
          ? goal.goal?.review?.turnId
          : undefined;
    const key = JSON.stringify([
      goal.goal?.goalId,
      decision,
      basis,
      reviewTurn,
    ]);
    const pending =
      scope.pendingGoalControl?.key === key
        ? scope.pendingGoalControl
        : undefined;
    if (action === "resume" && goal.goal?.continuationPending && !pending)
      return false;
    if (
      basis &&
      (goal.goal?.goalId !== basis.goalId ||
        (!pending && goal.goalRevision !== basis.goalRevision))
    ) {
      this.update({
        error:
          "The goal changed. Reopen the goal form to edit the current objective.",
      });
      return false;
    }
    const change = pending?.change ?? {
      ...decision,
      observationId,
      requestId: crypto.randomUUID(),
    };
    scope.pendingGoalControl = pending ?? {
      key,
      change,
      ...(action === "resume" &&
        this.showsManualGoalContinuation && {
          manualGoalId: goal.goal?.goalId,
        }),
    };
    this.update({ acting: true, error: null });
    try {
      await this.bridge.controlGoal(scope.attachment.attachmentId, change);
      scope.pendingGoalControl = undefined;
      return this.owns(scope);
    } catch (error) {
      if (revisionChanged(error)) scope.pendingGoalControl = undefined;
      if (this.owns(scope))
        this.update({
          error:
            error instanceof Error &&
            error.message.includes("goal_review_still_held")
              ? "The review's outcome is still unverified. Its allowance stays held."
              : "Couldn't confirm the goal control. Check the goal and try again.",
        });
      return false;
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
        ...(operatingRegime === "plan" && {
          reviewConfiguration: false,
          allowWakeup: false,
        }),
      });
  }

  selectGoalIntent(enabled: boolean): void {
    if (this.view.acting) return;
    if (!enabled && this.scope?.pendingGoalStart) return;
    if (enabled && this.view.attachmentDraft) {
      this.update({
        error: "Send or remove the attachment before starting a goal.",
      });
      return;
    }
    if (!enabled || this.canStartGoal)
      this.update({ goalIntent: enabled, error: null });
  }

  selectEffort(effort: NativeChatEffort): void {
    if (
      (effort !== "ultra" || this.ultraOffered()) &&
      !this.view.acting &&
      !this.view.steering
    )
      this.update({ effort });
  }

  async submit(text: string, scopeId = this.view.scope): Promise<void> {
    const scope = this.scope;
    if (!scope || scope.id !== scopeId || this.view.profileBusy)
      throw new Error("native_chat_not_ready");
    const intent = /^\/(plan|goal)(?:\s+|$)/.exec(text.trim());
    if (intent) {
      if (intent[1] === "plan") {
        if (!this.bridge.submitInRegime || this.view.steering)
          throw new Error("Planning is unavailable in this chat.");
        this.selectOperatingRegime("plan");
      } else {
        if (!this.view.goalIntent && !this.canStartGoal)
          throw new Error(
            "A goal cannot start while this chat has unfinished work."
          );
        this.selectGoalIntent(true);
        if (!this.view.goalIntent)
          throw new Error(this.view.error ?? "Goal entry is unavailable.");
      }
      text = text.trim().slice(intent[0].length).trim();
      if (!text) return;
    }
    const literal = text.trim();
    if (literal === "/compact" || literal === "/fork")
      return this.runCommand(literal === "/compact" ? "compact" : "fork");
    if (!this.canSubmit || !text.trim())
      throw new Error("native_chat_not_ready");
    if (this.view.goalIntent) {
      if (this.view.attachmentDraft || this.view.reviewConfiguration)
        throw new Error(
          "Remove the attachment or settings review before starting a goal."
        );
      if (utf8.encode(text.trim()).length > 1024) {
        const error =
          "Use a shorter goal, or customize its objective and success criteria.";
        this.update({ error });
        throw new Error(error);
      }
      const accepted = await this.startGoal({
        objective: text.trim(),
        criteria: [text.trim()],
        allowance: NativeChatController.goalComposerAllowance,
        automatic: true,
        ...(this.view.effort === "ultra" && { effort: "ultra" }),
        ...(this.view.allowWakeup && { allowWakeup: true }),
      });
      if (!accepted)
        throw new Error(this.view.error ?? "Couldn't start the goal.");
      if (this.owns(scope)) this.update({ goalIntent: false });
      return;
    }
    if (this.view.steering) return this.submitSteering(scope, text);
    const mode = this.needsQueue ? "enqueue" : "submit";
    const selectedAttachment = scope.selectedAttachment;
    const allowWakeup = this.view.allowWakeup;
    const reviewConfiguration = this.view.reviewConfiguration;
    const retained =
      scope.pending?.text === text &&
      scope.pending.attachment === selectedAttachment
        ? scope.pending
        : undefined;
    if (retained && retained.allowWakeup !== allowWakeup) {
      const error =
        "Retry with the original check-in permission, or edit the message to send a new one.";
      this.update({ error });
      throw new Error(error);
    }
    if (allowWakeup && !retained && (!this.canAllowWakeup || this.needsQueue)) {
      const error = "Allow a check-in when sending from an idle Act chat.";
      this.update({ error });
      throw new Error(error);
    }
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
      selectedAttachment ||
      reviewConfiguration ||
      allowWakeup ||
      this.bridge.submitInRegime
        ? this.view.operatingRegime
        : undefined;
    // Medium is the default stop and leaves the model's default in place.
    // Ultra also needs its extended harness.
    const effort =
      this.view.effort === "medium" ||
      (this.view.effort === "ultra" && !this.view.effortAvailable)
        ? undefined
        : this.view.effort;
    const svgTarget =
      !retained &&
      mode === "submit" &&
      operatingRegime === "act" &&
      !allowWakeup &&
      !reviewConfiguration &&
      !selectedAttachment &&
      this.bridge.onEditorSvgText
        ? this.editorSurfaces?.svgText?.capture()
        : undefined;
    this.update({ acting: true, error: null });
    try {
      await this.open(scope);
      const attachment = this.attachment(scope);
      if (retained && retained.operatingRegime !== operatingRegime)
        throw new Error("native_chat_pending_regime_changed");
      if (retained && retained.effort !== effort)
        throw new Error("native_chat_pending_effort_changed");
      if (retained && retained.reviewConfiguration !== reviewConfiguration)
        throw new Error("native_context_limit_pending_review_changed");
      if (
        !retained &&
        this.libraryPicker &&
        scope.librarySelectionAvailable === undefined &&
        mode === "submit" &&
        !allowWakeup &&
        !reviewConfiguration &&
        !selectedAttachment
      )
        await this.readInputCapabilities(scope);
      const pending: NonNullable<Scope["pending"]> = retained ?? {
        text,
        inputId: crypto.randomUUID(),
        mode,
        operatingRegime,
        effort,
        attachment: selectedAttachment,
        reviewConfiguration,
        allowWakeup,
        allowLibrarySelection:
          mode === "submit" &&
          scope.librarySelectionAvailable === true &&
          !allowWakeup &&
          !reviewConfiguration &&
          !selectedAttachment &&
          !(scope.stopEditorSvgText && svgTarget),
        editorSvgTargetId: scope.stopEditorSvgText ? svgTarget : undefined,
      };
      let accepted;
      try {
        if (pending.attachment) {
          const capabilities = await this.readInputCapabilities(scope);
          if (!capabilities?.[pending.attachment.kind])
            throw new Error(
              pending.attachment.kind === "png"
                ? "image_input_unavailable"
                : "file_attachment_unavailable"
            );
        }
        this.attachment(scope);
        scope.pending = pending;
        if (pending.allowWakeup) {
          if (!this.bridge.submitWithWakeup || !this.view.wakeupsAvailable)
            throw new Error("native_chat_wakeup_unavailable");
          accepted = await this.bridge.submitWithWakeup(
            attachment.attachmentId,
            pending.inputId,
            pending.text,
            ...(pending.effort ? [pending.effort] : [])
          );
        } else if (pending.reviewConfiguration) {
          if (!this.bridge.submitWithConfigurationReview)
            throw new Error("native_context_limit_unavailable");
          accepted = await this.bridge.submitWithConfigurationReview(
            attachment.attachmentId,
            {
              action: pending.mode,
              inputId: pending.inputId,
              text: pending.text,
              ...(pending.effort && { effort: pending.effort }),
            }
          );
        } else if (pending.attachment?.kind === "png") {
          if (!this.bridge.submitImage || !pending.operatingRegime)
            throw new Error("image_input_unavailable");
          accepted = await this.bridge.submitImage(attachment.attachmentId, {
            action: pending.mode,
            inputId: pending.inputId,
            text: pending.text,
            png: pending.attachment.bytes,
            operatingRegime: pending.operatingRegime,
            ...(pending.effort && { effort: pending.effort }),
          });
        } else if (pending.attachment) {
          if (!this.bridge.submitFile || !pending.operatingRegime)
            throw new Error("file_attachment_unavailable");
          accepted = await this.bridge.submitFile(attachment.attachmentId, {
            action: pending.mode,
            inputId: pending.inputId,
            text: pending.text,
            name: pending.attachment.name,
            bytes: pending.attachment.bytes,
            operatingRegime: pending.operatingRegime,
            ...(pending.effort && { effort: pending.effort }),
          });
        } else if (pending.allowLibrarySelection) {
          if (!this.bridge.submitWithLibrarySelection)
            throw new Error("native_chat_library_selection_unavailable");
          accepted = await this.bridge.submitWithLibrarySelection(
            attachment.attachmentId,
            pending.inputId,
            pending.text,
            pending.operatingRegime,
            pending.effort
          );
        } else if (pending.operatingRegime) {
          if (!this.bridge.submitInRegime)
            throw new Error("native_chat_operating_regime_unavailable");
          const options: [effort?: NativeChatEffort, svgTargetId?: string] =
            pending.editorSvgTargetId
              ? [pending.effort, pending.editorSvgTargetId]
              : pending.effort
                ? [pending.effort]
                : [];
          accepted = await this.bridge.submitInRegime(
            pending.mode,
            attachment.attachmentId,
            pending.inputId,
            pending.text,
            pending.operatingRegime,
            ...options
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
        if (
          scope.pending !== pending ||
          pending.reviewConfiguration ||
          pending.allowWakeup
        )
          throw error;
        // Recover an earlier receipt without authorizing an unsupported resend.
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
        if (pending.allowWakeup) this.update({ allowWakeup: false });
        if (
          pending.attachment &&
          scope.selectedAttachment === pending.attachment
        ) {
          scope.selectedAttachment = undefined;
          this.update({ attachmentDraft: null, attachmentNotice: null });
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
        if (
          selectedAttachment &&
          this.acceptsAttachment(selectedAttachment.kind) &&
          error instanceof Error &&
          /image_input_unavailable|file_attachment_unavailable/.test(
            error.message
          )
        )
          void this.readInputCapabilities(scope);
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

  async runCommand(command: NativeChatCommand): Promise<void> {
    const scope = this.scope;
    const attachment = scope?.attachment;
    if (
      !scope ||
      !attachment ||
      !this.bridge.runCommand ||
      !this.view.commands.includes(command)
    ) {
      this.update({
        error: "This command is unavailable for the selected chat.",
      });
      throw new Error("native_chat_command_unavailable");
    }
    if (this.view.commandRunning || this.view.acting)
      throw new Error("native_chat_command_in_progress");
    if (this.view.attachmentDraft || this.view.attachmentReading) {
      this.update({
        error: "Remove the pending attachment before using a chat command.",
      });
      throw new Error("native_chat_command_attachment_pending");
    }
    const retained = scope.pendingCommand;
    if (retained && retained.command !== command) {
      this.update({
        error: `Retry /${retained.command} to confirm its outcome.`,
      });
      throw new Error("native_chat_command_pending");
    }
    const snapshot = scope.observation?.snapshot;
    if (
      !retained &&
      command === "compact" &&
      (!snapshot ||
        snapshot.current ||
        snapshot.admissionPaused ||
        snapshot.queuedInputs)
    ) {
      this.update({
        error: "Compaction needs an idle chat with an open, empty queue.",
      });
      throw new Error("native_chat_compaction_requires_idle");
    }
    const pending = (scope.pendingCommand ??= {
      command,
      requestId: crypto.randomUUID(),
    });
    this.update({
      commandRunning: command,
      commandNotice: null,
      commandFork: null,
      error: null,
    });
    try {
      const receipt = this.bridge.runCommand(
        attachment.attachmentId,
        command,
        pending.requestId
      );
      if (command === "compact") void this.refresh(scope);
      const result = await receipt;
      if (!this.owns(scope)) return;
      if (result.command !== command)
        throw new Error("native_chat_command_unverified");
      scope.pendingCommand = undefined;
      if (result.command === "fork") {
        this.update({
          commandNotice: "Fork created.",
          commandFork: result.sessionId,
        });
        void this.listChats();
      } else {
        this.update({ commandNotice: COMPACTION_NOTICE[result.status] });
      }
    } catch (error) {
      if (this.owns(scope)) {
        const reason = error instanceof Error ? error.message : "";
        const uncertain = reason.includes("native_chat_command_unverified");
        if (
          !uncertain &&
          !(retained && reason.includes("native_chat_command_in_progress"))
        )
          scope.pendingCommand = undefined;
        this.update({ error: commandError(command, reason) });
      }
      throw error;
    } finally {
      if (this.owns(scope)) {
        this.update({ commandRunning: null });
        if (command === "compact") void this.refresh(scope);
      }
    }
  }

  get canReviseHistory(): boolean {
    const snapshot = this.scope?.observation?.snapshot;
    const goal = this.view.goal?.goal?.state.status;
    return (
      !!this.bridge.prepareRevision &&
      !!this.bridge.revise &&
      !!snapshot?.historyRevisionAvailable &&
      !snapshot.current &&
      snapshot.queuedInputs === 0 &&
      !snapshot.pendingGoalId &&
      goal !== "active" &&
      goal !== "blocked" &&
      !this.view.loading &&
      !this.view.repairing &&
      !this.view.acting &&
      !this.view.commandRunning &&
      !this.view.revisionSubmitting
    );
  }

  async prepareRevision(messageId: string): Promise<void> {
    const scope = this.scope;
    const observation = scope?.observation;
    if (
      !scope?.attachment ||
      !observation ||
      !this.bridge.prepareRevision ||
      !this.canReviseHistory ||
      this.view.revisionDraft ||
      !(scope.earlierWindow?.messages ?? scope.durable).some(
        (message) => message.messageId === messageId && message.role === "user"
      )
    )
      return;
    this.update({ revisionSubmitting: true, error: null });
    try {
      const target = await this.bridge.prepareRevision(
        scope.attachment.attachmentId,
        observation.observationId,
        messageId
      );
      if (!this.owns(scope)) return;
      if (
        target.messageId !== messageId ||
        scope.observation?.snapshot.sessionRevision !==
          observation.snapshot.sessionRevision
      )
        throw new Error("stale_session_revision");
      this.update({ revisionDraft: { ...target, unverified: false } });
    } catch (error) {
      if (this.owns(scope)) this.update({ error: revisionError(error) });
    } finally {
      if (this.owns(scope)) this.update({ revisionSubmitting: false });
    }
  }

  async showEarlierMessages(): Promise<void> {
    const scope = this.scope;
    const read = this.bridge.transcriptPage;
    if (!scope?.attachment || !read || this.view.readingEarlier) return;
    this.update({ readingEarlier: true, earlierError: null });
    try {
      await scope.refreshing;
      const attachment = this.attachment(scope);
      const previous = scope.earlierWindow ?? scope.recentWindow;
      if (!previous?.older) return;
      const token = {};
      scope.earlierRead = token;
      const page = await read.call(
        this.bridge,
        attachment.attachmentId,
        previous.older
      );
      if (!this.owns(scope) || scope.earlierRead !== token) return;
      if (page.view !== previous.view || page.older === previous.older)
        throw new Error("history_replay_window_changed");
      scope.earlierWindow = page;
      this.publishMessages(scope);
    } catch (error) {
      if (!this.owns(scope)) return;
      if (deletedAttachment(error)) this.forgetDeletedChat(scope);
      else {
        if (
          error instanceof Error &&
          error.message.includes("history_replay_window_changed")
        ) {
          scope.earlierWindow = undefined;
          scope.replay = true;
          this.publishMessages(scope);
        }
        this.update({
          earlierError: describe(
            error,
            "Couldn't load earlier messages. Try again."
          ),
        });
      }
    } finally {
      if (this.owns(scope)) {
        scope.earlierRead = undefined;
        this.update({ readingEarlier: false });
        if (scope.replay) void this.refresh(scope);
      }
    }
  }

  showLatestMessages(): void {
    const scope = this.scope;
    if (!scope || this.view.readingEarlier) return;
    scope.earlierWindow = undefined;
    this.update({ earlierError: null });
    this.publishMessages(scope);
  }

  changeRevisionText(text: string): void {
    const draft = this.view.revisionDraft;
    if (draft && !draft.unverified && !this.view.revisionSubmitting)
      this.update({ revisionDraft: { ...draft, text }, error: null });
  }

  cancelRevision(): void {
    if (!this.view.revisionDraft?.unverified && !this.view.revisionSubmitting)
      this.update({ revisionDraft: null, error: null });
  }

  async submitRevision(): Promise<void> {
    const scope = this.scope;
    const draft = this.view.revisionDraft;
    const attachment = scope?.attachment;
    if (
      !scope ||
      !attachment ||
      !draft ||
      !draft.text.trim() ||
      !this.bridge.revise ||
      this.view.revisionSubmitting
    )
      return;
    if (!scope.pendingRevision && !this.canReviseHistory) {
      this.update({ error: "Resolve the current work before resubmitting." });
      return;
    }
    if (draft.effort === "ultra" && !this.view.effortAvailable) {
      this.update({ error: "Ultra effort is unavailable on this connection." });
      return;
    }
    const effort =
      draft.effort === "ultra" && this.view.effortAvailable
        ? draft.effort
        : undefined;
    const input = (scope.pendingRevision ??= {
      reviewId: draft.reviewId,
      text: draft.text,
      operatingRegime: this.view.operatingRegime,
      ...(effort && { effort }),
    });
    this.update({ revisionSubmitting: true, error: null });
    try {
      const receipt = await this.bridge.revise(attachment.attachmentId, input);
      if (!this.owns(scope)) return;
      if (receipt.sessionId !== attachment.sessionId)
        throw new Error("native_chat_revision_unverified");
      scope.pendingRevision = undefined;
      this.update({ revisionDraft: null });
      // An observation already in flight may have started replaying the old view.
      void Promise.resolve(scope.refreshing).then(() => {
        if (!this.owns(scope)) return;
        scope.replay = true;
        void this.refresh(scope);
      });
    } catch (error) {
      if (!this.owns(scope)) return;
      const reason = error instanceof Error ? error.message : "";
      const unverified =
        reason.includes("native_chat_revision_unverified") ||
        reason.includes("native_chat_revision_in_progress") ||
        (draft.unverified && reason.includes("native_chat_effort_unavailable"));
      if (!unverified) scope.pendingRevision = undefined;
      this.update({
        revisionDraft: { ...draft, unverified },
        error: revisionError(error),
      });
      if (unverified) void this.refresh(scope);
    } finally {
      if (this.owns(scope)) this.update({ revisionSubmitting: false });
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

  get canResumeQueue(): boolean {
    const snapshot = this.view.observation?.snapshot;
    return (
      !!this.bridge.editQueue &&
      !!snapshot &&
      !snapshot.current &&
      (snapshot.admissionPaused || snapshot.idleQueueResumeAvailable === true)
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
    const turn = scope.observation.snapshot.current;
    const wakeup = this.view.scheduledWakeup;
    const cancelledWakeupId =
      action === "resume" &&
      turn.disposition === "suspended" &&
      !turn.paused &&
      !turn.cancelled &&
      wakeup?.turnId === turn.turnId &&
      wakeup.status === "cancelled"
        ? wakeup.waitId
        : undefined;
    const retained = scope.pendingWakeupContinue;
    const input: NativeChatControl =
      retained &&
      cancelledWakeupId === retained.cancelledWakeupId &&
      observationId === retained.observationId
        ? retained
        : {
            action,
            observationId,
            requestId: crypto.randomUUID(),
            ...(cancelledWakeupId !== undefined && { cancelledWakeupId }),
          };
    if (cancelledWakeupId !== undefined) scope.pendingWakeupContinue = input;
    this.update({ acting: true, error: null });
    try {
      await this.bridge.control(scope.attachment.attachmentId, input);
      if (cancelledWakeupId !== undefined)
        scope.pendingWakeupContinue = undefined;
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

  canControlWakeup(action: NativeChatWakeupAction): boolean {
    const turn = this.scope?.observation?.snapshot.current;
    const wakeup = this.view.scheduledWakeup;
    if (
      !this.view.wakeupsAvailable ||
      !this.bridge.controlWakeup ||
      this.view.acting ||
      !wakeup ||
      !turn ||
      turn.cancelled ||
      turn.turnId !== wakeup.turnId
    )
      return false;
    const pending = wakeup.status === "waiting" || wakeup.status === "paused";
    return action === "cancel"
      ? pending
      : !wakeup.armed &&
          turn.disposition === "suspended" &&
          (pending || wakeup.status === "delivered");
  }

  async controlWakeup(action: NativeChatWakeupAction): Promise<void> {
    const scope = this.scope;
    const attachment = scope?.attachment;
    const observation = scope?.observation;
    const wakeup = this.view.scheduledWakeup;
    const control = this.bridge.controlWakeup;
    if (
      !scope ||
      !attachment ||
      !observation ||
      !wakeup ||
      !control ||
      !this.canControlWakeup(action)
    )
      return;
    scope.wakeupRead = undefined;
    this.update({ acting: true, wakeupError: null });
    try {
      const updated = await control.call(
        this.bridge,
        attachment.attachmentId,
        observation.observationId,
        wakeup.waitId,
        action
      );
      const current = scope.observation?.snapshot;
      if (
        this.owns(scope) &&
        scope.attachment === attachment &&
        (current?.current ?? current?.latest)?.turnId === updated.turnId
      ) {
        scope.wakeupRead = undefined;
        scope.wakeupSettled = undefined;
        this.update({ scheduledWakeup: updated, wakeupError: null });
      }
    } catch {
      if (this.owns(scope))
        this.update({
          wakeupError:
            "Couldn't confirm the check-in change. Check its status and try again.",
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
    void this.readEffortCapability(scope);
    scope.wakeupSettled = undefined;
    void this.readWakeupCapability(scope);
    if (scope.summaryRequest?.failed) scope.summaryRequest = undefined;
    this.update({ error: null });
    try {
      await this.open(scope);
      await this.readInputCapabilities(scope);
      await this.refresh(scope);
    } catch (error) {
      if (this.owns(scope))
        this.update({ error: describe(error, "Couldn't open this chat.") });
    }
  }

  retryTurnSummary(): void {
    const scope = this.scope;
    if (
      !scope?.attachment ||
      !scope.observation ||
      !scope.summaryRequest?.failed
    )
      return;
    scope.summaryRequest = undefined;
    this.refreshTurnSummary(scope, scope.attachment, scope.observation);
  }

  async readGatewayChildBilling(
    turnId: string,
    destination: "first" | "next"
  ): Promise<void> {
    const scope = this.scope;
    const basis = scope?.summaryRequest;
    const attachment = scope?.attachment;
    const observation = scope?.observation;
    const summary = this.view.turnSummary;
    const children = summary?.gatewayBilling?.children;
    const after = destination === "next" ? children?.nextAfter : undefined;
    if (
      !scope ||
      !attachment ||
      !observation ||
      !this.bridge.turnSummary ||
      basis?.turnId !== turnId ||
      summary?.turnId !== turnId ||
      !children ||
      (destination === "next" && !after) ||
      this.view.gatewayChildPage.status === "loading" ||
      this.view.gatewayBillingRefresh?.status === "loading"
    )
      return;
    const ownsRequest = () =>
      this.owns(scope) &&
      scope.attachment === attachment &&
      scope.summaryRequest === basis &&
      this.view.turnSummary?.turnId === turnId;
    this.update({
      gatewayChildPage: { ...this.view.gatewayChildPage, status: "loading" },
    });
    try {
      const updated = await this.bridge.turnSummary(
        attachment.attachmentId,
        observation.observationId,
        undefined,
        after
      );
      if (!ownsRequest()) return;
      const current = this.view.turnSummary;
      const billing = current?.gatewayBilling;
      const page = updated.gatewayBilling?.children;
      if (updated.turnId !== turnId || !current || !billing || !page)
        throw new Error("native_chat_gateway_billing_unavailable");
      basis.childAfter = after;
      this.update({
        turnSummary: {
          ...current,
          gatewayBilling: { ...billing, children: page },
        },
        gatewayChildPage: { status: "idle", hasPrevious: !!after },
      });
    } catch {
      if (ownsRequest())
        this.update({
          gatewayChildPage: {
            ...this.view.gatewayChildPage,
            status: "unavailable",
          },
        });
    }
  }

  async refreshGatewayBilling(
    turnId: string,
    attempt: NativeChatGatewayAttemptRef
  ): Promise<void> {
    const scope = this.scope;
    const basis = scope?.summaryRequest;
    const attachment = scope?.attachment;
    const observation = scope?.observation;
    const summary = this.view.turnSummary;
    const billing = summary?.gatewayBilling;
    const child =
      attempt.child &&
      billing?.children?.assignments.find(
        (row) =>
          row.childId === attempt.child?.childId &&
          row.inputId === attempt.child?.inputId
      );
    const direct =
      !attempt.child &&
      billing?.attempts.some((row) => sameGatewayAttempt(row, attempt));
    const group = attempt.child
      ? child?.billing
      : direct
        ? billing
        : billing?.review;
    if (
      !scope ||
      !attachment ||
      !observation ||
      !this.bridge.turnSummary ||
      basis?.turnId !== turnId ||
      summary?.turnId !== turnId ||
      this.view.gatewayBillingRefresh?.status === "loading" ||
      this.view.gatewayChildPage.status === "loading" ||
      !group?.attempts.some(
        (row) =>
          row.refreshable &&
          sameGatewayAttempt({ ...row, child: attempt.child }, attempt)
      )
    )
      return;
    const ownsRequest = () =>
      this.owns(scope) &&
      scope.attachment === attachment &&
      scope.summaryRequest === basis &&
      this.view.turnSummary?.turnId === turnId;
    const selected = {
      operationId: attempt.operationId,
      attemptId: attempt.attemptId,
      ...(attempt.child && { child: attempt.child }),
    };
    this.update({ gatewayBillingRefresh: { ...selected, status: "loading" } });
    try {
      const updated = await this.bridge.turnSummary(
        attachment.attachmentId,
        observation.observationId,
        selected,
        basis.childAfter
      );
      if (!ownsRequest()) return;
      const updatedChild =
        selected.child &&
        updated.gatewayBilling?.children?.assignments.find(
          (row) =>
            row.childId === selected.child?.childId &&
            row.inputId === selected.child?.inputId
        );
      const updatedGroup = selected.child
        ? updatedChild?.billing
        : direct
          ? updated.gatewayBilling
          : updated.gatewayBilling?.review;
      const refreshed = updatedGroup?.attempts.find((row) =>
        sameGatewayAttempt({ ...row, child: selected.child }, selected)
      );
      const current = this.view.turnSummary;
      const currentBilling = current?.gatewayBilling;
      const currentChild =
        selected.child &&
        currentBilling?.children?.assignments.find(
          (row) =>
            row.childId === selected.child?.childId &&
            row.inputId === selected.child?.inputId
        );
      const currentGroup = selected.child
        ? currentChild?.billing
        : direct
          ? currentBilling
          : currentBilling?.review;
      if (
        updated.turnId !== turnId ||
        !current ||
        !currentBilling ||
        !currentGroup ||
        !refreshed ||
        refreshed.kind === "unavailable"
      )
        throw new Error("native_chat_gateway_billing_unavailable");
      const refreshedGroup = {
        ...currentGroup,
        attempts: currentGroup.attempts.map((row) =>
          sameGatewayAttempt({ ...row, child: selected.child }, selected)
            ? refreshed
            : row
        ),
      };
      this.update({
        turnSummary: {
          ...current,
          gatewayBilling:
            selected.child && currentBilling.children
              ? {
                  ...currentBilling,
                  children: {
                    ...currentBilling.children,
                    assignments: currentBilling.children.assignments.map(
                      (row) =>
                        row.childId === selected.child?.childId &&
                        row.inputId === selected.child?.inputId
                          ? { ...row, billing: refreshedGroup }
                          : row
                    ),
                  },
                }
              : direct
                ? refreshedGroup
                : { ...currentBilling, review: refreshedGroup },
        },
        gatewayBillingRefresh: null,
      });
    } catch {
      if (ownsRequest())
        this.update({
          gatewayBillingRefresh: { ...selected, status: "unavailable" },
        });
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

  async answerLibrarySelection(
    selectionId: string,
    choice:
      | "skip"
      | "retry"
      | { id: string; readPng: (maxBytes: number) => Promise<ArrayBuffer> }
  ): Promise<boolean> {
    const scope = this.scope;
    const selection = this.view.librarySelection;
    const attachment = scope?.attachment;
    const send = this.bridge.answerLibrarySelection;
    if (
      !scope ||
      !attachment ||
      !send ||
      selection?.selectionId !== selectionId ||
      this.view.acting ||
      (choice === "retry") !== !!scope.pendingLibraryAnswer ||
      (choice !== "retry" &&
        scope.librarySelectionBasis !== scope.observation?.observationId)
    )
      return false;
    const owns = () => this.owns(scope) && scope.attachment === attachment;
    this.update({ acting: true, librarySelectionError: null });
    try {
      let pending = scope.pendingLibraryAnswer;
      if (!pending && choice !== "retry") {
        let answer: NativeChatLibrarySelectionAnswer = { kind: "skipped" };
        if (choice !== "skip") {
          const bytes = await choice.readPng(MAX_ATTACHMENT_BYTES);
          if (bytes.byteLength <= 0 || bytes.byteLength > MAX_ATTACHMENT_BYTES)
            throw new Error("image_size_limit");
          answer = {
            kind: "selected",
            id: choice.id,
            png: new Uint8Array(bytes.slice(0)),
          };
        }
        if (!owns()) return false;
        if (
          this.view.librarySelection?.reviewId !== selection.reviewId ||
          scope.librarySelectionBasis !== scope.observation?.observationId
        ) {
          this.update({
            librarySelectionError:
              "The Library request changed. Review it and try again.",
          });
          return false;
        }
        pending = { selectionId, reviewId: selection.reviewId, answer };
        scope.pendingLibraryAnswer = pending;
      }
      if (!pending || pending.selectionId !== selectionId) return false;
      await send.call(
        this.bridge,
        attachment.attachmentId,
        pending.reviewId,
        pending.answer
      );
      if (owns()) {
        scope.pendingLibraryAnswer = undefined;
        scope.librarySelectionBasis = undefined;
        this.update({ librarySelection: null, librarySelectionRetry: false });
      }
      return true;
    } catch (error) {
      if (owns()) {
        if (
          error instanceof Error &&
          /library_selection_(no_longer_answerable|unavailable|answer_invalid)|invalid_png_image|image_size_limit|stale_(session|control)_revision|request_identity_reused/.test(
            error.message
          )
        ) {
          scope.pendingLibraryAnswer = undefined;
          scope.librarySelectionBasis = undefined;
        }
        const retry = !!scope.pendingLibraryAnswer;
        this.update({
          librarySelectionRetry: retry,
          librarySelectionError: retry
            ? "Couldn't confirm the Library answer. Retry the same answer."
            : "Couldn't use this Library choice. Review the request and try again.",
        });
      }
      return false;
    } finally {
      if (owns()) {
        await this.refresh(scope);
        if (owns()) this.update({ acting: false });
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
      if (this.editorSurfaces && this.bridge.publishEditorSurfaces) {
        this.subscribeToEditorPresentation(scope, attachment);
        const svgText = this.editorSurfaces.svgText;
        if (svgText && this.bridge.onEditorSvgText) {
          try {
            scope.stopEditorSvgText = this.bridge.onEditorSvgText(
              attachment.attachmentId,
              (request) =>
                this.owns(scope) && scope.attachment === attachment
                  ? svgText.invoke(request)
                  : { kind: "unavailable" }
            );
          } catch {
            // This attachment can still supply the ordinary editor context.
          }
        }
        const publish = () => this.publishEditorSurfaces(scope, attachment);
        scope.stopEditorSurfaceUpdates =
          this.editorSurfaces.subscribeToEditorSurfaces(() => void publish());
        await publish();
        if (!this.owns(scope)) return;
      }
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
      void this.readCommands(scope);
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
    scope.stopEditorSurfaceOpen?.();
    scope.stopEditorSvgText?.();
    scope.stopEditorSurfaceUpdates?.();
    void scope.sideChat?.close().catch(() => {});
    scope.subagents?.dispose();
    this.attachments = this.attachments.then(async () => {
      // Detach removes the subscription. It does not stop accepted work.
      if (scope.attachment)
        await this.bridge.detach(scope.attachment.attachmentId).catch(() => {});
    });
  }

  private subscribeToEditorPresentation(
    scope: Scope,
    attachment: NativeChatAttachment
  ): void {
    const source = this.editorSurfaces;
    if (!source?.open || !this.bridge.onEditorSurfaceOpen) return;
    try {
      scope.stopEditorSurfaceOpen = this.bridge.onEditorSurfaceOpen(
        attachment.attachmentId,
        (request, isCurrent) => {
          const current = () =>
            this.owns(scope) &&
            scope.attachment === attachment &&
            scope.editorPresentationRevision === request.revision &&
            Date.now() < request.expiresAtMs &&
            isCurrent();
          if (current())
            void source.open?.(request.path, current).catch(() => {});
        }
      );
      scope.editorPresentationRevision = 0;
    } catch {
      // A viewer that cannot subscribe still supplies read-only tab context.
    }
  }

  private async publishEditorSurfaces(
    scope: Scope,
    attachment: NativeChatAttachment
  ): Promise<void> {
    if (!this.owns(scope) || !this.editorSurfaces) return;
    const revision = scope.editorPresentationRevision;
    if (revision !== undefined) scope.editorPresentationRevision = revision + 1;
    await this.bridge
      .publishEditorSurfaces?.(
        attachment.attachmentId,
        this.editorSurfaces.readEditorSurfaces(),
        ...(revision === undefined ? [] : ([revision + 1] as const))
      )
      .catch(() => {});
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

  private async readCommands(scope: Scope): Promise<void> {
    if (!scope.attachment || !this.bridge.commands || !this.bridge.runCommand)
      return;
    try {
      const commands = await this.bridge.commands(
        scope.attachment.attachmentId
      );
      if (this.owns(scope)) this.update({ commands });
    } catch {
      // An older or detached owner can leave the composer without commands.
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
        if (turnChanged) {
          scope.librarySelectionBasis = undefined;
          scope.pendingLibraryAnswer = undefined;
        }
        const replay =
          scope.replay ||
          lifecycleBasis(scope.observation) !== lifecycleBasis(next) ||
          (scope.gaps.size > 0 &&
            historyPosition(scope.observation) !== historyPosition(next));
        scope.observation = next;
        if (
          next.snapshot.subagentsAvailable &&
          supportsSubagents(this.bridge)
        ) {
          scope.subagents ??= new NativeSubagentController(
            this.bridge,
            attachment.attachmentId,
            () => scope.observation
          );
        } else {
          scope.subagents?.dispose();
          scope.subagents = undefined;
        }
        if (
          scope.awaitingTurn &&
          (next.snapshot.current?.turnId === scope.awaitingTurn ||
            next.snapshot.latest?.turnId === scope.awaitingTurn)
        )
          scope.awaitingTurn = undefined;
        this.update({
          observation: next,
          subagents: scope.subagents ?? null,
          ...(turnChanged && {
            questions: [],
            questionReady: false,
            questionError: null,
            librarySelection: null,
            librarySelectionError: null,
            librarySelectionRetry: false,
          }),
        });
        this.refreshTurnSummary(scope, attachment, next);
        this.refreshWakeup(scope, attachment, next);
        void this.refreshQueue(scope, this.view.queue?.offset ?? 0);
        await Promise.all([
          this.refreshApprovals(scope, attachment, next),
          this.refreshQuestions(scope, attachment, next),
          this.refreshLibrarySelection(scope, attachment, next),
          this.refreshGoal(scope, attachment, next),
        ]);
        if (!this.owns(scope)) return;
        if (!replay) return;
        if (scope.earlierRead) {
          // The observation already advanced. Keep its replay pending until
          // the earlier page releases the shared transcript reader.
          scope.replay = true;
          return;
        }
        scope.replay = false;
        const page = this.bridge.transcriptPage
          ? await this.bridge.transcriptPage(attachment.attachmentId)
          : undefined;
        const messages =
          page?.messages ??
          (await this.bridge.transcript(attachment.attachmentId));
        if (!this.owns(scope)) return;
        if (
          page &&
          scope.earlierWindow &&
          scope.earlierWindow.view !== page.view
        )
          scope.earlierWindow = undefined;
        scope.recentWindow = page && {
          view: page.view,
          older: page.older,
          turns: page.turns,
        };
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
        scope.subagents?.dispose();
        scope.subagents = undefined;
        this.update({
          subagents: null,
          error: describe(error, "Couldn't refresh this chat. Try Refresh."),
        });
      })
      .finally(() => {
        scope.refreshing = undefined;
        if (
          observable &&
          this.owns(scope) &&
          (scope.observation?.snapshot.current ||
            this.view.commandRunning === "compact" ||
            this.view.revisionDraft?.unverified ||
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

  private refreshWakeup(
    scope: Scope,
    attachment: NativeChatAttachment,
    observation: NativeChatObservation
  ): void {
    const read = this.bridge.scheduledWakeup;
    if (!read || !this.view.wakeupsAvailable) return;
    const { current, latest } = observation.snapshot;
    const turn = current ?? latest;
    const known =
      this.view.scheduledWakeup?.turnId === turn?.turnId
        ? this.view.scheduledWakeup
        : null;
    if (this.view.scheduledWakeup && !known)
      this.update({ scheduledWakeup: null, wakeupError: null });
    if (
      !turn ||
      (current?.disposition === "running" && !known) ||
      (!current && scope.wakeupSettled === turn.turnId) ||
      scope.wakeupRead?.observationId === observation.observationId
    )
      return;
    const request = { observationId: observation.observationId };
    scope.wakeupRead = request;
    const owns = () =>
      this.owns(scope) &&
      scope.attachment === attachment &&
      scope.wakeupRead === request &&
      scope.observation?.observationId === request.observationId;
    void read
      .call(this.bridge, attachment.attachmentId, request.observationId)
      .then((schedule) => {
        if (!owns()) return;
        if (schedule && schedule.turnId !== turn.turnId)
          throw new Error("native_chat_wakeup_changed");
        if (!current) scope.wakeupSettled = turn.turnId;
        this.update({ scheduledWakeup: schedule, wakeupError: null });
      })
      .catch(() => {
        if (owns())
          this.update({
            wakeupError: "Couldn't refresh the scheduled check-in.",
          });
      })
      .finally(() => {
        if (scope.wakeupRead === request) scope.wakeupRead = undefined;
      });
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
        this.update({
          turnSummary: null,
          gatewayBillingRefresh: null,
          gatewayChildPage: { status: "idle", hasPrevious: false },
        });
      }
      return;
    }
    if (scope.summaryRequest?.turnId === latest.turnId) return;
    const request: NonNullable<Scope["summaryRequest"]> = {
      turnId: latest.turnId,
    };
    const status = latest.status;
    scope.summaryRequest = request;
    if (this.view.turnSummary?.turnId !== latest.turnId)
      this.update({
        turnSummary: null,
        gatewayBillingRefresh: null,
        gatewayChildPage: { status: "idle", hasPrevious: false },
      });
    const ownsRequest = () =>
      this.owns(scope) && scope.summaryRequest === request;
    const unavailable = () => {
      if (!ownsRequest()) return;
      request.failed = true;
      this.update({
        turnSummary: {
          turnId: latest.turnId,
          status,
          text: TERMINAL_OUTCOME[status],
          textTruncated: false,
          steps: null,
          unresolvedOperations: null,
          toolActivity: null,
          checks: [],
          detailsUnavailable: true,
        },
      });
    };
    void this.bridge
      .turnSummary(attachment.attachmentId, observation.observationId)
      .then((turnSummary) => {
        if (!ownsRequest()) return;
        if (
          turnSummary.turnId !== latest.turnId ||
          turnSummary.status !== status
        ) {
          unavailable();
          return;
        }
        this.update({ turnSummary });
      })
      .catch(unavailable);
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

  private async refreshLibrarySelection(
    scope: Scope,
    attachment: NativeChatAttachment,
    observation: NativeChatObservation
  ): Promise<void> {
    const read = this.bridge.librarySelections;
    if (!read || !scope.librarySelectionAvailable) return;
    const turn = observation.snapshot.current;
    if (turn?.disposition !== "suspended" || turn.cancelled) {
      scope.librarySelectionBasis = undefined;
      scope.pendingLibraryAnswer = undefined;
      if (this.view.librarySelection || this.view.librarySelectionError)
        this.update({
          librarySelection: null,
          librarySelectionError: null,
          librarySelectionRetry: false,
        });
      return;
    }
    if (scope.librarySelectionBasis === observation.observationId) return;
    try {
      const [selection] = await read.call(
        this.bridge,
        attachment.attachmentId,
        observation.observationId
      );
      if (!this.owns(scope)) return;
      scope.librarySelectionBasis = observation.observationId;
      const changed =
        this.view.librarySelection?.selectionId !== selection?.selectionId;
      if (scope.pendingLibraryAnswer?.selectionId !== selection?.selectionId)
        scope.pendingLibraryAnswer = undefined;
      this.update({
        librarySelection: selection ?? null,
        librarySelectionRetry: !!scope.pendingLibraryAnswer,
        ...(changed && { librarySelectionError: null }),
      });
    } catch {
      // A new observation can replace a stale selection review.
    }
  }

  private receive(scope: Scope, update: NativeChatUpdate): void {
    if (update.kind === "closed" && update.reason === "session_deleted") {
      this.forgetDeletedChat(scope);
      return;
    }
    if (update.kind === "activity") {
      this.receiveActivity(scope, update);
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

  /** Merge one live tool call into its message until durable replay arrives. */
  private receiveActivity(
    scope: Scope,
    update: NativeChatActivityUpdate
  ): void {
    const known = scope.observation?.snapshot.current;
    if (known && known.turnId !== update.turnId) {
      void this.refresh(scope);
      return;
    }
    if (!known && scope.observation?.snapshot.latest?.turnId === update.turnId)
      return;
    if (scope.durable.some((message) => message.messageId === update.messageId))
      return;
    const previous = scope.live.get(update.messageId);
    if (previous && previous.turnId !== update.turnId) return;
    const recorded = previous?.activity ?? [];
    const index = recorded.findIndex(
      (item) => item.callId === update.activity.callId
    );
    if (index < 0 && recorded.length >= MAX_LIVE_ACTIVITY) return;
    const activity =
      index < 0
        ? [...recorded, update.activity]
        : recorded.map((item, at) => (at === index ? update.activity : item));
    scope.live.set(update.messageId, {
      messageId: update.messageId,
      role: "assistant",
      text: "",
      bytes: 0,
      ...previous,
      turnId: update.turnId,
      activity,
    });
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
      messages: scope.earlierWindow?.messages ?? [
        ...scope.durable,
        ...scope.live.values(),
      ],
      turnRecords:
        (scope.earlierWindow ?? scope.recentWindow)?.turns ?? EMPTY_TURNS,
      earlierMessages: !!scope.earlierWindow,
      canReadEarlier: !!(scope.earlierWindow ?? scope.recentWindow)?.older,
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
    const focus = this.pendingFocus;
    const wasBlocked = focus && this.focusBlocked();
    this.view = { ...this.view, ...change };
    for (const listener of this.listeners) listener();
    if (focus && wasBlocked && !this.focusBlocked())
      queueMicrotask(() => void this.applyFocus(focus));
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
    const key = this.selectionMemoryKey();
    try {
      const value = JSON.parse(
        key ? (this.memory?.getItem(key) ?? "null") : "null"
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
    const key = this.selectionMemoryKey();
    try {
      if (key)
        this.memory?.setItem(
          key,
          JSON.stringify({
            selected: this.view.selected,
            sessions: this.recents,
          })
        );
    } catch {
      /* Browser storage may be disabled. */
    }
  }

  /** Chats belong to the workspace; the model connection does not partition them. */
  private selectionMemoryKey(): string | undefined {
    return this.memoryKey;
  }
}

const COMPACTION_NOTICE: Record<
  Extract<NativeChatCommandResult, { command: "compact" }>["status"],
  string
> = {
  running: "Compaction is still running.",
  suspended: "Compaction is paused.",
  interrupted:
    "Compaction was interrupted. Earlier context is still available.",
  installed: "Earlier context summarized. The transcript is still available.",
  stale: "Context changed before the summary could be installed.",
  failed: "Compaction failed. Earlier context is still available.",
  stopped: "Compaction stopped. Earlier context is still available.",
  uncertain:
    "The compaction outcome is uncertain. Earlier context is still available.",
  no_change: "There is no earlier context to summarize.",
};

function commandError(command: NativeChatCommand, reason: string): string {
  if (reason.includes("native_chat_command_unverified"))
    return `Couldn't confirm /${command}. Retry the same command.`;
  if (reason.includes("history_anchor_missing"))
    return "There is no committed message to fork yet.";
  if (reason.includes("history_basis_changed"))
    return "The chat changed before the fork. Try again from its current history.";
  if (reason.includes("fork_tail_unavailable"))
    return "This host cannot locate the latest message of a long chat.";
  return command === "compact"
    ? "Couldn't start compaction."
    : "Couldn't fork this chat.";
}

function revisionError(error: unknown): string {
  const reason = error instanceof Error ? error.message : "";
  if (
    reason.includes("native_chat_revision_unverified") ||
    reason.includes("native_chat_revision_in_progress")
  )
    return "Couldn't confirm the edit. Retry to check the same request.";
  if (reason.includes("history_revision_target_unavailable"))
    return "Only retained plain-text messages originally sent in this chat can be edited.";
  if (reason.includes("history_revision_requires_goal_resolution"))
    return "Resolve or clear the current goal before editing history.";
  if (
    reason.includes("history_revision_requires_idle") ||
    reason.includes("history_revision_requires_empty_queue")
  )
    return "Finish or stop the current work and clear the queue before editing history.";
  if (
    reason.includes("stale_session_revision") ||
    reason.includes("history_basis_changed")
  )
    return "The chat changed. Reopen the message before resubmitting.";
  if (reason.includes("native_chat_revision_text_invalid"))
    return "Enter a replacement message within the text limit.";
  if (reason.includes("native_chat_effort_unavailable"))
    return "Ultra effort is unavailable on this connection.";
  if (reason.includes("native_chat_revision_effort_changed"))
    return "Resubmit this message with its original effort.";
  return "Couldn't revise this message.";
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
    return "This connection can't delete a chat with named subagents.";
  if (reason.includes("deletion_dependencies_changed"))
    return "This chat or its named subagents changed. Review it before deleting.";
  if (reason.includes("deletion_dependency_limit"))
    return "This chat has too many named subagents to delete together.";
  if (reason.includes("has_retained_inputs"))
    return "Couldn't verify the private files for this chat or its named subagents.";
  if (reason.includes("session_goal_exists"))
    return "Finish or clear the Goal before deleting this chat.";
  if (reason.includes("work_unresolved"))
    return "This chat or a named subagent still has unresolved work.";
  if (
    reason.includes("requires_idle") ||
    reason.includes("requires_empty_queue")
  )
    return "This chat or a named subagent still has running, paused, or queued work.";
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
  // A replacement rewrites text only; requested tool calls stay attached.
  const activity =
    previous?.turnId === update.turnId ? previous.activity : undefined;
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
    ...(activity && { activity }),
  };
}

function describe(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  if (error.message.includes("session_execution_configuration_changed"))
    return "This chat continues with models from the account that started it. Choose one of those models, or start a new chat.";
  if (error.message.includes("native_chat_transcript_too_large"))
    return "This chat is too large to restore in the workspace pane.";
  if (error.message.includes("history_replay_window_changed"))
    return "Chat history changed. Try loading earlier messages again.";
  if (error.message.includes("native_chat_pending_regime_changed"))
    return "Retry this draft in its original mode, or edit it to send a new message.";
  if (error.message.includes("native_chat_pending_effort_changed"))
    return "Retry with the original effort, or edit the draft to send a new message.";
  if (error.message.includes("native_chat_effort_unavailable"))
    return "Ultra effort is unavailable on this connection.";
  if (error.message.includes("image_size_limit"))
    return "Choose a PNG of at most 256 KiB within the supported image dimensions.";
  if (error.message.includes("invalid_png_image"))
    return "Choose a valid PNG image.";
  if (error.message.includes("image_input_unavailable"))
    return "This chat's current provider does not accept PNG inputs.";
  if (error.message.includes("file_size_limit"))
    return "Choose a file of at most 256 KiB.";
  if (/invalid_file_attachment|retained_file_name_invalid/.test(error.message))
    return "Choose a file with a supported name that can be read.";
  if (error.message.includes("file_attachment_unavailable"))
    return "This chat cannot inspect attached files.";
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

function supportsSubagents(
  bridge: DesktopNativeChat
): bridge is DesktopNativeChat & NativeSubagentClient {
  return (
    typeof bridge.listSubagents === "function" &&
    typeof bridge.inspectSubagent === "function" &&
    typeof bridge.createSubagent === "function" &&
    typeof bridge.assignSubagent === "function" &&
    typeof bridge.stopSubagent === "function"
  );
}

function revisionChanged(error: unknown): boolean {
  return (
    error instanceof Error &&
    /stale_session_revision|stale_journal_change|history_position_changed|driver_state_revision_changed|goal_revision_changed|goal_review_reservation_changed|native_chat_(observation_unavailable|queue_changed|goal_observation_unavailable)/.test(
      error.message
    )
  );
}

function sameGatewayAttempt(
  left: NativeChatGatewayAttemptRef,
  right: NativeChatGatewayAttemptRef
): boolean {
  return (
    left.operationId === right.operationId &&
    left.attemptId === right.attemptId &&
    left.child?.childId === right.child?.childId &&
    left.child?.inputId === right.child?.inputId
  );
}

function goalRequestProblem(
  request: NativeChatGoalRequest,
  view: Pick<
    NativeChatView,
    | "goalEffortAvailable"
    | "wakeupsAvailable"
    | "observation"
    | "operatingRegime"
  >
): string | null {
  if (request.allowWakeup && request.effort === "ultra")
    return "Choose Standard effort to allow a scheduled goal check-in.";
  if (request.allowWakeup && view.operatingRegime !== "act")
    return "Choose Act to allow a scheduled goal check-in.";
  if (request.allowWakeup && !view.wakeupsAvailable)
    return "Scheduled goal check-ins are unavailable on this connection.";
  if (request.effort === "ultra" && !view.goalEffortAvailable)
    return "Ultra is unavailable for goals on this connection.";
  if (
    request.maxCostMills !== undefined &&
    request.allowance.inferenceSteps > 4096
  )
    return "An enforced spending limit supports at most 4,096 inference steps per goal.";
  if (
    request.namedChildId &&
    (request.effort !== "ultra" ||
      view.operatingRegime !== "act" ||
      !view.observation?.snapshot.goalNamedChildAvailable)
  )
    return "Choose Act and Ultra to use a named reviewer on a supported connection.";
  const objectiveProblem = goalObjectiveProblem(
    request.objective,
    request.criteria
  );
  if (objectiveProblem) return objectiveProblem;
  if (
    [request.allowance.workTurns, request.allowance.inferenceSteps].some(
      (limit) => !Number.isSafeInteger(limit) || limit < 1 || limit > 0xffffffff
    )
  )
    return "Enter a positive whole number for each allowance.";
  return null;
}

function goalObjectiveProblem(
  description: string,
  criteria: readonly string[]
): string | null {
  if (!description.trim() || utf8.encode(description).length > 8192)
    return "Enter a goal objective of at most 8 KiB.";
  if (
    !criteria.length ||
    criteria.length > 16 ||
    criteria.some((line) => !line.trim() || utf8.encode(line).length > 1024)
  )
    return "Enter 1–16 success criteria, each at most 1 KiB.";
  return null;
}
