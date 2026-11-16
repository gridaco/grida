import type {
  DesktopNativeChat,
  NativeChatArtifactSaveResult,
  NativeChatAcceptance,
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
  NativeChatQueueItem,
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
  NativeChatPermissionMode,
  NativeChatPermissionState,
  NativeChatPermissionReview,
  NativeChatEffort,
  NativeChatPage,
  NativeChatProfileCatalog,
  NativeChatProfileSelection,
  NativeChatSelectionState,
  NativeChatQuestion,
  NativeChatQuestionAnswer,
  NativeChatQueueAction,
  NativeChatQueueChange,
  NativeChatQueuePage,
  NativeChatSteer,
  NativeChatReadiness,
  NativeChatSideAttachment,
  NativeChatSideRefusal,
  NativeChatTextUpdate,
  NativeChatTranscriptPage,
  NativeChatTurnRecord,
  NativeChatTurnSummary,
  NativeChatUpdate,
  NativeEditorSurfaceSnapshot,
  NativeEditorSvgText,
  NativeSubagentClient,
} from "@grida/desktop-bridge";
import { GoalSpending } from "./goal-spending";
import { ComposerDrafts, type ComposerDraftPending } from "./composer-drafts";
import { isSupportedImageType } from "./image-attachment";
import { video_attachment } from "./video-attachment";
import { image_attachment_preview } from "./image-attachment-preview";
import { NativeSubagentController } from "./native-subagent-controller";
import { NativeBackgroundProcessController } from "./native-background-process-controller";

/** Composer choices made before opening a workspace; all execution uses existing APIs. */
export type NativeChatInitialComposer = Readonly<{
  effort?: NativeChatEffort;
  operatingRegime?: NativeChatOperatingRegime;
  goal?: boolean;
  attachment?: Readonly<{ kind: "file" | "directory"; file: File }>;
  /** A reload cannot recreate the original disk-backed File. */
  missingAttachment?: Readonly<{ kind: "file" | "directory"; name: string }>;
}>;

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
/** The title of a chat the host has not titled yet. */
export const NEW_CHAT_TITLE = "New chat";
/** The title of a side chat the host has not titled yet. */
export const SIDE_CHAT_TITLE = "Side chat";
/** A message chosen before the chat opened could not be sent. */
const MESSAGE_NOT_SENT =
  "Your message from Welcome wasn't sent. It is in the composer; send it when the chat is ready.";
/** A second look for a background chat title after a turn progresses. */
const TITLE_RECHECK_MS = 6_000;
const MAX_LIVE_BYTES = 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 256 * 1024;
const DIRECTORY_MIME_TYPE = "inode/directory";
const DIRECTORY_REFERENCE_UNAVAILABLE =
  "Folder references are unavailable in this chat.";

/**
 * Selected raster Files supply original image input. Ordinary disk files and
 * folders supply references for the model's tools; clipboard files can use the
 * bounded retained-file API. Library and older hosts retain inline PNG intake.
 */
type AttachmentKind = "png" | "image" | "file" | "reference";
type BrowserAttachment = Pick<File, "name" | "size" | "arrayBuffer">;
type TransferredAttachment =
  | { kind: "file"; file: BrowserAttachment & Pick<File, "type"> }
  | { kind: "directory"; file: File };
type AttachmentSource =
  | { kind: "image"; file: File; originalFile?: File }
  | { kind: "file"; file: BrowserAttachment }
  | { kind: "reference"; file: File; directory?: true }
  | {
      kind: "library";
      name: string;
      readPng: (maxBytes: number) => Promise<ArrayBuffer>;
    };
type SelectedAttachment =
  | Readonly<{
      kind: "image";
      name: string;
      file: File;
      originalFile?: File;
      mimeType?: string;
    }>
  | Readonly<{
      kind: "png" | "file";
      name: string;
      bytes: ArrayBuffer;
    }>
  | Readonly<{
      kind: "reference";
      name: string;
      referenceId?: string;
      /** The person's File; Desktop resolves its path when it is sent. */
      file: File;
      mimeType?: string;
      preview?: video_attachment.Preview;
    }>;
const utf8 = new TextEncoder();

const TERMINAL_OUTCOME: Record<NativeChatTurnSummary["status"], string> = {
  succeeded: "The turn finished.",
  failed: "The turn failed.",
  cancelled: "The turn was stopped.",
  uncertain: "The turn ended with unverified work.",
};

/**
 * One of the side chats a chat opened: an ordinary chat bound to its side
 * session. `focus` counts the requests to show it, so a placement can bring
 * it forward.
 */
export type NativeChatSideChat = Readonly<{
  /** Stable for one side chat; every side chat has its own id. */
  id: string;
  chat: NativeChatController;
  focus: number;
}>;

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
  permissionMode: NativeChatPermissionState | null;
  permissionModeAvailable: boolean;
  permissionModeBusy: boolean;
  permissionModeUncertain: boolean;
  permissionModeError: string | null;
  permissionModeReview: NativeChatPermissionReview | null;
  profileError: string | null;
  profileReadError: string | null;
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
  /** Older pages exist above the loaded messages. */
  canReadEarlier: boolean;
  /**
   * The chat whose generated title just arrived, so the title can be revealed
   * as it replaces the new-chat label. Never set by the person's own rename.
   */
  titleArrived: string | null;
  readingEarlier: boolean;
  earlierError: string | null;
  /** The open side chats of this chat, in the order they opened. */
  sideChats: readonly NativeChatSideChat[];
  subagents: NativeSubagentController | null;
  /** Present once the attached chat confirms it lists background processes. */
  backgroundProcesses: NativeBackgroundProcessController | null;
  imageInput: boolean;
  selectedImageInput: boolean;
  fileInput: boolean;
  /** The chat takes files by reference. */
  fileReferenceInput: boolean;
  /** Main explicitly supports directory metadata on the reference route. */
  directoryReferenceInput: boolean;
  attachmentReading: boolean;
  attachmentNotice: string | null;
  attachmentDraft: Readonly<{
    kind: AttachmentKind;
    name: string;
    size?: number;
    mimeType?: string;
    /** A video's poster frame, duration and dimensions. */
    preview?: video_attachment.Preview;
    error?: string;
  }> | null;
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
  queueDraft: Readonly<{
    inputId: string;
    text: string;
    /** Use the negotiated operation that retains non-text input and settings. */
    replaceText?: true;
    allowEmpty?: boolean;
  }> | null;
  steering: boolean;
  /** The turn a pause was requested for; it may still be settling. */
  pausing: string | null;
  operatingRegime: NativeChatOperatingRegime;
  effort: NativeChatEffort;
  effortAvailable: boolean;
  goalEffortAvailable: boolean;
  goal: NativeChatGoalObservation | null;
  goalReady: boolean;
  goalIntent: boolean;
  loading: boolean;
  acting: boolean;
  /** A send is awaiting acceptance/reconciliation, including initial chat setup. */
  submitting: boolean;
  repairing: boolean;
  error: string | null;
}>;

type Scope = {
  permissionRead?: object;
  permissionConfirmation?: {
    review: NativeChatPermissionReview;
    resolve(confirmed: boolean): void;
  };
  pendingPermission?: {
    mode: NativeChatPermissionMode;
    revision: number;
    requestId: string;
    review?: { reviewId: string; confirmed: boolean };
  };
  selection?: NativeChatSelectionState;
  selectionReady?: Promise<void>;
  selectionChange?: Promise<void>;
  firstInputId?: string;
  /** Preserved only when the same send activates a different worker route. */
  submission?: object;
  effortRead?: Promise<void>;
  effortKnown?: boolean;
  id: number;
  requested: string | null;
  /**
   * Opened to send a message chosen elsewhere. The new chat's composer
   * draft and its Plan, Goal or attachment stay for a later send.
   */
  startsWithMessage?: true;
  attachment?: NativeChatAttachment;
  /** Main retired this handle while recovering a failed connection change. */
  retiredAttachment?: true;
  stopEditorSurfaceUpdates?: () => void;
  stopEditorSurfaceOpen?: () => void;
  stopEditorSvgText?: () => void;
  editorPresentationRevision?: number;
  /** Open side chats, in the order they opened. */
  sides: SideChatScope[];
  subagents?: NativeSubagentController;
  backgroundProcesses?: NativeBackgroundProcessController;
  selectedAttachment?: SelectedAttachment;
  attachmentRead?: object;
  attachmentCapabilityRead?: object;
  opening?: Promise<void>;
  refreshing?: Promise<void>;
  timer?: ReturnType<typeof setTimeout>;
  titleCheck?: ReturnType<typeof setTimeout>;
  durable: readonly NativeChatMessage[];
  recentWindow?: Pick<NativeChatTranscriptPage, "view" | "older" | "turns">;
  /**
   * Older pages loaded above the latest window, oldest first. They join the
   * transcript as one scroll; a changed history view discards them.
   */
  earlierPages: NativeChatTranscriptPage[];
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
  queuedTextReplacement?: boolean;
  queueListing?: Promise<void>;
  pendingQueueChange?: { key: string; change: NativeChatQueueChange };
  steeringTarget?: string;
  pendingSteering?: NativeChatSteer;
  goalRevision?: number;
  goalNeedsRefresh?: boolean;
  awaitingGoalId?: string;
  pendingGoalStart?: {
    key: string;
    inputId: string;
    selectionRevision?: number;
  };
  pendingGoalControl?: {
    key: string;
    change: NativeChatGoalControl;
    manualGoalId?: string;
  };
  pendingCommand?: { command: NativeChatCommand; requestId: string };
  pendingRevision?: NativeChatRevisionInput;
  replay: boolean;
  draftReady?: Promise<void>;
  draftRestored?: true;
  pendingRestoreFailed?: true;
  promotingDraft?: Readonly<{ from: string; to: string }>;
  pending?: {
    text: string;
    inputId: string;
    mode: "submit" | "enqueue";
    operatingRegime?: NativeChatOperatingRegime;
    effort?: NativeChatEffort;
    selectionRevision?: number;
    attachment?: SelectedAttachment;
    missingAttachment?: Readonly<{
      kind: "reference";
      name: string;
      mimeType?: string;
      referenceId: string;
    }>;
    allowLibrarySelection: boolean;
    editorSvgTargetId?: string;
  };
  awaitingTurn?: string;
};

type SideChatScope = {
  chat: NativeChatController;
  /** The side session's attachment. */
  opened: Promise<NativeChatSideAttachment>;
  /** What placements see; replaced each time the side chat is asked to show. */
  shown: NativeChatSideChat;
  /** Grows each time it opens, shows or sends; the largest is the latest used. */
  used: number;
};

const SIDE_CHAT_UNAVAILABLE = "Side chats are unavailable in this chat.";
/**
 * Failures after which the host may have accepted a goal start. Older Desktop
 * builds report a lost reply as the raw request timeout.
 */
const GOAL_START_UNVERIFIED = [
  "native_chat_goal_start_unverified",
  "native_agent_request_timeout",
];
const GOALS_UNAVAILABLE = "Goals are unavailable in this chat.";
/** Plan applies to the next message, which waits for the running turn. */
const PLAN_QUEUES_STEERING =
  "Plan applies to your next message, so it waits in the queue instead of steering the running turn.";

/**
 * A slash command the composer lists: an intent for the next message, a side
 * chat, stopping background processes, or a host chat command.
 */
export type NativeChatComposerCommand =
  | "plan"
  | "goal"
  | "side"
  | "stop"
  | NativeChatCommand;

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
  permissionMode: null,
  permissionModeAvailable: false,
  permissionModeBusy: false,
  permissionModeUncertain: false,
  permissionModeError: null,
  permissionModeReview: null,
  profileError: null,
  profileReadError: null,
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
  canReadEarlier: false,
  titleArrived: null,
  readingEarlier: false,
  earlierError: null,
  sideChats: [],
  subagents: null,
  backgroundProcesses: null,
  imageInput: false,
  selectedImageInput: false,
  fileInput: false,
  fileReferenceInput: false,
  directoryReferenceInput: false,
  attachmentReading: false,
  attachmentNotice: null,
  attachmentDraft: null,
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
  pausing: null,
  operatingRegime: "act",
  effort: "medium",
  effortAvailable: false,
  goalEffortAvailable: false,
  goal: null,
  goalReady: false,
  goalIntent: false,
  loading: false,
  acting: false,
  submitting: false,
  repairing: false,
  error: null,
});

/** View fields that belong to the workspace, not to the selected chat. */
const SESSION_INDEPENDENT_FIELDS = [
  "sessions",
  "catalogCursor",
  "nextCatalogCursor",
  "catalogLoading",
  "catalogError",
  "catalogArchived",
  "profiles",
  "profileBusy",
  "profileError",
  "profileReadError",
] as const satisfies readonly (keyof NativeChatView)[];

function pickSessionIndependent(
  view: NativeChatView
): Pick<NativeChatView, (typeof SESSION_INDEPENDENT_FIELDS)[number]> {
  return Object.fromEntries(
    SESSION_INDEPENDENT_FIELDS.map((field) => [field, view[field]])
  ) as Pick<NativeChatView, (typeof SESSION_INDEPENDENT_FIELDS)[number]>;
}

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
  private profileId: string | null = null;
  private profileRead?: { connection: object; done: Promise<void> };
  private profileSelection?: Promise<void>;
  private pendingFocus?: { sessionId: string; profileId?: string };
  /** A new chat is opening to send a message chosen before it opened. */
  private startingChat = false;
  private restoredDraftId?: string;

  private get remembersSelection(): boolean {
    return (
      !this.fixed &&
      !!this.bridge.selection &&
      !!this.bridge.updateSelection &&
      !!this.bridge.createFromDraft
    );
  }
  /** The current {@link startChat} call, until it sends or declines. */
  private chatStart?: object;

  constructor(
    private readonly bridge: DesktopNativeChat,
    private readonly memory?: Pick<Storage, "getItem" | "setItem">,
    private readonly memoryKey?: string,
    private readonly editorSurfaces?: NativeChatEditorSurfaces,
    private readonly libraryPicker = false,
    /** Bind this chat to one session it does not choose. */
    private readonly fixed?: NativeChatController.FixedSession
  ) {
    if (fixed)
      this.view = {
        ...this.view,
        effort: fixed.effort,
        profiles: fixed.profiles,
      };
  }

  /** While a fixed chat opens its session; see {@link opened}. */
  private binding?: Promise<void>;

  /**
   * This chat is bound to one session it did not choose, such as a side chat.
   * It never lists, switches, creates or organizes chats, and keeps the model
   * connection of the chat that opened it.
   */
  get fixedSession(): boolean {
    return !!this.fixed;
  }

  /**
   * Whether this chat offers `feature`. A side chat refuses what its snapshot
   * lists, and a fixed chat offers none of them before its first snapshot.
   */
  offers(feature: NativeChatSideRefusal): boolean {
    const snapshot = this.view.observation?.snapshot;
    if (this.fixed && !snapshot) return false;
    return !snapshot?.side?.unavailable.includes(feature);
  }

  /** Settles once a fixed chat has opened its session, or failed to. */
  opened(): Promise<void> {
    return this.binding ?? Promise.resolve();
  }

  private drafts?: { store: ComposerDrafts; workspace: string };

  /**
   * Keep Plan, Goal and an attachment with each chat's unsent draft. The
   * composer keeps the text in the same store under the same key.
   */
  keepDrafts(store: ComposerDrafts, workspace: string): void {
    this.drafts = { store, workspace };
  }

  /** Where the composer keeps the selected chat's unsent draft. */
  composerDraft(): { key: string; store: ComposerDrafts } | undefined {
    const key = this.draftKey();
    return key && this.drafts ? { key, store: this.drafts.store } : undefined;
  }

  /** The draft key the composer uses for the selected chat. */
  draftKey(): string | null {
    return this.scope
      ? this.scopeDraftKey(this.scope)
      : this.drafts
        ? `${this.drafts.workspace}:${this.view.selected ?? "new"}`
        : null;
  }

  /** The draft key of a chat's scope, whichever chat is selected now. */
  private scopeDraftKey(scope: Scope): string | null {
    if (scope.promotingDraft) return scope.promotingDraft.from;
    const session = scope.attachment?.sessionId ?? scope.requested;
    const draftId =
      scope.selection && "draftId" in scope.selection.target
        ? scope.selection.target.draftId
        : undefined;
    return this.drafts
      ? `${this.drafts.workspace}:${session ?? (draftId ? `draft/${draftId}` : "new")}`
      : null;
  }

  private saveDraftModes(key = this.draftKey()): void {
    if (!key || !this.drafts) return;
    this.drafts.store.writeModes(key, {
      ...(this.view.operatingRegime === "plan" && { plan: true }),
      ...(this.view.goalIntent && { goal: true }),
    });
  }

  private saveDraftAttachment(
    attachment: SelectedAttachment | null,
    key = this.draftKey()
  ): void {
    if (key && this.drafts)
      void this.drafts.store.writeAttachment(key, attachment);
  }

  /** Bring back one complete retry capture before accepting another send. */
  private restoreDraft(scope: Scope): Promise<void> {
    if (!this.drafts) {
      scope.draftRestored = true;
      return Promise.resolve();
    }
    return (scope.draftReady ??= this.restoreDraftState(scope)
      .catch(() => {
        if (this.owns(scope)) {
          scope.pendingRestoreFailed = true;
          this.update({
            error:
              "Couldn't restore this draft's send identity. Your draft is kept; reopen the chat before sending.",
          });
        }
      })
      .finally(() => {
        scope.draftRestored = true;
        if (this.owns(scope)) this.update({});
      }));
  }

  private async restoreDraftState(scope: Scope): Promise<void> {
    const drafts = this.drafts,
      key = this.draftKey();
    if (!drafts || !key || !this.owns(scope) || scope.startsWithMessage) return;
    if (
      !scope.requested &&
      scope.selection &&
      "draftId" in scope.selection.target
    )
      await drafts.store.initializeDraft(`${drafts.workspace}:new`, key);
    const modes = drafts.store.readModes(key);
    if (modes.plan && this.bridge.submitInRegime)
      this.update({ operatingRegime: "plan" });
    if (modes.goal && this.bridge.startGoal) this.update({ goalIntent: true });
    const pending = await drafts.store.readPending(key);
    const saved = await drafts.store.readAttachment(key);
    if (!this.owns(scope) || scope.selectedAttachment) return;
    if (pending) {
      const captured = pending.attachment;
      const attachment =
        captured?.kind === "reference"
          ? saved?.kind === "reference" &&
            saved.referenceId === captured.referenceId
            ? saved
            : undefined
          : captured;
      scope.selectedAttachment = attachment;
      scope.pending = {
        ...pending,
        attachment,
        ...(captured?.kind === "reference" &&
          !attachment && { missingAttachment: captured }),
      };
      if (captured)
        this.update({
          attachmentDraft: {
            kind: captured.kind,
            name: captured.name,
            ...(captured.kind === "image" && {
              size: captured.file.size,
              mimeType: captured.mimeType,
            }),
            ...((captured.kind === "png" || captured.kind === "file") && {
              size: captured.bytes.byteLength,
            }),
            ...(captured.kind === "reference" && {
              mimeType: captured.mimeType,
              ...(!attachment && {
                error:
                  "The original reference is unavailable. Retry to check the previous send before attaching it again.",
              }),
            }),
          },
        });
      return;
    }
    if (!saved) return;
    if (saved.kind === "image") {
      await this.readAttachment(scope.id, "image", {
        kind: "image",
        file: saved.file,
        originalFile: saved.originalFile,
      });
      return;
    }
    if (
      !this.canAttach(saved.kind) ||
      (saved.kind === "reference" &&
        saved.mimeType === DIRECTORY_MIME_TYPE &&
        !this.view.directoryReferenceInput)
    ) {
      scope.selectedAttachment = saved;
      this.update({
        attachmentDraft: {
          kind: saved.kind,
          name: saved.name,
          ...(saved.kind === "reference"
            ? {
                mimeType: saved.mimeType,
                ...(saved.mimeType === DIRECTORY_MIME_TYPE && {
                  error: DIRECTORY_REFERENCE_UNAVAILABLE,
                }),
              }
            : { size: saved.bytes.byteLength }),
        },
        attachmentNotice: `${saved.name} is kept with this draft. Choose a model that accepts it to send it.`,
      });
      return;
    }
    await this.readAttachment(
      scope.id,
      saved.kind,
      saved.kind === "reference"
        ? {
            kind: "reference",
            file: saved.file,
            ...(saved.mimeType === DIRECTORY_MIME_TYPE && { directory: true }),
          }
        : { kind: "file", file: new File([saved.bytes], saved.name) }
    );
  }

  private pendingRecord(
    pending: NonNullable<Scope["pending"]>
  ): ComposerDraftPending {
    const { attachment, missingAttachment, ...settings } = pending;
    let captured: ComposerDraftPending["attachment"] = missingAttachment;
    if (attachment?.kind === "image") {
      const { originalFile: _origin, ...frozen } = attachment;
      captured = frozen;
    } else if (attachment?.kind === "reference")
      captured = {
        kind: "reference",
        name: attachment.name,
        referenceId: attachment.referenceId!,
        ...(attachment.mimeType && { mimeType: attachment.mimeType }),
      };
    else if (attachment)
      captured = { ...attachment, bytes: attachment.bytes.slice(0) };
    return { ...settings, ...(captured && { attachment: captured }) };
  }

  private async discardPending(scope: Scope): Promise<void> {
    const inputId = scope.pending?.inputId;
    scope.pending = undefined;
    scope.pendingRestoreFailed = undefined;
    const key = this.scopeDraftKey(scope);
    if (key && this.drafts) await this.drafts.store.clearPending(key, inputId);
  }

  /** The model last chosen in a workspace, as the pane's memory keeps it. */
  static rememberedProfile(
    memory: Pick<Storage, "getItem"> | undefined,
    key: string | undefined
  ): string | null {
    return NativeChatController.readMemory(memory, key).profileId;
  }

  /** A recommendation is valid only while its exact choice is offered. */
  static recommendedProfile(
    profiles: NativeChatProfileCatalog | null
  ): string | null {
    if (profiles?.newChatDefault) {
      const id = profiles.newChatDefault.profileId;
      return id &&
        /^[a-f0-9]{64}$/.test(id) &&
        profiles.choices.some((choice) => choice.id === id)
        ? id
        : null;
    }
    const id = profiles?.recommendedProfileId;
    return id &&
      /^[a-f0-9]{64}$/.test(id) &&
      profiles.choices.some((choice) => choice.id === id)
      ? id
      : null;
  }

  /**
   * Start the workspace's native chat. With a remembered or newly chosen
   * model, that model is selected first so startup opens it directly instead
   * of opening the default and switching; if it cannot run, the default
   * starts as usual.
   */
  static watchReadiness(
    bridge: DesktopNativeChat,
    publish: (
      state: NativeChatReadiness | null,
      recommendedProfileId?: string
    ) => void,
    selection: NativeChatProfileSelection | null = null,
    recommendation?: Readonly<{
      memory?: Pick<Storage, "getItem">;
      key?: string;
      initialSession: string | null;
    }>
  ): () => void {
    let watching = true;
    const probe = async () => {
      try {
        const state = await bridge.status();
        if (!watching) return;
        let result: NativeChatReadiness = state;
        let recommendedProfileId: string | undefined;
        if (state === "native-starting") {
          publish(state);
          if (!watching) return;
          let preferred = selection;
          if (
            !preferred &&
            recommendation &&
            !recommendation.initialSession &&
            bridge.profiles &&
            bridge.selectProfile &&
            !NativeChatController.readMemory(
              recommendation.memory,
              recommendation.key
            ).remembered
          ) {
            const profiles = await bridge.profiles().catch(() => null);
            if (!watching) return;
            // A choice made while the catalogue was loading always wins.
            if (
              !NativeChatController.readMemory(
                recommendation.memory,
                recommendation.key
              ).remembered
            ) {
              const id = NativeChatController.recommendedProfile(profiles);
              if (id) {
                preferred = { kind: "new", id };
                recommendedProfileId = id;
              }
            }
          }
          if (preferred && bridge.selectProfile)
            await bridge.selectProfile(preferred).catch(() => {
              recommendedProfileId = undefined;
            });
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
          case "native-workspace-capacity":
            if (result === "native-ready" && recommendedProfileId)
              publish(result, recommendedProfileId);
            else publish(result);
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

  connect(initial: string | null, profileId?: string | null): void {
    if (this.fixed) {
      this.binding ??= this.bind(null);
      return;
    }
    const saved = this.beginConnection();
    if (this.remembersSelection) {
      this.restoredDraftId = saved.draftId;
      void this.listChats();
      void this.select(initial ?? saved.selected);
      return;
    }
    if (profileId !== null && profileId !== undefined) {
      if (initial) void this.focusChat(initial, profileId);
      else void this.selectProfile({ kind: "saved", id: profileId });
      return;
    }
    if (saved.profileId) {
      void this.restoreProfile(saved.profileId, initial ?? saved.selected);
      return;
    }
    void this.listChats();
    void this.select(initial ?? saved.selected);
  }

  /**
   * Open a new chat on the connection chosen before the workspace opened, or
   * on the workspace default for `null`, and send its first message there.
   *
   * `take` hands the message over at most once. It is called only after the
   * new chat is ready, immediately before the send, so a reload after that
   * point cannot send the message again; a pane closed before then leaves
   * the message for the next connection. When the message cannot be sent,
   * the chat says why and the taken text is returned so the composer can
   * keep it.
   */
  async startChat(
    profileId: string | null,
    take: () => string | null,
    composer?: NativeChatInitialComposer
  ): Promise<string | null> {
    if (this.remembersSelection) {
      this.beginConnection();
      const run = {};
      this.chatStart = run;
      this.startingChat = true;
      let scope: Scope | undefined;
      try {
        const opening = this.select(null);
        scope = this.scope;
        await opening;
      } finally {
        this.startingChat = false;
      }
      if (this.chatStart !== run || !scope || !this.owns(scope)) return null;
      if (scope.selection?.selection?.profileId !== profileId)
        await this.saveSelection(scope, profileId, this.view.effort);
      if (this.chatStart !== run || !this.owns(scope)) return null;
      await this.prepareFirstMessage(composer);
      if (this.chatStart !== run || !this.owns(scope)) return null;
      this.chatStart = undefined;
      if (!this.canSubmit || this.view.profileError || this.view.error)
        return this.declineMessage(take);
      const text = take();
      if (!text) return null;
      try {
        await this.submit(text, scope.id);
        return null;
      } catch {
        return this.keepFirstMessage(scope, text);
      }
    }
    this.beginConnection();
    const run = {};
    this.chatStart = run;
    this.startingChat = true;
    try {
      if (profileId !== null)
        await this.selectProfile({ kind: "new", id: profileId }, null);
      else {
        void this.listChats();
        await this.select(null);
      }
    } finally {
      this.startingChat = false;
    }
    // Closed or reconnected meanwhile: the message waits for that connection.
    if (this.chatStart !== run) return null;
    const scope = this.scope;
    await this.prepareFirstMessage(composer);
    if (this.chatStart !== run || (scope && !this.owns(scope))) return null;
    this.chatStart = undefined;
    const ready =
      !!scope &&
      this.profileId === profileId &&
      !this.view.profileError &&
      !this.view.error &&
      this.canSubmit &&
      this.view.selected === null &&
      scope.requested === null &&
      !scope.attachment;
    if (!ready || !scope) return this.declineMessage(take);
    const text = take();
    if (!text) return null;
    try {
      await this.submit(text, scope.id);
      return null;
    } catch {
      // The send reported why; a refusal before it started has no notice yet.
      if (this.owns(scope) && !this.view.error)
        this.update({ error: MESSAGE_NOT_SENT });
      return this.keepFirstMessage(scope, text);
    }
  }

  /** A late failure belongs to its originating draft, never the newly focused chat. */
  private keepFirstMessage(scope: Scope, text: string): string | null {
    const key = this.scopeDraftKey(scope);
    if (key && this.drafts) {
      const returned = text.split(/\r?\n/).map((line) => ({
        type: "paragraph",
        ...(line && { content: [{ type: "text", text: line }] }),
      }));
      const saved = this.drafts.store.read(key);
      if (
        saved &&
        typeof saved === "object" &&
        "type" in saved &&
        saved.type === "doc" &&
        "content" in saved &&
        Array.isArray(saved.content)
      ) {
        // Preserve newer rich edits and inline references. A previous fallback
        // may already be the document's suffix; do not append it twice.
        const suffix = saved.content.slice(-returned.length);
        if (JSON.stringify(suffix) !== JSON.stringify(returned))
          this.drafts.store.write(key, {
            ...saved,
            content: [...saved.content, ...returned],
          });
      } else this.drafts.store.write(key, { type: "doc", content: returned });
    }
    return this.owns(scope) ? text : null;
  }

  /** Restore a Home request through this chat's ordinary composer capabilities. */
  private async prepareFirstMessage(
    composer?: NativeChatInitialComposer
  ): Promise<void> {
    const scope = this.scope;
    if (!composer || !scope) return;
    if (!scope.draftRestored) await this.restoreDraft(scope);
    if (!this.owns(scope)) return;
    let preparationError: string | undefined;
    if (composer.effort !== undefined) {
      if (this.remembersSelection && scope.selection?.selection)
        await this.saveSelection(
          scope,
          scope.selection.selection.profileId,
          composer.effort
        );
      else this.selectEffort(composer.effort);
      if (!this.owns(scope)) return;
      if (this.view.effort !== composer.effort || this.view.profileError) {
        preparationError =
          "Couldn't apply the effort selected on Home. Your request is kept in the composer.";
      }
    }
    if (composer.operatingRegime !== undefined) {
      this.selectOperatingRegime(composer.operatingRegime);
      if (this.view.operatingRegime !== composer.operatingRegime) {
        this.update({ operatingRegime: composer.operatingRegime });
        this.saveDraftModes();
        preparationError =
          "Plan mode is unavailable in this chat. Your request is kept in the composer.";
      }
    }
    if (composer.goal !== undefined) {
      this.selectGoalIntent(composer.goal);
      if (this.view.goalIntent !== composer.goal) {
        preparationError =
          this.view.error ?? "Goal mode is unavailable in this chat.";
        this.update({ goalIntent: composer.goal });
        this.saveDraftModes();
      }
    }
    if (composer.missingAttachment) {
      this.update({
        attachmentDraft: {
          kind: "file",
          name: composer.missingAttachment.name,
          error:
            "The original attachment is unavailable after reloading. Attach it again before sending.",
        },
      });
      return;
    }
    if (composer.attachment) {
      const { file, kind } = composer.attachment;
      await this.pickTransferredAttachment(scope.id, [composer.attachment]);
      if (!this.owns(scope)) return;
      if (!this.view.attachmentDraft) {
        // Retain custody without granting access. The error prevents a send;
        // only ordinary attachment intake may make this resource executable.
        scope.selectedAttachment = {
          kind: "reference",
          name: file.name,
          file,
          ...(kind === "directory" && { mimeType: DIRECTORY_MIME_TYPE }),
        };
        this.saveDraftAttachment(scope.selectedAttachment);
        this.update({
          attachmentDraft: {
            kind: "reference",
            name: file.name,
            ...(kind === "directory"
              ? { mimeType: DIRECTORY_MIME_TYPE }
              : { size: file.size }),
            error:
              this.view.attachmentNotice ??
              "This chat cannot use the selected attachment. Remove it or attach it again with a compatible model.",
          },
        });
      }
    }
    if (preparationError && this.owns(scope))
      this.update({ error: preparationError });
  }

  /**
   * Take a message that cannot start a chat here, and say that it was not
   * sent. Returns its text so the composer can keep it.
   */
  declineMessage(take: () => string | null): string | null {
    const scope = this.scope;
    const text = take();
    if (text && !this.view.error) this.update({ error: MESSAGE_NOT_SENT });
    return text && scope ? this.keepFirstMessage(scope, text) : text;
  }

  /** Begin listing this workspace's chats and connections. */
  private beginConnection() {
    const saved = this.restore();
    this.chatStart = undefined;
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
      profileReadError: null,
    });
    void this.readProfiles();
    return saved;
  }

  /**
   * Reopen the workspace with the model chosen there before, as the person
   * left it. A choice that can no longer run is forgotten and the workspace
   * opens with the default connection.
   */
  private async restoreProfile(
    id: string,
    sessionId: string | null
  ): Promise<void> {
    const connection = this.catalogConnection;
    await this.selectProfile({ kind: "saved", id }, sessionId ?? undefined);
    if (this.profileId === id || this.catalogConnection !== connection) return;
    this.update({ profileError: null });
    this.save();
    void this.listChats();
    void this.select(sessionId);
  }

  disconnect(): void {
    const previous = this.scope;
    this.scope = undefined;
    this.chatStart = undefined;
    this.catalogConnection = undefined;
    this.profileRead = undefined;
    this.pendingFocus = undefined;
    this.queueRelease(previous);
    // Retired observers must leave the published view before reconnect can
    // wait on a saved connection. The retained transcript remains readable.
    if (!this.scope)
      this.update({
        subagents: null,
        backgroundProcesses: null,
        submitting: false,
      });
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
    this.update({
      profiles: null,
      profileBusy: false,
      profileError: null,
      profileReadError: null,
    });
    void this.readProfiles();
  }

  /** Commit only an explicit connection choice; the full pane owns chat/history loading. */
  async selectConnection(
    selection: NativeChatProfileSelection
  ): Promise<boolean> {
    if (this.remembersSelection && !this.scope) {
      await this.bind(null);
      let scope = this.scope as Scope | undefined;
      if (!scope) return false;
      await this.saveSelection(
        scope,
        selection.kind === "default" ? null : selection.id,
        this.view.effort
      );
      if (this.view.profileError || !scope.selection?.selection) return false;
      try {
        scope = await this.activateSelection(scope);
        return this.owns(scope);
      } catch (error) {
        if (this.owns(scope))
          this.update({ profileError: modelChangeRefusal(error) });
        return false;
      }
    }
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
    } catch (error) {
      if (this.catalogConnection === connection)
        this.update({
          profileError: modelChangeRefusal(error),
        });
      return false;
    } finally {
      if (this.catalogConnection === connection)
        this.update({ profileBusy: false });
    }
  }

  /** Opening the picker and returning from Settings share a pending read. */
  readProfiles(): Promise<void> {
    const connection = this.catalogConnection;
    if (!connection || !this.bridge.profiles) return Promise.resolve();
    if (this.profileRead?.connection === connection)
      return this.profileRead.done;
    const request = { connection, done: Promise.resolve() };
    this.profileRead = request;
    const owns = () =>
      this.catalogConnection === connection && this.profileRead === request;
    request.done = (async () => {
      try {
        const profiles = await this.bridge.profiles!();
        if (owns()) {
          if (this.remembersSelection && profiles)
            this.profileId = profiles.active;
          const selected = this.scope?.selection?.selection;
          this.update({
            profiles:
              profiles && selected
                ? { ...profiles, active: selected.profileId }
                : profiles,
            profileReadError: null,
          });
        }
      } catch {
        if (owns())
          this.update({ profileReadError: "Couldn't load model connections." });
      } finally {
        if (owns()) this.profileRead = undefined;
      }
    })();
    return request.done;
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

  private async restoreSelection(
    scope: Scope,
    sessionId: string | null
  ): Promise<void> {
    const draftId = this.restoredDraftId ?? crypto.randomUUID();
    this.restoredDraftId = undefined;
    const state = await this.bridge.selection!(
      sessionId ? { sessionId } : { draftId }
    );
    if (!this.owns(scope)) return;
    scope.selection = state;
    this.presentSelection(state);
    this.save();
  }

  private presentSelection(state: NativeChatSelectionState): void {
    this.update({
      ...(state.selection && { effort: state.selection.effort }),
      ...(this.view.profiles &&
        state.selection && {
          profiles: {
            ...this.view.profiles,
            active: state.selection.profileId,
          },
        }),
      profileError: state.selection
        ? state.available
          ? null
          : "This chat's selected model connection is unavailable. Choose an available model."
        : "Choose a model for this chat. Its earlier connection could not be verified.",
    });
  }

  private async saveSelection(
    scope: Scope,
    profileId: string | null,
    effort: NativeChatEffort
  ): Promise<void> {
    if (
      !this.owns(scope) ||
      this.view.profileBusy ||
      this.view.acting ||
      this.view.steering
    )
      return;
    const previousEffort = this.view.effort;
    this.update({ profileBusy: true, profileError: null, effort });
    const run = (async () => {
      await scope.selectionReady;
      if (!this.owns(scope) || !scope.selection) return;
      const operationId = crypto.randomUUID();
      const update = () =>
        this.bridge.updateSelection!(
          scope.selection!.target,
          scope.selection!.revision,
          operationId,
          { profileId, effort }
        );
      let state;
      try {
        state = await update();
      } catch (error) {
        if (
          !(error instanceof Error) ||
          error.message !== "native_chat_draft_creation_pending" ||
          !this.owns(scope) ||
          !scope.selection ||
          !("draftId" in scope.selection.target)
        )
          throw error;
        // Finish the already recorded creation before editing its settings.
        // This opens the same identity on its current route; it submits no input.
        await this.open(scope);
        if (
          !this.owns(scope) ||
          !scope.selection ||
          !("sessionId" in scope.selection.target)
        )
          throw new Error("native_chat_scope_changed");
        state = await update();
      }
      if (!this.owns(scope)) return;
      scope.selection = state;
      this.presentSelection(state);
      this.save();
      void this.readInputCapabilities(scope);
    })();
    scope.selectionChange = run;
    try {
      await run;
    } catch (error) {
      if (this.owns(scope)) {
        // Reload the head after conflicts or an unknown save outcome. It may
        // already contain the accepted edit, so do not guess a rollback value.
        const state =
          scope.selection &&
          (await this.bridge.selection!(scope.selection.target).catch(
            () => null
          ));
        if (!this.owns(scope)) return;
        if (state) {
          scope.selection = state;
          this.presentSelection(state);
        } else this.update({ effort: previousEffort });
        this.update({
          profileError:
            error instanceof Error &&
            /revision_changed|selection_conflict/.test(error.message)
              ? "This chat's model settings changed in another window. Review the selection and try again."
              : "Couldn't confirm the saved model and effort. Your draft is still here; retry the selection.",
        });
      }
    } finally {
      if (scope.selectionChange === run) scope.selectionChange = undefined;
      if (this.owns(scope)) this.update({ profileBusy: false });
    }
  }

  /** A deliberate send activates its saved route; opening history does not. */
  private async activateSelection(scope: Scope): Promise<Scope> {
    if (!this.remembersSelection) return scope;
    await scope.selectionReady;
    await scope.selectionChange;
    await scope.draftReady;
    if (
      !this.owns(scope) ||
      !scope.selection?.selection ||
      !scope.selection.available
    )
      throw new Error("native_chat_selection_unavailable");
    const id = scope.selection.selection.profileId;
    await this.readProfiles();
    if (!this.owns(scope)) throw new Error("native_chat_scope_changed");
    if (id === this.profileId) return scope;
    if (!this.bridge.selectProfile)
      throw new Error("native_chat_selection_unavailable");
    try {
      await this.commitProfile(
        id ? { kind: "new", id } : { kind: "default" },
        this.catalogConnection!
      );
    } catch (error) {
      if (
        this.owns(scope) &&
        error instanceof Error &&
        /native_chat_model_change_(?:failed_restored|restore_failed|recovery_pending)/.test(
          error.message
        )
      ) {
        this.replaceRouteScope(scope);
        this.update({
          acting: false,
          commandRunning: null,
          error: modelChangeRefusal(error),
        });
      }
      throw error;
    }
    if (!this.owns(scope)) throw new Error("native_chat_scope_changed");
    this.profileRead = undefined;
    this.profileId = id;
    return this.replaceRouteScope(scope);
  }

  /** Every asynchronous observer keeps the generation of its worker attachment. */
  private replaceRouteScope(previous: Scope): Scope {
    const next: Scope = {
      id: ++this.generation,
      requested: previous.attachment?.sessionId ?? previous.requested,
      sides: [],
      durable: previous.durable,
      earlierPages: previous.earlierPages,
      recentWindow: previous.recentWindow,
      live: new Map(),
      gaps: new Set(),
      observation: null,
      replay: true,
      selection: previous.selection,
      selectionReady: Promise.resolve(),
      firstInputId: previous.firstInputId,
      selectedAttachment: previous.selectedAttachment,
      pending: previous.pending,
      pendingGoalStart: previous.pendingGoalStart,
      pendingCommand: previous.pendingCommand,
      startsWithMessage: previous.startsWithMessage,
      submission: previous.submission,
      draftReady: previous.draftRestored ? Promise.resolve() : undefined,
      draftRestored: previous.draftRestored,
      pendingRestoreFailed: previous.pendingRestoreFailed,
      promotingDraft: previous.promotingDraft,
    };
    this.scope = next;
    this.queueRelease(previous);
    this.update({
      scope: next.id,
      observation: null,
      goal: null,
      goalReady: false,
      approvals: [],
      approvalError: null,
      questions: [],
      questionReady: false,
      questionError: null,
      librarySelection: null,
      librarySelectionError: null,
      queue: null,
      queueLoading: false,
      queueDraft: null,
      steering: false,
      pausing: null,
      sideChats: [],
      subagents: null,
      backgroundProcesses: null,
      effortAvailable: false,
      goalEffortAvailable: false,
    });
    void this.readEffortCapability(next);
    return next;
  }

  async focusChat(sessionId: string, profileId?: string): Promise<void> {
    if (!this.catalogConnection) return;
    if (this.remembersSelection) return this.select(sessionId);
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

  /**
   * Choose the connection for this workspace's chats. `initialSession` opens
   * that chat on it; `null` opens a new chat; omitted, the selected or last
   * chat continues.
   */
  async selectProfile(
    selection: NativeChatProfileSelection,
    initialSession?: string | null
  ): Promise<void> {
    if (this.remembersSelection && this.scope) {
      await this.saveSelection(
        this.scope,
        selection.kind === "default" ? null : selection.id,
        this.view.effort
      );
      return;
    }
    const connection = this.catalogConnection;
    if (
      !connection ||
      !this.bridge.selectProfile ||
      this.view.profileBusy ||
      this.view.acting
    )
      return;
    this.profileRead = undefined;
    if (this.view.selected && this.view.profiles?.modelChanges !== true) {
      this.update({
        profileError: modelChangeRefusal(
          new Error("native_chat_model_change_unsupported")
        ),
      });
      return;
    }
    const current = this.scope?.observation?.snapshot.current;
    if (current) {
      this.update({
        profileError: modelChangeRefusal(
          new Error(
            current.paused || current.disposition !== "running"
              ? "native_chat_model_change_retained_turn"
              : "native_chat_model_change_active_turn"
          )
        ),
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
      this.save();
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
        profileReadError: null,
      });
      void this.listChats();
      void this.readProfiles();
      // The open chat continues with the selected model on its next turn.
      const continuing =
        initialSession === undefined ? this.view.selected : initialSession;
      await this.select(
        initialSession === null ? null : (continuing ?? saved.selected),
        { reattach: !!continuing }
      );
    } catch (error) {
      if (this.catalogConnection === connection) {
        const reason = error instanceof Error ? error.message : "";
        // A failed destination launch can retire the old handles before Main
        // restores its route. Reattach only for that explicit outcome; a
        // refused choice leaves the live chat and its side chats untouched.
        if (reason.includes("native_chat_model_change_failed_restored")) {
          await this.select(this.view.selected, { reattach: true });
          if (this.catalogConnection !== connection) return;
          void this.readProfiles();
        }
        if (
          /native_chat_model_change_(?:restore_failed|recovery_pending)/.test(
            reason
          )
        ) {
          if (this.scope) this.scope.retiredAttachment = true;
          this.update({ profileError: null, error: modelChangeRefusal(error) });
          return;
        }
        this.update({
          profileError: modelChangeRefusal(error),
        });
      }
    } finally {
      if (this.catalogConnection === connection)
        this.update({ profileBusy: false });
    }
  }

  /** Open a saved chat, or a new one for `null`. A fixed chat stays put. */
  async select(
    sessionId: string | null,
    options: { reattach?: boolean } = {}
  ): Promise<void> {
    if (this.fixed) return;
    return this.bind(sessionId, options);
  }

  private async bind(
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
      sides: [],
      durable: [],
      earlierPages: [],
      live: new Map(),
      gaps: new Set(),
      observation: null,
      replay: true,
      ...(this.startingChat && { startsWithMessage: true as const }),
    };
    this.scope = scope;
    // Every per-chat field starts empty; only what belongs to the workspace
    // carries over to the next chat.
    this.update({
      ...EMPTY,
      ...pickSessionIndependent(this.view),
      scope: scope.id,
      selected: sessionId,
      ...(this.fixed && { effort: this.fixed.effort }),
      messages: retained?.messages ?? [],
      turnRecords: retained?.turnRecords ?? [],
      loading: this.remembersSelection || sessionId !== null || !!this.fixed,
    });
    if (this.remembersSelection) {
      const read = this.restoreSelection(scope, sessionId);
      scope.selectionReady = read;
      try {
        await read;
      } catch {
        if (this.owns(scope))
          this.update({
            loading: false,
            profileError:
              "Couldn't read this chat's saved model and effort. Reopen the chat to retry.",
          });
        return;
      }
      if (!this.owns(scope)) return;
    }
    void this.readEffortCapability(scope);
    if (sessionId === null && !this.fixed) {
      this.update({ loading: false });
      await this.readInputCapabilities(scope);
      await this.restoreDraft(scope);
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
          this.update({
            error: describe(
              error,
              this.fixed
                ? "Couldn't open the side chat."
                : "Couldn't open this chat."
            ),
          });
      }
    } finally {
      if (this.owns(scope)) {
        this.update({ loading: false });
        await this.restoreDraft(scope);
      }
    }
  }

  get canSubmit(): boolean {
    return (
      !!this.scope &&
      (!this.scope.draftReady || this.scope.draftRestored === true) &&
      !this.scope.pendingRestoreFailed &&
      !this.view.loading &&
      !this.view.profileBusy &&
      !this.view.permissionModeBusy &&
      !this.view.permissionModeUncertain &&
      (this.view.operatingRegime !== "plan" || !!this.bridge.submitInRegime) &&
      (!this.view.goalIntent || this.canStartGoal) &&
      (!!this.scope.pending ||
        !this.remembersSelection ||
        (!!this.scope.selection?.selection &&
          this.scope.selection.available)) &&
      !this.view.acting &&
      !this.view.commandRunning &&
      !this.view.revisionDraft &&
      !this.view.revisionSubmitting &&
      !this.view.attachmentReading &&
      (!this.view.attachmentDraft?.error || !!this.scope.pending) &&
      (!this.scope.selectedAttachment ||
        this.acceptsSelectedAttachment(this.scope.selectedAttachment) ||
        this.scope.pending?.attachment === this.scope.selectedAttachment) &&
      // A goal start needs no queue support here: the host queues it.
      (this.view.goalIntent ||
        !!this.scope.pending ||
        (this.view.steering
          ? this.canSteer &&
            this.scope.steeringTarget ===
              this.view.observation?.snapshot.current?.turnId
          : !this.needsQueue || !!this.bridge.enqueue))
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
      !this.view.goalIntent
    );
  }

  private acceptsAttachment(kind: AttachmentKind): boolean {
    return kind === "png"
      ? this.view.imageInput
      : kind === "image"
        ? this.view.selectedImageInput
        : kind === "file"
          ? this.view.fileInput
          : this.view.fileReferenceInput;
  }

  private acceptsSelectedAttachment(attachment: SelectedAttachment): boolean {
    return (
      this.acceptsAttachment(attachment.kind) &&
      (attachment.kind !== "reference" ||
        attachment.mimeType !== DIRECTORY_MIME_TYPE ||
        this.view.directoryReferenceInput)
    );
  }

  /**
   * Explicit raster intent stays an image even when its model or host cannot
   * accept it. Ordinary disk resources use references without eager reads.
   */
  private intake(file: Pick<File, "name" | "size" | "type">): AttachmentKind {
    const png =
      file.type === "image/png" || (!file.type && /\.png$/i.test(file.name));
    const direct = file.size <= MAX_ATTACHMENT_BYTES;
    const image =
      isSupportedImageType(file.type) ||
      (/^image\//i.test(file.type) && file.type !== "image/svg+xml") ||
      /\.(?:png|jpe?g|webp|gif)$/i.test(file.name) ||
      image_attachment_preview.mediaType(file) !== undefined;
    if (image) {
      if (this.bridge.submitSelectedImage && this.bridge.acceptsSelectedImage)
        return "image";
      return png && direct && this.view.imageInput ? "png" : "image";
    }
    if (
      this.view.fileReferenceInput &&
      file instanceof File &&
      this.bridge.canReferenceFile?.(file) === true
    )
      return "reference";
    return "file";
  }

  async pickTransferredAttachment(
    scopeId: number,
    resources: readonly TransferredAttachment[]
  ): Promise<void> {
    if (this.scope?.draftReady && !this.scope.draftRestored)
      await this.scope.draftReady;
    if (this.scope?.id !== scopeId || resources.length === 0) return;
    if (resources.length !== 1) {
      this.update({ attachmentNotice: "Attach one file at a time." });
      return;
    }
    const resource = resources[0];
    if (resource.kind === "directory") {
      if (
        !this.canAttach("reference") ||
        !this.view.directoryReferenceInput ||
        !(resource.file instanceof File) ||
        this.bridge.canReferenceFile?.(resource.file) !== true
      ) {
        this.update({ attachmentNotice: DIRECTORY_REFERENCE_UNAVAILABLE });
        return;
      }
      await this.readAttachment(scopeId, "reference", {
        kind: "reference",
        file: resource.file,
        directory: true,
      });
      return;
    }
    await this.attachFile(scopeId, resource.file);
  }

  /**
   * A picked File has the same intent and source custody as a dropped File.
   */
  pickFile(
    scopeId: number,
    file: BrowserAttachment & Pick<File, "type">
  ): Promise<void> {
    if (this.scope?.id !== scopeId) return Promise.resolve();
    return this.attachFile(scopeId, file);
  }

  private async attachFile(
    scopeId: number,
    file: BrowserAttachment & Pick<File, "type">
  ): Promise<void> {
    if (this.scope?.draftReady && !this.scope.draftRestored)
      await this.scope.draftReady;
    const kind = this.intake(file);
    if (kind === "image") {
      if (!(file instanceof File)) {
        this.update({
          attachmentNotice:
            "Keep the original image File to attach it in Desktop.",
        });
        return;
      }
      await this.readAttachment(scopeId, "image", { kind: "image", file });
      return;
    }
    if (!this.canAttach(kind)) {
      this.update({
        attachmentNotice: this.view.goalIntent
          ? "Use workspace file references for a goal, or remove the goal intent to attach this file."
          : this.view.loading || this.acceptsAttachment(kind)
            ? "Wait until the chat is ready to attach a file."
            : kind === "png"
              ? `${this.activeModelName() ?? "This model"} can't take images here. Choose a model that supports images to attach a PNG.`
              : "This chat cannot inspect a file attachment.",
      });
      return;
    }
    if (kind === "reference")
      await this.readAttachment(scopeId, kind, {
        kind: "reference",
        file: file as File,
      });
    else await this.pickAttachment(scopeId, kind, file);
  }

  pickAttachment(
    scopeId: number,
    kind: "png" | "file",
    file: BrowserAttachment
  ): Promise<void> {
    return this.scope?.draftReady && !this.scope.draftRestored
      ? this.scope.draftReady.then(() =>
          this.readAttachment(scopeId, kind, { kind: "file", file })
        )
      : this.readAttachment(scopeId, kind, { kind: "file", file });
  }

  pickLibraryImage(
    scopeId: number,
    name: string,
    readPng: (maxBytes: number) => Promise<ArrayBuffer>
  ): Promise<void> {
    const read = () =>
      this.readAttachment(scopeId, "png", {
        kind: "library",
        name,
        readPng,
      });
    return this.scope?.draftReady && !this.scope.draftRestored
      ? this.scope.draftReady.then(read)
      : read();
  }

  private async readAttachment(
    scopeId: number,
    kind: AttachmentKind,
    source: AttachmentSource
  ): Promise<void> {
    const scope = this.scope;
    if (
      !scope ||
      scope.id !== scopeId ||
      (kind !== "image" && !this.canAttach(kind)) ||
      (kind === "image" &&
        (this.view.acting || this.view.steering || this.view.goalIntent))
    )
      return;
    const read = {};
    scope.attachmentRead = read;
    const name = (
      source.kind === "library" ? source.name : source.file.name
    ).slice(0, 256);
    this.update({
      attachmentReading: true,
      attachmentNotice: null,
      error: null,
    });
    const ownsRead = () => this.owns(scope) && scope.attachmentRead === read;
    try {
      if (source.kind === "image") {
        const { file } = source;
        if (!file.size || file.size > 20 * 1024 * 1024)
          throw new Error("selected_image_size_limit");
        const mimeType =
          image_attachment_preview.mediaType(file) ??
          image_attachment_preview.mediaType({ name: file.name, type: "" });
        const original = scope.selectedAttachment ?? scope.pending?.attachment;
        if (
          original?.kind === "image" &&
          (original.file === file || original.originalFile === file)
        )
          scope.selectedAttachment = original;
        else {
          if (scope.pending || scope.pendingRestoreFailed)
            await this.discardPending(scope);
          // Freeze the original at selection, before a mutable disk path can
          // change. This snapshot is input; display posters never replace it.
          const sourceBytes = await Blob.prototype.arrayBuffer.call(
            Blob.prototype.slice.call(file, 0, 20 * 1024 * 1024 + 1)
          );
          if (
            sourceBytes.byteLength !== file.size ||
            sourceBytes.byteLength > 20 * 1024 * 1024
          )
            throw new Error("selected_image_changed");
          if (!ownsRead()) return;
          const frozen = new File([sourceBytes], file.name, {
            type: mimeType ?? file.type,
            lastModified: file.lastModified,
          });
          scope.selectedAttachment = Object.freeze({
            kind: "image",
            name,
            file: frozen,
            originalFile: source.originalFile ?? file,
            ...(mimeType && { mimeType }),
          });
          if (scope.pending?.attachment) scope.pending = undefined;
        }
        this.update({
          attachmentDraft: {
            kind,
            name,
            size: file.size,
            ...(mimeType && { mimeType }),
          },
          ...(!this.view.selectedImageInput && {
            attachmentNotice:
              "This connection cannot use the attached image. Your whole draft is kept; choose a compatible model.",
          }),
        });
        this.saveDraftAttachment(scope.selectedAttachment);
        return;
      }
      if (source.kind === "reference") {
        // By reference: only a bounded local raster or video still is decoded.
        const { file } = source;
        const directory = source.directory === true;
        const mimeType = directory
          ? DIRECTORY_MIME_TYPE
          : (image_attachment_preview.mediaType(file) ??
            video_attachment.mediaType(file));
        const original = scope.selectedAttachment ?? scope.pending?.attachment;
        const preview = directory
          ? undefined
          : original?.kind === "reference" && original.file === file
            ? original.preview
            : video_attachment.isVideo(file)
              ? ((await video_attachment.probe(file)) ?? undefined)
              : await image_attachment_preview.probe(file);
        if (!ownsRead()) return;
        if (
          original?.kind === "reference" &&
          original.file === file &&
          (original.mimeType === DIRECTORY_MIME_TYPE) === directory
        )
          scope.selectedAttachment = original.referenceId
            ? original
            : { ...original, referenceId: crypto.randomUUID() };
        else {
          if (scope.pending || scope.pendingRestoreFailed)
            await this.discardPending(scope);
          scope.selectedAttachment = Object.freeze({
            kind: "reference" as const,
            name,
            referenceId: crypto.randomUUID(),
            file,
            ...(mimeType && { mimeType }),
            ...(preview && { preview }),
          });
          if (scope.pending?.attachment) scope.pending = undefined;
        }
        this.update({
          attachmentDraft: {
            kind,
            name,
            ...(!directory && { size: file.size }),
            ...(mimeType && { mimeType }),
            ...(preview && { preview }),
          },
        });
        this.saveDraftAttachment(scope.selectedAttachment);
        return;
      }
      if (kind === "reference" || kind === "image")
        throw new Error("invalid_file_attachment");
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
      const previous =
        original && original.kind !== "reference" && original.kind !== "image"
          ? new Uint8Array(original.bytes)
          : undefined;
      if (
        original?.kind !== kind ||
        (kind === "file" && original.name !== name) ||
        previous?.byteLength !== bytes.byteLength ||
        !new Uint8Array(bytes).every((byte, index) => byte === previous[index])
      ) {
        if (scope.pending || scope.pendingRestoreFailed)
          await this.discardPending(scope);
        scope.selectedAttachment = { kind, name, bytes };
        if (scope.pending?.attachment) scope.pending = undefined;
      } else scope.selectedAttachment = original;
      this.update({ attachmentDraft: { kind, name, size: bytes.byteLength } });
      this.saveDraftAttachment(scope.selectedAttachment);
    } catch (error) {
      if (ownsRead()) {
        if (source.kind === "library") {
          this.update({
            attachmentNotice:
              "Couldn't add this Library image. Your current draft is still here.",
          });
          return;
        }
        await this.discardPending(scope);
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

  /** Display bytes only. A large original keeps a card without decoding it here. */
  attachmentPreview(): Blob | null {
    const attachment = this.scope?.selectedAttachment;
    if (attachment?.kind === "image")
      return attachment.file.size <= image_attachment_preview.MAX_SOURCE_BYTES
        ? attachment.file
        : null;
    return attachment?.kind === "png"
      ? new Blob([attachment.bytes], { type: "image/png" })
      : null;
  }

  removeAttachment(scopeId: number): void {
    const scope = this.scope;
    if (!scope || scope.id !== scopeId || this.view.acting) return;
    scope.attachmentRead = undefined;
    scope.selectedAttachment = undefined;
    void this.discardPending(scope).catch(() => {});
    this.saveDraftAttachment(null);
    this.update({
      attachmentDraft: null,
      attachmentReading: false,
      attachmentNotice: null,
      error: null,
    });
  }

  /** A mode change is native authority, separate from new-chat model defaults. */
  async selectPermissionMode(mode: NativeChatPermissionMode): Promise<void> {
    let scope = this.scope;
    if (
      !scope ||
      this.fixed ||
      !this.view.permissionModeAvailable ||
      !this.bridge.permissionMode ||
      !this.bridge.setPermissionMode ||
      !this.bridge.reviewPermissionMode ||
      this.view.permissionModeBusy ||
      this.view.acting ||
      this.view.submitting ||
      this.view.profileBusy ||
      this.view.loading
    )
      return;
    scope.permissionRead = {};
    this.update({ permissionModeBusy: true, permissionModeError: null });
    try {
      if (this.remembersSelection) scope = await this.activateSelection(scope);
      if (!this.owns(scope)) return;
      // Creating this exact chat submits no model work. Full access never
      // becomes a workspace/global default or an unbound renderer preference.
      await this.open(scope);
      if (!this.owns(scope) || !scope.attachment) return;
      const current = await this.bridge.permissionMode(
        scope.attachment.attachmentId
      );
      if (!this.owns(scope)) return;
      if (current.mode === mode && !scope.pendingPermission) {
        this.update({
          permissionMode: current,
          permissionModeUncertain: false,
        });
        return;
      }
      const pending =
        scope.pendingPermission?.mode === mode
          ? scope.pendingPermission
          : {
              mode,
              revision: current.revision,
              requestId: crypto.randomUUID(),
              review: undefined as
                | { reviewId: string; confirmed: boolean }
                | undefined,
            };
      scope.pendingPermission = pending;
      if (
        mode === "full_access" &&
        current.mode !== "full_access" &&
        !pending.review
      ) {
        const review = await this.bridge.reviewPermissionMode(
          scope.attachment.attachmentId,
          pending.revision,
          pending.requestId
        );
        if (!this.owns(scope)) return;
        const confirmed = new Promise<boolean>((resolve) => {
          scope!.permissionConfirmation = { review, resolve };
        });
        this.update({ permissionModeReview: review });
        const accepted = await confirmed;
        if (!this.owns(scope)) return;
        scope.permissionConfirmation = undefined;
        this.update({ permissionModeReview: null });
        if (!accepted) {
          await this.bridge
            .setPermissionMode(
              scope.attachment.attachmentId,
              pending.revision,
              pending.requestId,
              mode,
              { reviewId: review.reviewId, confirmed: false }
            )
            .catch(() => {});
          scope.pendingPermission = undefined;
          return;
        }
        pending.review = { reviewId: review.reviewId, confirmed: true };
      }
      const next = await this.bridge.setPermissionMode(
        scope.attachment.attachmentId,
        pending.revision,
        pending.requestId,
        mode,
        pending.review
      );
      if (!this.owns(scope)) return;
      scope.pendingPermission = undefined;
      this.update({
        permissionMode: next ?? current,
        permissionModeUncertain: false,
      });
    } catch (error) {
      if (this.owns(scope)) {
        const busy =
          error instanceof Error && /permission_mode_busy/.test(error.message);
        const changed =
          error instanceof Error &&
          /permission_mode_revision_changed/.test(error.message);
        const reviewChanged =
          error instanceof Error &&
          /permission_mode_(review_changed|confirmation_required)/.test(
            error.message
          );
        if (busy || changed) scope.pendingPermission = undefined;
        else if (reviewChanged && scope.pendingPermission)
          scope.pendingPermission.review = undefined;
        this.update({
          permissionModeUncertain: !busy && !changed && !reviewChanged,
          permissionModeError: busy
            ? "Finish or stop this chat's accepted work and background processes before changing access."
            : changed
              ? "This chat's access changed in another window. Review it and try again."
              : reviewChanged
                ? "Full access confirmation expired. Choose Full access again to review it."
                : "Couldn't confirm this chat's access. Check access before sending.",
        });
        await this.readPermissionMode(scope, true);
      }
    } finally {
      if (this.owns(scope)) this.update({ permissionModeBusy: false });
    }
  }

  answerPermissionModeReview(confirmed: boolean): void {
    this.scope?.permissionConfirmation?.resolve(confirmed);
  }

  async checkPermissionMode(): Promise<void> {
    const scope = this.scope;
    if (!scope?.attachment || this.view.permissionModeBusy) return;
    this.update({ permissionModeBusy: true });
    await this.readPermissionMode(scope, true);
    if (this.owns(scope)) this.update({ permissionModeBusy: false });
  }

  private async readPermissionMode(scope: Scope, force = false): Promise<void> {
    if (
      (!force && this.view.permissionModeBusy) ||
      this.fixed ||
      !this.bridge.permissionMode ||
      !this.bridge.acceptsPermissionMode ||
      !scope.attachment
    )
      return;
    const read = {};
    scope.permissionRead = read;
    const attachment = scope.attachment;
    try {
      const available = await this.bridge.acceptsPermissionMode();
      const state = available
        ? await this.bridge.permissionMode(attachment.attachmentId)
        : null;
      if (
        this.owns(scope) &&
        scope.attachment === attachment &&
        scope.permissionRead === read &&
        (force || !this.view.permissionModeBusy)
      )
        this.update({
          permissionMode: state,
          permissionModeUncertain: false,
          ...(this.view.permissionModeUncertain && {
            permissionModeError: null,
          }),
          permissionModeAvailable:
            available && state?.available.includes("full_access") === true,
        });
    } catch {
      if (
        this.owns(scope) &&
        scope.attachment === attachment &&
        scope.permissionRead === read
      )
        this.update({
          permissionModeAvailable: false,
          permissionModeUncertain: true,
          permissionModeError:
            "Couldn't read this chat's access. Check access before sending.",
        });
    }
  }

  private async readInputCapabilities(
    scope: Scope
  ): Promise<
    (Record<AttachmentKind, boolean> & { directory: boolean }) | null
  > {
    const attachment = scope.attachment;
    const read = {};
    scope.attachmentCapabilityRead = read;
    const [
      png,
      file,
      library,
      reference,
      directory,
      image,
      queuedText,
      permissionMode,
    ] = await Promise.all([
      this.bridge.submitImage && this.bridge.acceptsPng?.().catch(() => false),
      this.bridge.submitFile && this.bridge.acceptsFile?.().catch(() => false),
      this.libraryPicker &&
        this.bridge.submitWithLibrarySelection &&
        this.bridge.librarySelections &&
        this.bridge.answerLibrarySelection &&
        this.bridge.acceptsLibrarySelection?.().catch(() => false),
      this.bridge.submitFileReference &&
        this.bridge.canReferenceFile &&
        this.bridge.acceptsFileReference?.().catch(() => false),
      this.bridge.submitFileReference &&
        this.bridge.canReferenceFile &&
        this.bridge.acceptsDirectoryReference?.().catch(() => false),
      this.bridge.submitSelectedImage &&
        this.bridge.acceptsSelectedImage?.().catch(() => false),
      this.bridge.acceptsQueuedTextReplacement?.().catch(() => false),
      !this.fixed &&
        this.bridge.permissionMode &&
        this.bridge.setPermissionMode &&
        this.bridge.acceptsPermissionMode?.().catch(() => false),
    ]);
    if (
      !this.owns(scope) ||
      scope.attachment !== attachment ||
      scope.attachmentCapabilityRead !== read
    )
      return null;
    scope.librarySelectionAvailable = library === true;
    scope.queuedTextReplacement = queuedText === true;
    const directoryAvailable = reference === true && directory === true;
    const draft = this.view.attachmentDraft;
    this.update({
      permissionModeAvailable:
        permissionMode === true &&
        (!attachment ||
          this.view.permissionMode?.available.includes("full_access") === true),
      imageInput: png === true,
      selectedImageInput: image === true,
      fileInput: file === true,
      fileReferenceInput: reference === true,
      directoryReferenceInput: directoryAvailable,
      ...(directoryAvailable &&
        draft?.mimeType === DIRECTORY_MIME_TYPE &&
        draft.error === DIRECTORY_REFERENCE_UNAVAILABLE && {
          attachmentDraft: { ...draft, error: undefined },
        }),
    });
    return {
      png: png === true,
      image: image === true,
      file: file === true,
      reference: reference === true,
      directory: directoryAvailable,
    };
  }

  /** A missing new-Main facet must never turn a folder into a byte upload. */
  private async requireDirectoryReference(
    scope: Scope,
    retained: Scope["pending"]
  ): Promise<boolean> {
    this.update({ acting: true });
    try {
      const capabilities = await this.readInputCapabilities(scope);
      if (!this.owns(scope)) throw new Error("native_chat_not_ready");
      if (capabilities?.directory) return true;
      // A lost response can still be reconciled through its exact existing
      // receipt. This permits observation only, never another submission.
      if (retained && scope.pending === retained && scope.attachment)
        return false;
      this.update({ error: DIRECTORY_REFERENCE_UNAVAILABLE });
      throw new Error("native_chat_directory_reference_unavailable");
    } finally {
      if (this.owns(scope)) this.update({ acting: false });
    }
  }

  /** The name the model picker shows for the chat's model, when known. */
  private activeModelName(): string | null {
    const profiles = this.view.profiles;
    const active = profiles?.active;
    if (!active) return null;
    return (
      (
        profiles.choices.find((choice) => choice.id === active) ??
        profiles.saved.find((choice) => choice.id === active)
      )?.model ?? null
    );
  }

  /** Negotiated harness support; absent while the connection is being checked. */
  get ultraAvailability(): boolean | undefined {
    if (!this.offers("delegation")) return false;
    if (!this.scope?.effortKnown) return undefined;
    return this.view.goalIntent
      ? this.view.goalEffortAvailable
      : this.view.effortAvailable;
  }

  /** Before negotiation, the product catalogue can offer its installed harness. */
  private ultraOffered(): boolean {
    const profiles = this.view.profiles;
    const active = profiles?.active;
    if (!this.offers("delegation")) return false;
    return (
      this.ultraAvailability ??
      (!!active &&
        !!(
          profiles?.choices.find((choice) => choice.id === active) ??
          profiles?.saved.find((choice) => choice.id === active)
        )?.ultra)
    );
  }

  private readEffortCapability(scope: Scope): Promise<void> {
    scope.effortKnown = false;
    const read: Promise<void> = Promise.all([
      this.bridge.submitInRegime &&
        this.bridge.acceptsEffort?.().catch(() => false),
      this.bridge.startGoal &&
        this.bridge.acceptsGoalEffort?.().catch(() => false),
    ]).then(([supported, goalSupported]) => {
      if (!this.owns(scope) || scope.effortRead !== read) return;
      scope.effortKnown = true;
      this.update({
        effortAvailable: supported === true,
        goalEffortAvailable: goalSupported === true,
        ...(this.view.effort === "ultra" &&
          (this.view.goalIntent
            ? goalSupported !== true
            : supported !== true) && {
            error: "Ultra effort is unavailable on this connection.",
          }),
      });
    });
    scope.effortRead = read;
    return read;
  }

  /** Keep the person's Ultra choice exact; an older host must refuse it. */
  private async requireUltra(scope: Scope, goal: boolean): Promise<void> {
    // A delayed capability read must not let the next UI choice rewrite the
    // request whose Send already began.
    this.update({ acting: true });
    try {
      let read: Promise<void> | undefined;
      do {
        read = scope.effortRead;
        await read;
      } while (this.owns(scope) && scope.effortRead !== read);
      if (!this.owns(scope)) throw new Error("native_chat_not_ready");
      if (
        !this.offers("delegation") ||
        (goal ? !this.view.goalEffortAvailable : !this.view.effortAvailable)
      ) {
        const error = goal
          ? "Ultra is unavailable for goals on this connection."
          : "Ultra effort is unavailable on this connection.";
        this.update({ error });
        throw new Error(error);
      }
    } finally {
      if (this.owns(scope)) this.update({ acting: false });
    }
  }

  get canOrganizeChats(): boolean {
    return (
      this.offers("catalog") &&
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
    // The host titles a new chat in the background; until then it is new.
    return title ?? NEW_CHAT_TITLE;
  }

  beginRename(): void {
    const basis = this.view.catalogEntry;
    if (basis && !this.view.catalogChanging)
      this.update({
        // Start from the title the person sees, so it can be selected whole.
        catalogDraft: { text: basis.title ?? NEW_CHAT_TITLE, basis },
        titleArrived: null,
        catalogEntryError: null,
      });
  }

  /** The arrived title was revealed; showing it again does not repeat that. */
  acknowledgeTitle(): void {
    if (this.view.titleArrived !== null) this.update({ titleArrived: null });
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
    // Leaving the field without a change is not a rename; an untitled chat
    // keeps waiting for its generated title.
    if (
      (text || null) === (draft.basis.title ?? null) ||
      (draft.basis.title === null && text === NEW_CHAT_TITLE)
    ) {
      this.cancelRename();
      return;
    }
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

  readonly readAttachmentPreview = async (previewId: string): Promise<Blob> => {
    const scope = this.scope;
    const attachment = scope?.attachment;
    const read = this.bridge.readAttachmentPreview;
    const find = () =>
      this.view.messages
        .flatMap((message) =>
          message.role === "user" ? (message.attachments ?? []) : []
        )
        .find(
          (entry) =>
            entry.previewId === previewId &&
            isSupportedImageType(entry.mimeType)
        );
    const original = find();
    if (!scope || !attachment || !read || !original)
      throw new Error("native_chat_input_image_unavailable");
    const bytes = await read.call(
      this.bridge,
      attachment.attachmentId,
      previewId
    );
    if (
      !this.owns(scope) ||
      find()?.mimeType !== original.mimeType ||
      !(bytes instanceof ArrayBuffer) ||
      bytes.byteLength === 0 ||
      bytes.byteLength > 20 * 1024 * 1024
    )
      throw new Error("native_chat_input_image_unavailable");
    return new Blob([bytes], { type: original.mimeType });
  };

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

  /**
   * Whether this chat can open a side chat: an attached chat, not itself bound
   * to a fixed session, whose connection offers side chats.
   */
  get canOpenSideChat(): boolean {
    return this.offersSideChat && !this.view.profileBusy;
  }

  /** Whether this attached chat's connection can ever open a side chat. */
  private get offersSideChat(): boolean {
    return (
      !this.fixed &&
      !!this.scope?.attachment &&
      !!this.bridge.openSideChat &&
      !!this.bridge.closeSideChat &&
      this.offers("side_chat")
    );
  }

  /**
   * Open a new side chat of this chat and show it; with `text`, send that as
   * its first message. This chat itself is unchanged. A side chat starts from
   * this chat's committed conversation, model and effort, and shows only its
   * own messages. It is discarded when it closes or this chat is switched or
   * released. A refused open reports why here and ends that side chat.
   */
  async openSideChat(text?: string): Promise<void> {
    let scope = this.scope;
    let parent = scope?.attachment;
    const open = this.bridge.openSideChat;
    if (!scope || !parent || !open || !this.canOpenSideChat) {
      if (scope) this.update({ error: SIDE_CHAT_UNAVAILABLE });
      throw new Error(SIDE_CHAT_UNAVAILABLE);
    }
    if (this.remembersSelection) {
      try {
        scope = await this.activateSelection(scope);
        await this.open(scope);
        parent = this.attachment(scope);
      } catch (error) {
        if (this.owns(scope))
          this.update({ error: describe(error, SIDE_CHAT_UNAVAILABLE) });
        throw error;
      }
    }
    const opened = open.call(this.bridge, parent.attachmentId);
    const id = crypto.randomUUID();
    const chat = new NativeChatController(
      this.bridge,
      undefined,
      undefined,
      undefined,
      this.libraryPicker,
      {
        open: () => opened,
        effort: this.view.effort === "ultra" ? "xhigh" : this.view.effort,
        profiles: this.view.profiles,
        sent: () => this.useSide(scope, side),
      }
    );
    const side: SideChatScope = {
      chat,
      opened,
      shown: Object.freeze({ id, chat, focus: 1 }),
      used: ++this.sideUse,
    };
    // A side chat's draft ends with it.
    chat.keepDrafts(new ComposerDrafts(null, null), "side");
    scope.sides.push(side);
    const ready = opened.then(
      () => true,
      (error: unknown) => {
        if (!this.removeSide(scope, side)) return false;
        chat.disconnect();
        if (this.owns(scope))
          this.update({
            error: describeSideRefusal(error),
          });
        return false;
      }
    );
    chat.connect(null);
    this.publishSides(scope, { error: null });
    if (!text?.trim()) return;
    if (!(await ready)) return;
    await chat.opened();
    if (!this.owns(scope) || !scope.sides.includes(side)) return;
    await chat.submit(text);
  }

  /**
   * Show the side chat of this chat used most recently, or open a new one
   * when none is open.
   */
  async showSideChat(): Promise<void> {
    const scope = this.scope;
    const latest = scope?.sides.reduce<SideChatScope | undefined>(
      (found, side) => (found && found.used > side.used ? found : side),
      undefined
    );
    if (!scope || !latest) return this.openSideChat();
    latest.shown = Object.freeze({
      ...latest.shown,
      focus: latest.shown.focus + 1,
    });
    this.useSide(scope, latest);
    this.publishSides(scope, { error: null });
  }

  /** End side chat `id` of this chat; its siblings stay open. */
  async closeSideChat(id: string): Promise<void> {
    const scope = this.scope;
    const side = scope?.sides.find((candidate) => candidate.shown.id === id);
    if (!scope || !side) return;
    this.removeSide(scope, side);
    try {
      await this.releaseSide(side);
    } catch {
      if (this.owns(scope))
        this.update({
          error:
            "Couldn't confirm that the side chat closed yet. Closing continues in the background.",
        });
    }
  }

  private sideUse = 0;

  private useSide(scope: Scope, side: SideChatScope): void {
    if (scope.sides.includes(side)) side.used = ++this.sideUse;
  }

  /** Take `side` out of `scope`; false when it was already gone. */
  private removeSide(scope: Scope, side: SideChatScope): boolean {
    const index = scope.sides.indexOf(side);
    if (index < 0) return false;
    scope.sides.splice(index, 1);
    this.publishSides(scope);
    return true;
  }

  private publishSides(
    scope: Scope,
    change: Partial<NativeChatView> = {}
  ): void {
    if (!this.owns(scope)) return;
    this.update({
      ...change,
      sideChats: scope.sides.map((side) => side.shown),
    });
  }

  /** End a side chat: its view goes first, then its session is discarded. */
  private async releaseSide(side: SideChatScope): Promise<void> {
    side.chat.disconnect();
    const attachment = await side.opened.catch(() => null);
    if (attachment) await this.bridge.closeSideChat?.(attachment.attachmentId);
  }

  /**
   * The title a side chat shows: the one the host generated from its first
   * message, or the side chat label until it arrives.
   */
  sideChatTitle(): string {
    return this.view.observation?.snapshot.side?.title ?? SIDE_CHAT_TITLE;
  }

  get canSteer(): boolean {
    const turn = this.view.observation?.snapshot.current;
    return (
      !!this.bridge.steer &&
      !this.view.attachmentDraft &&
      !this.scope?.attachmentRead &&
      !!turn &&
      !turn.cancelled &&
      (turn.disposition === "running" || turn.disposition === "suspended")
    );
  }

  /** Whether this chat's connection can ever start a goal. */
  get offersGoals(): boolean {
    return (
      !!this.scope &&
      !!this.bridge.goal &&
      !!this.bridge.startGoal &&
      this.offers("goals")
    );
  }

  /**
   * Why a goal cannot start in this chat now, or `null`. A chat holds one
   * goal at a time, active or waiting to start. The current turn and queue
   * never matter: a goal started while the agent works waits in the queue.
   */
  get goalStartRefusal(): string | null {
    const scope = this.scope;
    if (!scope || !this.offersGoals) return GOALS_UNAVAILABLE;
    if (scope.pendingGoalStart) return null;
    if (scope.awaitingGoalId || scope.observation?.snapshot.pendingGoalId)
      return "A goal is already waiting to start in this chat.";
    const goal = this.view.goal?.goal;
    if (
      goal &&
      (goal.reservation ||
        (goal.state.status !== "complete" && goal.state.status !== "cleared"))
    )
      return "This chat already has a goal. Clear it before starting another.";
    return null;
  }

  get canStartGoal(): boolean {
    if (this.view.permissionModeBusy || this.view.permissionModeUncertain)
      return false;
    const scope = this.scope;
    return (
      !!scope &&
      !this.view.loading &&
      !this.view.acting &&
      (!scope.attachment || this.view.goalReady) &&
      this.goalStartRefusal === null
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
    return !!(await this.startGoalInScope(request, maximumUsd));
  }

  private async startGoalInScope(
    request: Omit<NativeChatGoalRequest, "operatingRegime">,
    maximumUsd?: string
  ): Promise<Scope | false> {
    let scope = this.scope;
    if (!scope || !this.canStartGoal || !this.bridge.startGoal) return false;
    if (!this.remembersSelection && request.effort === "ultra") {
      try {
        await this.requireUltra(scope, true);
      } catch {
        return false;
      }
      if (!this.canStartGoal) return false;
    }
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
          (!this.remembersSelection &&
            !this.view.observation?.snapshot.goalSpendingAvailable))
      )
        throw new Error("unavailable");
    } catch {
      this.update({
        error:
          "Enter a positive USD spending limit on a connection that supports enforced goal spending.",
      });
      return false;
    }
    const problem = goalRequestProblem(
      request,
      this.view,
      !this.remembersSelection
    );
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
    if (scope.pendingGoalStart && scope.attachment) {
      const accepted = await this.bridge
        .inputReceipt(
          scope.attachment.attachmentId,
          scope.pendingGoalStart.inputId
        )
        .catch(() => null);
      if (accepted && this.owns(scope)) {
        scope.pendingGoalStart = undefined;
        scope.firstInputId = undefined;
        scope.awaitingGoalId = accepted.inputId;
        scope.replay = true;
        await this.refresh(scope);
        return scope;
      }
    }
    const pending: NonNullable<Scope["pendingGoalStart"]> =
      scope.pendingGoalStart?.key === key
        ? scope.pendingGoalStart
        : { key, inputId: crypto.randomUUID() };
    scope.pendingGoalStart = pending;
    this.update({ acting: true, error: null });
    try {
      scope = await this.activateSelection(scope);
      await this.open(scope);
      if (this.remembersSelection) {
        // The displayed choice is intentionally lazy. Its route can differ
        // from the worker whose capabilities were observed while reading chat.
        await scope.refreshing;
        await this.readEffortCapability(scope);
        const attachment = this.attachment(scope);
        const previous = scope.observation;
        await this.refresh(scope);
        if (
          !this.owns(scope) ||
          scope.attachment !== attachment ||
          !scope.observation ||
          scope.observation === previous
        )
          throw new Error("native_chat_goal_observation_unavailable");
        const routeProblem =
          request.maxCostMills !== undefined &&
          !scope.observation.snapshot.goalSpendingAvailable
            ? "Enter a positive USD spending limit on a connection that supports enforced goal spending."
            : goalRequestProblem(request, this.view);
        if (routeProblem) {
          scope.pendingGoalStart = undefined;
          this.update({ error: routeProblem });
          return false;
        }
      }
      if (scope.firstInputId && !pending.selectionRevision)
        pending.inputId = scope.firstInputId;
      pending.selectionRevision ??=
        scope.selection && scope.selection.revision > 0
          ? scope.selection.revision
          : undefined;
      const attachment = this.attachment(scope);
      const receipt = await this.bridge.startGoal(
        attachment.attachmentId,
        pending.inputId,
        {
          ...payload,
          ...(pending.selectionRevision !== undefined && {
            selectionRevision: pending.selectionRevision,
          }),
        }
      );
      if (
        receipt.disposition === "withdrawn" ||
        receipt.disposition === "superseded"
      ) {
        scope.pendingGoalStart = undefined;
        throw new Error("native_chat_goal_start_unavailable");
      }
      scope.pendingGoalStart = undefined;
      scope.firstInputId = undefined;
      if (!this.owns(scope)) return false;
      scope.awaitingGoalId =
        this.view.goal?.goal?.goalId === receipt.inputId
          ? undefined
          : receipt.inputId;
      scope.replay = true;
      await this.refresh(scope);
      return scope;
    } catch (error) {
      if (this.owns(scope)) {
        // Only a start the host may have accepted keeps its input id, so a
        // retry cannot start the goal twice. Any other failure is a refusal
        // made before acceptance and frees the composer.
        const unverified =
          error instanceof Error &&
          GOAL_START_UNVERIFIED.some((code) => error.message.includes(code));
        if (!unverified) scope.pendingGoalStart = undefined;
        this.update({
          error:
            error instanceof Error &&
            error.message.includes("goal_child_allowance_unavailable")
              ? "Increase the inference allowance to fund an Ultra review, or choose Standard."
              : error instanceof Error &&
                  error.message.includes("goal_named_child_unavailable")
                ? "Choose an available named subagent from this chat."
                : unverified
                  ? "Couldn't confirm the goal start. Your draft is still here."
                  : goalStartRefusal(error),
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

  /**
   * Choose the regime of the next message. Plan is per message: while a turn
   * runs it applies to the next message, which waits in the queue. A
   * steering message joins the running turn under that turn's regime, so
   * choosing Plan turns steering off and says so.
   */
  selectOperatingRegime(operatingRegime: NativeChatOperatingRegime): void {
    if (
      (operatingRegime === "plan" && !this.bridge.submitInRegime) ||
      this.view.acting
    )
      return;
    const queues = operatingRegime === "plan" && this.view.steering;
    if (queues) this.leaveSteering();
    this.update({
      operatingRegime,
      ...(queues && {
        error: null,
        commandNotice: PLAN_QUEUES_STEERING,
        commandFork: null,
      }),
    });
    this.saveDraftModes();
  }

  /**
   * Turn goal entry on or off. Goal entry is refused only for a chat that
   * cannot start a goal now, with the reason; a goal started while a turn
   * runs waits in the queue. A goal is never sent as steering.
   */
  selectGoalIntent(enabled: boolean): void {
    if (this.view.acting) return;
    if (!enabled) {
      if (this.scope?.pendingGoalStart) return;
      this.update({ goalIntent: false, error: null });
      this.saveDraftModes();
      return;
    }
    if (this.view.attachmentDraft) {
      this.update({
        error: "Send or remove the attachment before starting a goal.",
      });
      return;
    }
    const refusal = this.goalStartRefusal;
    if (refusal || !this.canStartGoal) {
      this.update({
        error: refusal ?? "This chat is still loading. Try again in a moment.",
      });
      return;
    }
    if (this.view.steering) this.leaveSteering();
    this.update({ goalIntent: true, error: null });
    this.saveDraftModes();
  }

  private leaveSteering(): void {
    const scope = this.scope;
    if (scope) {
      scope.steeringTarget = undefined;
      scope.pendingSteering = undefined;
    }
    this.update({ steering: false });
  }

  selectEffort(effort: NativeChatEffort): void {
    if (this.remembersSelection && this.scope) {
      const scope = this.scope;
      if (
        (effort !== "ultra" || this.ultraOffered()) &&
        !this.view.acting &&
        !this.view.steering
      ) {
        const save = () => {
          if (!this.owns(scope) || !scope.selection?.selection) return;
          return this.saveSelection(
            scope,
            scope.selection.selection.profileId,
            effort
          );
        };
        if (scope.selection?.selection) void save();
        else void scope.selectionReady?.then(save).catch(() => {});
      }
      return;
    }
    if (
      (effort !== "ultra" || this.ultraOffered()) &&
      !this.view.acting &&
      !this.view.steering
    )
      this.update({ effort });
  }

  async submit(text: string, scopeId = this.view.scope): Promise<void> {
    const scope = this.scope;
    if (!scope || scope.id !== scopeId)
      throw new Error("native_chat_not_ready");
    const submission = {};
    scope.submission = submission;
    this.update({ submitting: true });
    try {
      await this.submitInScope(text, scopeId);
    } finally {
      // Route activation can replace this scope during the same send. A real
      // chat switch starts without this token and must keep its own feedback.
      const current = this.scope;
      if (current?.submission === submission) {
        current.submission = undefined;
        this.update({ submitting: false });
      }
    }
  }

  private async submitInScope(text: string, scopeId: number): Promise<void> {
    let scope = this.scope;
    if (!scope || scope.id !== scopeId || this.view.profileBusy)
      throw new Error("native_chat_not_ready");
    if (!scope.draftRestored) await this.restoreDraft(scope);
    if (!this.owns(scope) || scope.pendingRestoreFailed)
      throw new Error("native_chat_retry_storage_unavailable");
    const normalized = text
      .trim()
      .replace(/^\/(?:plan|goal)\s+/, "")
      .trim();
    const original =
      this.retainedSend(scope, text) ?? this.retainedSend(scope, normalized);
    if (scope.pending && !original) await this.discardPending(scope);
    if (original && !this.view.acting && !this.view.loading) {
      this.update({ acting: true });
      try {
        await this.open(scope);
        const receipt = await this.bridge
          .inputReceipt(this.attachment(scope).attachmentId, original.inputId)
          .catch((error: unknown) => {
            if (error instanceof Error && error.message === "input_unavailable")
              return null;
            throw error;
          });
        if (receipt) {
          await this.completeSubmission(scope, original, receipt);
          return;
        }
      } finally {
        if (this.owns(scope)) this.update({ acting: false });
      }
      if (!this.owns(scope)) throw new Error("native_chat_scope_changed");
      if (original.missingAttachment) {
        this.update({
          error:
            "The previous send wasn't accepted, and its original file reference is unavailable. Attach it again to send this draft.",
        });
        throw new Error("native_chat_pending_attachment_unavailable");
      }
    }
    const side = /^\/side(?:\s+|$)/.exec(text.trim());
    if (side) {
      const message = text.trim().slice(side[0].length);
      return message ? this.openSideChat(message) : this.showSideChat();
    }
    this.fixed?.sent?.();
    const intent = /^\/(plan|goal)(?:\s+|$)/.exec(text.trim());
    if (intent) {
      if (intent[1] === "plan") {
        if (!this.bridge.submitInRegime)
          throw new Error("Planning is unavailable in this chat.");
        this.selectOperatingRegime("plan");
      } else {
        if (!this.view.goalIntent) this.selectGoalIntent(true);
        if (!this.view.goalIntent)
          throw new Error(this.view.error ?? GOALS_UNAVAILABLE);
      }
      text = text.trim().slice(intent[0].length).trim();
      if (!text) return;
    }
    const literal = text.trim();
    if (literal === "/compact" || literal === "/fork")
      return this.runCommand(literal === "/compact" ? "compact" : "fork");
    if (literal === "/stop") return this.stopBackgroundProcesses();
    if (!this.canSubmit || !text.trim())
      throw new Error("native_chat_not_ready");
    const retained = this.retainedSend(scope, text);
    const directory =
      scope.selectedAttachment?.kind === "reference" &&
      scope.selectedAttachment.mimeType === DIRECTORY_MIME_TYPE;
    const directoryAvailable = directory
      ? await this.requireDirectoryReference(scope, retained)
      : true;
    if (!this.canSubmit) throw new Error("native_chat_not_ready");
    if (
      this.view.effort === "ultra" &&
      !this.view.steering &&
      !(this.remembersSelection && this.view.goalIntent)
    ) {
      await this.requireUltra(scope, this.view.goalIntent);
      if (!this.canSubmit) throw new Error("native_chat_not_ready");
    }
    // A send that cannot go out is refused before anything changes, so a
    // paused turn is only stopped for a message that will be sent.
    this.refuseUnsendable(scope, text);
    // Sending while a turn is paused moves on: that turn ends as stopped and
    // this message runs next. See "Pause, resume, and stop deliberately".
    const next = directoryAvailable && !this.view.steering && !!this.pausedTurn;
    if (this.view.goalIntent) {
      if (next) await this.endPausedTurn(scope);
      const started = await this.startGoalInScope(this.composerGoal(text));
      if (!started)
        throw new Error(this.view.error ?? "Couldn't start the goal.");
      scope = started;
      if (this.owns(scope)) {
        this.update({ goalIntent: false });
        this.drafts?.store.writeModes(this.scopeDraftKey(scope) ?? "", {
          ...(this.view.operatingRegime === "plan" && { plan: true }),
        });
        if (next) await this.playNext(scope, null);
      }
      return;
    }
    if (this.view.steering) return this.submitSteering(scope, text);
    const mode =
      next &&
      this.view.observation?.snapshot.queuedInputs === 0 &&
      !this.view.observation.snapshot.admissionPaused
        ? "submit"
        : this.needsQueue
          ? "enqueue"
          : "submit";
    const selectedAttachment = scope.selectedAttachment;
    const operatingRegime =
      selectedAttachment || this.bridge.submitInRegime
        ? this.view.operatingRegime
        : undefined;
    // Medium leaves the model's default in place. Ultra has already required
    // the negotiated harness; never silently replace it with ordinary work.
    const effort = this.view.effort === "medium" ? undefined : this.view.effort;
    // A queued request keeps the editor binding a sent one has.
    const svgTarget =
      !retained &&
      operatingRegime === "act" &&
      !selectedAttachment &&
      this.bridge.onEditorSvgText
        ? this.editorSurfaces?.svgText?.capture()
        : undefined;
    this.update({ acting: true, error: null });
    try {
      scope = await this.activateSelection(scope);
      await this.open(scope);
      const attachment = this.attachment(scope);
      if (retained && retained.operatingRegime !== operatingRegime)
        throw new Error("native_chat_pending_regime_changed");
      if (retained && retained.effort !== effort)
        throw new Error("native_chat_pending_effort_changed");
      if (
        !retained &&
        this.libraryPicker &&
        scope.librarySelectionAvailable === undefined &&
        mode === "submit" &&
        !selectedAttachment
      )
        await this.readInputCapabilities(scope);
      const pending: NonNullable<Scope["pending"]> = retained ?? {
        text,
        inputId: scope.firstInputId ?? crypto.randomUUID(),
        mode,
        operatingRegime,
        effort,
        ...(scope.selection &&
          scope.selection.revision > 0 && {
            selectionRevision: scope.selection.revision,
          }),
        attachment: selectedAttachment,
        allowLibrarySelection:
          mode === "submit" &&
          scope.librarySelectionAvailable === true &&
          !selectedAttachment &&
          !(scope.stopEditorSvgText && svgTarget),
        editorSvgTargetId: scope.stopEditorSvgText ? svgTarget : undefined,
      };
      let accepted;
      try {
        if (pending.attachment) {
          const capabilities = await this.readInputCapabilities(scope);
          if (
            pending.attachment.kind === "reference" &&
            pending.attachment.mimeType === DIRECTORY_MIME_TYPE &&
            (!directoryAvailable || !capabilities?.directory)
          )
            throw new Error("native_chat_directory_reference_unavailable");
          if (!capabilities?.[pending.attachment.kind])
            throw new Error(
              pending.attachment.kind === "png" ||
                pending.attachment.kind === "image"
                ? "image_input_unavailable"
                : pending.attachment.kind === "file"
                  ? "file_attachment_unavailable"
                  : "native_chat_file_reference_unavailable"
            );
        }
        this.attachment(scope);
        scope.pending = pending;
        const draftKey = this.scopeDraftKey(scope);
        if (draftKey && this.drafts && !this.fixed)
          await this.drafts.store.writePending(
            draftKey,
            this.pendingRecord(pending)
          );
        this.attachment(scope);
        if (scope.pending !== pending)
          throw new Error("native_chat_scope_changed");
        if (next) await this.endPausedTurn(scope);
        if (pending.attachment?.kind === "image") {
          if (!this.bridge.submitSelectedImage || !pending.operatingRegime)
            throw new Error("image_input_unavailable");
          accepted = await this.bridge.submitSelectedImage(
            attachment.attachmentId,
            {
              action: pending.mode,
              inputId: pending.inputId,
              text: pending.text,
              file: pending.attachment.file,
              ...(pending.attachment.originalFile && {
                originalFile: pending.attachment.originalFile,
              }),
              operatingRegime: pending.operatingRegime,
              ...(pending.effort && { effort: pending.effort }),
              ...(pending.selectionRevision !== undefined && {
                selectionRevision: pending.selectionRevision,
              }),
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
            ...(pending.selectionRevision !== undefined && {
              selectionRevision: pending.selectionRevision,
            }),
          });
        } else if (pending.attachment?.kind === "reference") {
          if (!this.bridge.submitFileReference || !pending.operatingRegime)
            throw new Error("native_chat_file_reference_unavailable");
          const { file, mimeType, preview } = pending.attachment;
          accepted = await this.bridge.submitFileReference(
            attachment.attachmentId,
            {
              action: pending.mode,
              inputId: pending.inputId,
              text: pending.text,
              file,
              ...(mimeType && { mimeType }),
              ...(preview && { preview }),
              operatingRegime: pending.operatingRegime,
              ...(pending.effort && { effort: pending.effort }),
              ...(pending.selectionRevision !== undefined && {
                selectionRevision: pending.selectionRevision,
              }),
            }
          );
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
            ...(pending.selectionRevision !== undefined && {
              selectionRevision: pending.selectionRevision,
            }),
          });
        } else if (pending.allowLibrarySelection) {
          if (!this.bridge.submitWithLibrarySelection)
            throw new Error("native_chat_library_selection_unavailable");
          accepted = await this.bridge.submitWithLibrarySelection(
            attachment.attachmentId,
            pending.inputId,
            pending.text,
            pending.operatingRegime,
            pending.effort,
            ...(pending.selectionRevision !== undefined
              ? [pending.selectionRevision]
              : [])
          );
        } else if (pending.operatingRegime) {
          if (!this.bridge.submitInRegime)
            throw new Error("native_chat_operating_regime_unavailable");
          const options: [
            effort?: NativeChatEffort,
            svgTargetId?: string,
            selectionRevision?: number,
          ] =
            pending.selectionRevision !== undefined
              ? [
                  pending.effort,
                  pending.editorSvgTargetId,
                  pending.selectionRevision,
                ]
              : pending.editorSvgTargetId
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
        if (scope.pending !== pending) throw error;
        // Recover an earlier receipt without authorizing an unsupported resend.
        accepted = await this.bridge
          .inputReceipt(attachment.attachmentId, pending.inputId)
          .catch(() => {
            throw error;
          });
      }
      await this.completeSubmission(scope, pending, accepted);
      if (next && this.owns(scope)) await this.playNext(scope, pending.inputId);
    } catch (error) {
      if (
        error instanceof Error &&
        /^(?:session_(?:queue_waiting|prompt_in_progress|admission_paused|turn_requires_recovery)|selected_image_(?:changed|unavailable|identity_invalid|snapshot_unavailable|protected|symlink|size_limit)|image_(?:source_size_limit|decode_limit|preparation_limit)|invalid_raster_image|unsupported_image_format|protected_root_overlap|native_chat_selection_revision_changed)$/.test(
          error.message
        )
      )
        await this.discardPending(scope).catch(() => {});
      if (this.owns(scope)) {
        if (
          selectedAttachment &&
          this.acceptsAttachment(selectedAttachment.kind) &&
          error instanceof Error &&
          /image_input_unavailable|file_attachment_unavailable|file_reference_unavailable|directory_reference_unavailable/.test(
            error.message
          )
        )
          void this.readInputCapabilities(scope);
        this.update({
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

  /** The chat commands this chat offers; a side chat refuses some. */
  get commandChoices(): readonly NativeChatCommand[] {
    return this.view.commands.filter((command) =>
      this.offers(command === "fork" ? "fork" : "compaction")
    );
  }

  /**
   * The slash commands the composer lists. The list comes from what this chat
   * can ever do (its connection, host capabilities and side-chat policy),
   * never from a running turn, the queue, steering or an in-flight action: a
   * command chosen when it cannot run says why instead of disappearing. A
   * chat that is not open yet lists none; side chats, background processes
   * and host chat commands also need the chat attached, since their
   * capabilities are read from it.
   */
  get composerCommands(): readonly NativeChatComposerCommand[] {
    if (!this.scope) return [];
    return [
      ...(this.bridge.submitInRegime ? (["plan"] as const) : []),
      ...(this.offersGoals ? (["goal"] as const) : []),
      ...(this.offersSideChat ? (["side"] as const) : []),
      ...(this.view.backgroundProcesses ? (["stop"] as const) : []),
      ...this.commandChoices,
    ];
  }

  /**
   * Run a listed slash command, chosen from the menu or typed alone. A
   * command refused for what the chat is doing now (fork or compaction while
   * the agent works, a goal while one is set, `/stop` with nothing running)
   * reports why and resolves.
   */
  async runComposerCommand(command: NativeChatComposerCommand): Promise<void> {
    switch (command) {
      case "plan":
        if (!this.bridge.submitInRegime)
          this.update({ error: "Planning is unavailable in this chat." });
        else this.selectOperatingRegime("plan");
        return;
      case "goal":
        this.selectGoalIntent(true);
        return;
      case "side":
        return this.showSideChat();
      case "stop":
        return this.stopBackgroundProcesses();
      default:
        return this.runCommand(command);
    }
  }

  async runCommand(command: NativeChatCommand): Promise<void> {
    let scope = this.scope;
    const attachment = scope?.attachment;
    if (
      !scope ||
      !attachment ||
      !this.bridge.runCommand ||
      !this.commandChoices.includes(command)
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
    // Fork and compaction start from settled history, so they wait for the
    // agent; the command stays listed and says so. A retained request is
    // retried as is, to confirm its outcome.
    const snapshot = scope.observation?.snapshot;
    if (!retained && snapshot?.current) {
      this.update({
        error: `/${command} is unavailable while the agent is working.`,
      });
      return;
    }
    if (
      !retained &&
      command === "compact" &&
      (!snapshot || snapshot.admissionPaused || snapshot.queuedInputs)
    ) {
      this.update({
        error: "Compaction needs an idle chat with an open, empty queue.",
      });
      return;
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
      let target = attachment;
      if (this.remembersSelection && command === "compact" && !retained) {
        scope = await this.activateSelection(scope);
        await this.open(scope);
        target = this.attachment(scope);
      }
      const receipt = this.bridge.runCommand(
        target.attachmentId,
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
        // An installed summary shows as a note in the transcript itself.
        this.update({
          commandNotice:
            result.status === "installed"
              ? null
              : COMPACTION_NOTICE[result.status],
        });
        if (result.status === "installed") {
          scope.replay = true;
          void this.refresh(scope);
        }
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
      ![
        ...scope.earlierPages.flatMap((page) => page.messages),
        ...scope.durable,
      ].some(
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

  /** Load the page before the oldest loaded message, above it in the scroll. */
  async loadEarlierMessages(): Promise<void> {
    const scope = this.scope;
    const read = this.bridge.transcriptPage;
    if (!scope?.attachment || !read || this.view.readingEarlier) return;
    this.update({ readingEarlier: true, earlierError: null });
    try {
      await scope.refreshing;
      const attachment = this.attachment(scope);
      const latest = scope.recentWindow;
      const older = (scope.earlierPages[0] ?? latest)?.older;
      if (!latest || !older) return;
      const token = {};
      scope.earlierRead = token;
      const page = await read.call(this.bridge, attachment.attachmentId, older);
      if (!this.owns(scope) || scope.earlierRead !== token) return;
      if (
        page.view !== latest.view ||
        page.older === older ||
        scope.recentWindow !== latest
      )
        throw new Error("history_replay_window_changed");
      scope.earlierPages = [page, ...scope.earlierPages];
      this.publishMessages(scope);
    } catch (error) {
      if (!this.owns(scope)) return;
      if (deletedAttachment(error)) this.forgetDeletedChat(scope);
      else {
        if (
          error instanceof Error &&
          error.message.includes("history_replay_window_changed")
        ) {
          scope.earlierPages = [];
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

  /** Inspect text without entering edit mode or taking the chat's action lock. */
  readonly readQueuedText = async (inputId: string): Promise<string> => {
    const scope = this.scope;
    const attachment = scope?.attachment;
    const basis = scope?.queueBasis;
    const readMessage = this.bridge.queuedMessage;
    const readText = this.bridge.queuedText;
    const item = this.view.queue?.items.find(
      (entry) => entry.inputId === inputId
    );
    if (
      !scope ||
      !attachment ||
      !basis ||
      (!readMessage && !readText) ||
      !item ||
      !this.queueCurrent
    )
      throw new Error("native_chat_queue_input_unavailable");
    let text: string;
    if (readMessage) {
      const message = await readMessage.call(
        this.bridge,
        attachment.attachmentId,
        basis.observationId,
        inputId
      );
      if (message.inputId !== inputId)
        throw new Error("native_chat_queue_input_unavailable");
      text = message.text;
    } else {
      text = await readText!.call(
        this.bridge,
        attachment.attachmentId,
        basis.observationId,
        inputId
      );
    }
    if (
      !this.owns(scope) ||
      scope.queueBasis !== basis ||
      !this.queueCurrent ||
      !this.view.queue?.items.some((entry) => entry.inputId === inputId) ||
      typeof text !== "string"
    )
      throw new Error("native_chat_queue_input_unavailable");
    return text;
  };

  /** Image bytes are bound to this still-queued input, separate from sent history. */
  readonly readQueuedAttachmentPreview = async (
    inputId: string,
    previewId: string
  ): Promise<Blob> => {
    const scope = this.scope;
    const attachment = scope?.attachment;
    const basis = scope?.queueBasis;
    const read = this.bridge.readQueuedAttachmentPreview;
    const find = () =>
      this.view.queue?.items
        .find((entry) => entry.inputId === inputId)
        ?.attachments?.find(
          (entry) =>
            entry.previewId === previewId &&
            isSupportedImageType(entry.mimeType)
        );
    const image = find();
    if (
      !scope ||
      !attachment ||
      !basis ||
      !read ||
      !image ||
      !this.queueCurrent
    )
      throw new Error("native_chat_queue_input_unavailable");
    const bytes = await read.call(
      this.bridge,
      attachment.attachmentId,
      basis.observationId,
      inputId,
      previewId
    );
    if (
      !this.owns(scope) ||
      scope.queueBasis !== basis ||
      !this.queueCurrent ||
      find() !== image ||
      !(bytes instanceof ArrayBuffer) ||
      bytes.byteLength === 0 ||
      bytes.byteLength > 20 * 1024 * 1024
    )
      throw new Error("native_chat_queue_input_unavailable");
    return new Blob([bytes], { type: image.mimeType });
  };

  /** A current waiting message whose text this runtime can safely replace. */
  canEditQueuedText(item: NativeChatQueueItem): boolean {
    const scope = this.scope;
    return (
      !!scope?.attachment &&
      this.queueCurrent &&
      !this.view.acting &&
      !this.view.queueDraft &&
      this.view.queue?.items.includes(item) === true &&
      this.supportsQueuedTextEdit(scope, item)
    );
  }

  private supportsQueuedTextEdit(
    scope: Scope,
    item: NativeChatQueueItem,
    replaceText = this.canReplaceQueuedText(scope, item)
  ): boolean {
    if (
      !this.bridge.editQueue ||
      item.textEditable === false ||
      item.goalStart ||
      scope.observation?.snapshot.pendingGoalId === item.inputId
    )
      return false;
    return replaceText
      ? this.canReplaceQueuedText(scope, item)
      : !!this.bridge.queuedText &&
          item.preview !== null &&
          item.textOnly !== false &&
          !item.attachments?.length;
  }

  private canReplaceQueuedText(
    scope: Scope,
    item: NativeChatQueueItem
  ): boolean {
    return (
      scope.queuedTextReplacement === true &&
      item.textEditable === true &&
      !!this.bridge.queuedMessage
    );
  }

  async editQueuedText(inputId: string): Promise<void> {
    const scope = this.scope;
    const basis = scope?.queueBasis;
    const item = this.view.queue?.items.find(
      (entry) => entry.inputId === inputId
    );
    if (!scope?.attachment || !basis || !item || !this.canEditQueuedText(item))
      return;
    const observationId = basis.observationId;
    const replaceText = this.canReplaceQueuedText(scope, item);
    this.update({ acting: true, error: null });
    try {
      const message = replaceText
        ? await this.bridge.queuedMessage!(
            scope.attachment.attachmentId,
            observationId,
            inputId
          )
        : undefined;
      const text = message
        ? message.text
        : replaceText
          ? undefined
          : await this.bridge.queuedText!(
              scope.attachment.attachmentId,
              observationId,
              inputId
            );
      if (!this.owns(scope)) return;
      if (
        scope.queueBasis !== basis ||
        basis.observationId !== observationId ||
        !this.queueCurrent ||
        this.view.queue?.items.find((entry) => entry.inputId === inputId) !==
          item ||
        typeof text !== "string" ||
        !this.supportsQueuedTextEdit(scope, item, replaceText) ||
        (replaceText &&
          (message?.inputId !== inputId || message.textEditable !== true))
      )
        throw new Error("native_chat_queue_input_unavailable");
      this.update({
        queueDraft: {
          inputId,
          text,
          ...(replaceText && {
            replaceText: true,
            allowEmpty: !!message?.attachments?.length,
          }),
        },
      });
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

  /** Replace the same waiting input; failed confirmation keeps the edited text. */
  async saveQueueDraft(text?: string): Promise<boolean> {
    const scope = this.scope;
    const draft = this.view.queueDraft;
    if (!scope || !draft || this.view.acting) return false;
    const edited = { ...draft, text: text ?? draft.text };
    if (edited.text !== draft.text) this.update({ queueDraft: edited });
    if (!edited.allowEmpty && !edited.text.trim()) return false;
    if (draft.replaceText && scope.queuedTextReplacement !== true) return false;
    const action: NativeChatQueueAction = {
      action: draft.replaceText ? "replaceText" : "replace",
      inputId: draft.inputId,
      text: edited.text,
    };
    const replay = scope.pendingQueueChange?.key === JSON.stringify(action);
    const queue = this.view.queue;
    const item = queue?.items.find((entry) => entry.inputId === draft.inputId);
    // A lost reply can have already replaced the original input. Retry that
    // exact request for its receipt rather than creating a second replacement.
    if (
      !replay &&
      (!this.queueCurrent ||
        scope.observation?.snapshot.pendingGoalId === draft.inputId ||
        (item &&
          !this.supportsQueuedTextEdit(scope, item, !!draft.replaceText)) ||
        (!item &&
          (!queue ||
            (queue.previousOffset === null && queue.nextOffset === null))))
    ) {
      this.update({ error: "This message is no longer available to edit." });
      return false;
    }
    return this.applyQueueChange(action);
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
    await this.applyQueueChange(action);
  }

  private async applyQueueChange(
    action: NativeChatQueueAction
  ): Promise<boolean> {
    const scope = this.scope;
    if (
      !scope?.attachment ||
      !scope.observation ||
      !this.bridge.editQueue ||
      this.view.acting ||
      ((action.action === "replace" || action.action === "replaceText") &&
        scope.observation.snapshot.pendingGoalId === action.inputId)
    )
      return false;
    const observationId =
      action.action === "resume"
        ? scope.observation.observationId
        : this.queueCurrent
          ? scope.queueBasis?.observationId
          : undefined;
    const key = JSON.stringify(action);
    if (!observationId && scope.pendingQueueChange?.key !== key) return false;
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
    let confirmed = false;
    try {
      await this.bridge.editQueue(scope.attachment.attachmentId, change);
      confirmed = true;
      scope.pendingQueueChange = undefined;
      if (
        this.owns(scope) &&
        (action.action === "replace" || action.action === "replaceText")
      )
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
    return confirmed && this.owns(scope);
  }

  /** The goal the composer starts from its text. */
  private composerGoal(
    text: string
  ): Omit<NativeChatGoalRequest, "operatingRegime"> {
    return {
      objective: text.trim(),
      criteria: [text.trim()],
      // The host applies the product's default allowance.
      automatic: true,
      ...(this.view.effort === "ultra" && { effort: "ultra" }),
    };
  }

  private async completeSubmission(
    scope: Scope,
    pending: NonNullable<Scope["pending"]>,
    accepted: NativeChatAcceptance
  ): Promise<void> {
    const key = this.scopeDraftKey(scope);
    if (key && this.drafts)
      await this.drafts.store
        .completePending(key, pending.inputId)
        .catch(() => {});
    if (scope.pending === pending) scope.pending = undefined;
    scope.firstInputId = undefined;
    if (this.owns(scope)) {
      if (
        (pending.attachment &&
          scope.selectedAttachment === pending.attachment) ||
        (pending.missingAttachment && !scope.selectedAttachment)
      ) {
        scope.selectedAttachment = undefined;
        this.update({ attachmentDraft: null, attachmentNotice: null });
      }
      scope.awaitingTurn = accepted.turnId ?? undefined;
      scope.replay = true;
      await this.refresh(scope);
    }
  }

  /** The unconfirmed send this text and attachment would retry. */
  private retainedSend(scope: Scope, text: string) {
    return scope.pending?.text === text &&
      (scope.pending.attachment === scope.selectedAttachment ||
        (!!scope.pending.missingAttachment && !scope.selectedAttachment))
      ? scope.pending
      : undefined;
  }

  /**
   * Throws when the composer's message cannot be sent whatever the chat is
   * doing, before any request leaves. Checks that depend on whether the chat
   * is busy stay with the send itself.
   */
  private refuseUnsendable(scope: Scope, text: string): void {
    const refuse = (error: string): never => {
      this.update({ error });
      throw new Error(error);
    };
    if (this.view.goalIntent) {
      if (this.view.attachmentDraft)
        throw new Error("Remove the attachment before starting a goal.");
      if (utf8.encode(text.trim()).length > 1024)
        refuse(
          "Use a shorter goal, or customize its objective and success criteria."
        );
      const problem = goalRequestProblem(
        this.composerGoal(text),
        this.view,
        !this.remembersSelection
      );
      if (problem) refuse(problem);
      return;
    }
    if (this.view.steering) return;
  }

  /**
   * Whether the current turn is confirmed paused: it can resume, and a sent
   * message moves on from it.
   */
  get hasPausedTurn(): boolean {
    return !!this.pausedTurn;
  }

  /** The current turn when it is confirmed paused. */
  private get pausedTurn() {
    const turn = this.view.observation?.snapshot.current;
    return turn?.disposition === "suspended" && turn.paused && !turn.cancelled
      ? turn
      : undefined;
  }

  /**
   * Ends a paused turn as stopped and waits until it has settled, so a new
   * message can run next. Throws while it cannot, leaving the draft unsent.
   */
  private async endPausedTurn(scope: Scope): Promise<void> {
    const observation = scope.observation;
    if (!observation || !this.bridge.control)
      throw new Error("native_chat_not_ready");
    this.update({ acting: true, error: null });
    try {
      await this.bridge.control(this.attachment(scope).attachmentId, {
        action: "stop",
        observationId: observation.observationId,
        requestId: crypto.randomUUID(),
      });
      for (let attempt = 0; attempt < 100; attempt++) {
        await this.refresh(scope);
        if (!scope.observation?.snapshot.current) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error("native_chat_paused_turn_not_settled");
    } catch (error) {
      if (this.owns(scope))
        this.update({
          error:
            "Couldn't move on from the paused turn. Your draft is still here.",
        });
      throw error;
    } finally {
      if (this.owns(scope)) this.update({ acting: false });
    }
  }

  /**
   * Runs a message that was sent while a turn was paused before anything that
   * was already waiting. A failure leaves it visible in the held queue.
   */
  private async playNext(scope: Scope, inputId: string | null): Promise<void> {
    const attachment = scope.attachment;
    if (!attachment || !this.bridge.editQueue || !this.owns(scope)) return;
    try {
      const snapshot = scope.observation?.snapshot;
      if (inputId && snapshot && snapshot.queuedInputs > 1) {
        await this.refreshQueue(scope, 0);
        const basis = scope.queueBasis;
        if (basis && this.view.queue?.items[0]?.inputId !== inputId) {
          await this.bridge.editQueue(attachment.attachmentId, {
            action: "place",
            inputId,
            index: 0,
            observationId: basis.observationId,
            requestId: crypto.randomUUID(),
          });
          await this.refresh(scope);
        }
      }
      const observation = scope.observation;
      if (
        observation &&
        !observation.snapshot.current &&
        (observation.snapshot.admissionPaused ||
          observation.snapshot.idleQueueResumeAvailable)
      ) {
        await this.bridge.editQueue(attachment.attachmentId, {
          action: "resume",
          observationId: observation.observationId,
          requestId: crypto.randomUUID(),
        });
        await this.refresh(scope);
      }
    } catch {
      if (this.owns(scope)) {
        this.update({
          error: "Your message is queued. Choose Resume to start it.",
        });
        await this.refresh(scope);
      }
    }
  }

  /** Whether a waiting message can be sent into the current turn instead. */
  canSteerQueued(item: NativeChatQueueItem): boolean {
    return (
      this.canSteer &&
      this.queueCurrent &&
      !this.view.acting &&
      !this.view.queueDraft &&
      !!this.bridge.queuedText &&
      !!this.bridge.editQueue &&
      item.preview !== null &&
      item.textOnly !== false &&
      !item.attachments?.length &&
      !item.goalStart &&
      item.operatingRegime !== "plan" &&
      item.effort !== "ultra"
    );
  }

  /**
   * Sends a waiting message into the current turn. The message leaves the
   * queue first, so it can never run twice. If the turn then cannot take it,
   * the text is returned for the composer instead of being lost.
   */
  async steerQueued(inputId: string): Promise<string | null> {
    const scope = this.scope;
    const item = this.view.queue?.items.find(
      (candidate) => candidate.inputId === inputId
    );
    const basis = scope?.queueBasis;
    if (
      !scope?.attachment ||
      !basis ||
      !item ||
      !this.canSteerQueued(item) ||
      !this.bridge.queuedText ||
      !this.bridge.editQueue
    )
      return null;
    const attachmentId = scope.attachment.attachmentId;
    this.update({ acting: true, error: null });
    let text: string;
    try {
      text = await this.bridge.queuedText(
        attachmentId,
        basis.observationId,
        inputId
      );
      await this.bridge.editQueue(attachmentId, {
        action: "withdraw",
        inputId,
        observationId: basis.observationId,
        requestId: crypto.randomUUID(),
      });
    } catch {
      if (this.owns(scope)) {
        this.update({
          error: "Couldn't steer with that message. It is still queued.",
        });
        await this.refresh(scope);
        if (this.owns(scope)) this.update({ acting: false });
      }
      return null;
    }
    await this.refresh(scope);
    if (!this.owns(scope)) return text;
    this.update({ acting: false });
    const returned =
      "The current turn couldn't take the message. Its text is back in the composer.";
    if (!this.canSteer) {
      this.update({ error: returned });
      return text;
    }
    try {
      await this.submitSteering(scope, text);
      return null;
    } catch {
      if (this.owns(scope)) this.update({ error: returned });
      return text;
    }
  }

  /**
   * Resumes the paused turn. A pause that is still settling is awaited first,
   * so the person can choose Resume as soon as they pause.
   */
  async resumeTurn(): Promise<void> {
    const scope = this.scope;
    if (!scope) return;
    for (let attempt = 0; attempt < 100 && this.owns(scope); attempt++) {
      const turn = scope.observation?.snapshot.current;
      if (!turn || turn.cancelled) break;
      if (turn.disposition === "suspended" && turn.paused && !this.view.acting)
        return this.control("resume");
      await new Promise((resolve) => setTimeout(resolve, 100));
      await this.refresh(scope);
    }
    if (this.owns(scope)) this.update({ pausing: null });
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
    this.update({ pausing: action === "pause" ? turn.turnId : null });
    const input: NativeChatControl = {
      action,
      observationId,
      requestId: crypto.randomUUID(),
    };
    this.update({ acting: true, error: null });
    try {
      await this.bridge.control(scope.attachment.attachmentId, input);
    } catch (error) {
      if (this.owns(scope) && action === "pause")
        this.update({ pausing: null });
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
    if (!scope || (!scope.attachment && !scope.requested && !this.fixed))
      return;
    if (scope.retiredAttachment) {
      await this.select(this.view.selected, { reattach: true });
      return;
    }
    scope.replay = true;
    void this.readEffortCapability(scope);
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
    if (scope.attachment) return this.promoteDraft(scope);
    if (scope.opening) return scope.opening;
    const opening = this.attachments.then(async () => {
      if (!this.owns(scope)) return;
      const newDraft =
        scope.requested === null ? this.scopeDraftKey(scope) : null;
      const attachment = this.fixed
        ? await this.fixed.open()
        : scope.requested
          ? await this.bridge.load(scope.requested)
          : this.remembersSelection &&
              scope.selection &&
              "draftId" in scope.selection.target &&
              typeof scope.selection.target.draftId === "string"
            ? await this.bridge.createFromDraft!(scope.selection.target.draftId)
            : await this.bridge.create();
      if (newDraft && this.drafts) {
        scope.promotingDraft = {
          from: newDraft,
          to: `${this.drafts.workspace}:${attachment.sessionId}`,
        };
      }
      if (
        "firstInputId" in attachment &&
        typeof attachment.firstInputId === "string"
      )
        scope.firstInputId = attachment.firstInputId;
      if (
        this.remembersSelection &&
        scope.selection &&
        "draftId" in scope.selection.target &&
        typeof scope.selection.target.draftId === "string"
      ) {
        const state = await this.bridge.selection!({
          sessionId: attachment.sessionId,
        });
        if (!this.owns(scope)) {
          await this.bridge.detach(attachment.attachmentId).catch(() => {});
          return;
        }
        scope.selection = state;
        this.presentSelection(state);
      }
      scope.attachment = attachment;
      scope.requested = attachment.sessionId;
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
      // A new chat's unsent draft belongs to the chat it just became, so it
      // stays in the composer whatever happens to the send that created it.
      if (newDraft && this.drafts) {
        await this.promoteDraft(scope);
      }
      this.update({
        selected: attachment.sessionId,
        sessions: this.sessionChoices(),
      });
      this.save();
      void this.readCatalogEntry(scope);
      void this.readCommands(scope);
      await this.readPermissionMode(scope);
      void this.readBackgroundProcesses(scope, attachment);
      await this.renewSubscription(scope);
    });
    this.attachments = opening.catch(() => {});
    scope.opening = opening.finally(() => {
      scope.opening = undefined;
    });
    return scope.opening;
  }

  private async promoteDraft(scope: Scope): Promise<void> {
    const promotion = scope.promotingDraft;
    if (!promotion || !this.drafts) return;
    await this.drafts.store.move(promotion.from, promotion.to);
    if (scope.promotingDraft === promotion) scope.promotingDraft = undefined;
  }

  private queueRelease(scope: Scope | undefined): void {
    if (!scope) return;
    scope.permissionConfirmation?.resolve(false);
    scope.permissionConfirmation = undefined;
    clearTimeout(scope.timer);
    clearTimeout(scope.titleCheck);
    scope.stopEditorSurfaceOpen?.();
    scope.stopEditorSvgText?.();
    scope.stopEditorSurfaceUpdates?.();
    for (const side of scope.sides.splice(0))
      void this.releaseSide(side).catch(() => {});
    scope.subagents?.dispose();
    // Switching chats leaves background processes running.
    scope.backgroundProcesses?.dispose();
    // A fixed session belongs to the chat that opened it, which ends it.
    if (this.fixed) return;
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

  private async readBackgroundProcesses(
    scope: Scope,
    attachment: NativeChatAttachment
  ): Promise<void> {
    const bridge = this.bridge;
    if (!NativeBackgroundProcessController.supported(bridge)) return;
    const accepted = await bridge
      .acceptsBackgroundProcesses()
      .catch(() => false);
    if (!accepted || !this.owns(scope) || scope.attachment !== attachment)
      return;
    scope.backgroundProcesses ??= new NativeBackgroundProcessController(
      bridge,
      attachment.attachmentId
    );
    this.update({ backgroundProcesses: scope.backgroundProcesses });
    await scope.backgroundProcesses.load();
  }

  /** Whether `/stop` can stop this chat's background processes. */
  get canStopBackgroundProcesses(): boolean {
    return !!this.view.backgroundProcesses;
  }

  /**
   * Stops every background process of this chat. The current turn keeps
   * running; stopping the turn is a separate control.
   */
  async stopBackgroundProcesses(): Promise<void> {
    const processes = this.scope?.backgroundProcesses;
    if (!processes || this.view.backgroundProcesses !== processes) {
      const error = "Background processes are unavailable in this chat.";
      this.update({ error });
      throw new Error(error);
    }
    if (processes.read().running === 0) {
      this.update({
        error: null,
        commandNotice: "No background processes are running.",
        commandFork: null,
      });
      return;
    }
    if (!(await processes.stop())) {
      const error =
        processes.read().error ?? "Couldn't stop the background processes.";
      if (this.view.backgroundProcesses === processes) this.update({ error });
      throw new Error(error);
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

  /**
   * An untitled chat is titled by the host from its first request, in the
   * background. Pick the title up as turns progress, and once more shortly
   * after, without surfacing errors from this background read. A side chat
   * reads its title from its snapshot.
   */
  private refreshUntitled(scope: Scope): void {
    const side = scope.observation?.snapshot.side;
    if (side) {
      // A side chat's title arrives through its snapshot; look once more
      // shortly after, as the title can follow the turn that asked for it.
      if (side.title !== undefined) return;
      clearTimeout(scope.titleCheck);
      scope.titleCheck = setTimeout(
        () => void this.refresh(scope),
        TITLE_RECHECK_MS
      );
      return;
    }
    const read = this.bridge.catalogEntry;
    const attachment = scope.attachment;
    if (
      !read ||
      !attachment ||
      !this.canOrganizeChats ||
      this.view.catalogEntry?.title !== null ||
      this.view.catalogDraft
    )
      return;
    const check = async () => {
      if (!this.owns(scope) || this.view.catalogEntry?.title !== null) return;
      try {
        const entry = await read.call(this.bridge, attachment.attachmentId);
        if (
          !this.owns(scope) ||
          entry.sessionId !== attachment.sessionId ||
          entry.title === null ||
          this.view.catalogDraft
        )
          return;
        this.installCatalogEntry(entry);
        this.update({ titleArrived: entry.sessionId });
        void this.listChats();
      } catch {
        // The title stays as it is; a later turn or reopening reads it again.
      }
    };
    void check();
    clearTimeout(scope.titleCheck);
    scope.titleCheck = setTimeout(() => void check(), TITLE_RECHECK_MS);
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
          !next.snapshot.side?.unavailable.includes("subagents") &&
          supportsSubagents(this.bridge)
        ) {
          scope.subagents ??= new NativeSubagentController(
            this.bridge,
            attachment.attachmentId,
            () => scope.observation
          );
          scope.subagents.parentUpdated();
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
        void this.refreshQueue(scope, this.view.queue?.offset ?? 0);
        await Promise.all([
          this.refreshApprovals(scope, attachment, next),
          this.refreshQuestions(scope, attachment, next),
          this.refreshLibrarySelection(scope, attachment, next),
          this.refreshGoal(scope, attachment, next),
          this.readPermissionMode(scope),
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
        this.refreshUntitled(scope);
        const page = this.bridge.transcriptPage
          ? await this.bridge.transcriptPage(attachment.attachmentId)
          : undefined;
        const messages =
          page?.messages ??
          (await this.bridge.transcript(attachment.attachmentId));
        if (!this.owns(scope)) return;
        if (page && scope.recentWindow?.view !== page.view)
          scope.earlierPages = [];
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
    if (update.kind === "processes") {
      scope.backgroundProcesses?.receive(update.processes);
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
        : recorded.map((item, at) =>
            at === index
              ? {
                  ...update.activity,
                  ...activityOrderMetadata(item, update.activity),
                }
              : item
          );
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
          if (this.owns(scope) && scope.attachment === attachment)
            this.receive(scope, update);
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
    const pages = scope.earlierPages;
    const seen = new Set<string>();
    const messages = [
      ...pages.flatMap((page) => page.messages),
      ...scope.durable,
      ...scope.live.values(),
    ].filter((message) => {
      if (seen.has(message.messageId)) return false;
      seen.add(message.messageId);
      return true;
    });
    const turns = new Map<string, NativeChatTurnRecord>();
    for (const page of [...pages, scope.recentWindow])
      for (const turn of page?.turns ?? []) turns.set(turn.turnId, turn);
    this.update({
      messages,
      turnRecords: turns.size ? [...turns.values()] : EMPTY_TURNS,
      canReadEarlier: !!(pages[0] ?? scope.recentWindow)?.older,
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
    if (this.fixed) {
      // Deleting the chat that opened it discarded this one.
      if (this.owns(scope)) this.update({ error: "This side chat has ended." });
      return;
    }
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

  private restore() {
    return NativeChatController.readMemory(
      this.memory,
      this.selectionMemoryKey()
    );
  }

  private static readMemory(
    memory: Pick<Storage, "getItem"> | undefined,
    key: string | undefined
  ): {
    selected: string | null;
    sessions: string[];
    profileId: string | null;
    remembered: boolean;
    draftId?: string;
  } {
    try {
      const value = JSON.parse(key ? (memory?.getItem(key) ?? "null") : "null");
      if (value && Array.isArray(value.sessions)) {
        const sessions = value.sessions
          .filter(
            (id: unknown): id is string =>
              typeof id === "string" && /^[A-Za-z0-9_.:@/-]{1,256}$/.test(id)
          )
          .slice(0, RECENTS_LIMIT);
        return {
          remembered: true,
          ...(typeof value.draftId === "string" &&
            /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(
              value.draftId
            ) && { draftId: value.draftId }),
          sessions,
          selected: sessions.includes(value.selected) ? value.selected : null,
          profileId:
            typeof value.profileId === "string" &&
            /^[a-f0-9]{64}$/.test(value.profileId)
              ? value.profileId
              : null,
        };
      }
    } catch {
      /* Browser storage may be disabled. */
    }
    return {
      selected: null,
      sessions: [],
      profileId: null,
      remembered: false,
    };
  }

  private save(): void {
    const key = this.selectionMemoryKey();
    try {
      if (key)
        this.memory?.setItem(
          key,
          JSON.stringify({
            selected: this.view.selected,
            ...(this.scope?.selection &&
              "draftId" in this.scope.selection.target && {
                draftId: this.scope.selection.target.draftId,
              }),
            sessions: this.recents,
            // The model chosen for this workspace; the default when absent.
            ...(this.profileId && { profileId: this.profileId }),
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
      return previous &&
        (previous.activityOrder !==
          (previous.activityOrder ?? update.activityOrder) ||
          (!previous.activityOrder &&
            update.activityOrderIncomplete &&
            !previous.activityOrderIncomplete))
        ? { ...previous, ...activityOrderMetadata(previous, update) }
        : "duplicate";
  }
  if (update.offsetBytes !== bytes || bytes + added.length > MAX_LIVE_BYTES)
    return null;
  return {
    messageId: update.messageId,
    role: update.role,
    turnId: update.turnId,
    bytes: bytes + added.length,
    text: (existing?.text ?? "") + update.text,
    ...activityOrderMetadata(
      previous?.turnId === update.turnId ? previous : undefined,
      update
    ),
    ...(activity && { activity }),
  };
}

/** A visible fact retains its first native position as text/results grow. */
function activityOrderMetadata(
  previous:
    | { activityOrder?: number; activityOrderIncomplete?: true }
    | undefined,
  incoming: { activityOrder?: number; activityOrderIncomplete?: true }
): { activityOrder?: number; activityOrderIncomplete?: true } {
  const known = previous?.activityOrder ?? incoming.activityOrder;
  if (known !== undefined)
    return { activityOrder: known, activityOrderIncomplete: undefined };
  return previous?.activityOrderIncomplete || incoming.activityOrderIncomplete
    ? { activityOrderIncomplete: true }
    : {};
}

/** Why the host refused a goal start before accepting it. */
function goalStartRefusal(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("session_goal_queued"))
    return "A goal is already waiting to start in this chat.";
  if (message.includes("session_goal_exists"))
    return "This chat already has a goal. Clear it before starting another.";
  if (message.includes("side_chat_goals_unavailable")) return GOALS_UNAVAILABLE;
  return "Couldn't start the goal.";
}

/** Why a side chat could not open, for the chat that asked for it. */
function describeSideRefusal(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("side_chat_parent_limit"))
    return "This chat already has 8 side chats open. Close one to open another.";
  if (message.includes("side_chat_scope_limit"))
    return "Too many side chats are open. Close one to open another.";
  if (message.includes("native_chat_attachment_limit"))
    return "This window has too many chats open. Close a side chat to open another.";
  return "Couldn't open a side chat.";
}

function describe(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  if (error.message.includes("native_chat_model_change_"))
    return modelChangeRefusal(error);
  if (error.message.includes("session_execution_configuration_changed"))
    return "This Desktop version couldn't safely continue the chat after a model change. Update Desktop and retry.";
  if (error.message.includes("session_active_route_changed"))
    return "This unfinished turn needs the model connection that accepted it. Restore that connection, or stop the turn.";
  if (error.message.includes("session_queued_route_changed"))
    return "Queued messages need their original model connection. Run or remove them before changing connections.";
  if (error.message.includes("session_goal_route_changed"))
    return "This active goal needs its original model connection. Finish or clear the goal before changing connections.";
  if (error.message.includes("session_delegated_route_changed"))
    return "Delegated work needs its parent's model connection. Finish or stop that work before changing connections.";
  if (
    /retained_(?:model|authority)_changed|continuation_authority_changed|retry_authority_changed/.test(
      error.message
    )
  )
    return "This unfinished work needs the model connection that accepted it. Restore that connection, or stop the unfinished work.";
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
  if (/selected_image_size_limit|image_source_size_limit/.test(error.message))
    return "Choose an original raster image of at most 20 MiB.";
  if (error.message.includes("image_decode_limit"))
    return "Choose an image within 64 megapixels and the supported decode limits.";
  if (error.message.includes("image_preparation_limit"))
    return "This image could not fit the model's image input limit. Choose a smaller image.";
  if (
    /selected_image_changed|selected_image_identity_reused/.test(error.message)
  )
    return "The selected image changed. Your draft is kept; choose the intended original again.";
  if (/selected_image_protected|protected_root_overlap/.test(error.message))
    return "This item is in Grida's private data and can't be attached.";
  if (/invalid_raster_image|unsupported_image_format/.test(error.message))
    return "Choose a valid PNG, JPEG, WebP or GIF image. Your draft is kept.";
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
  if (error.message.includes("file_reference_protected"))
    return "This item is in Grida's private data and can't be attached.";
  if (error.message.includes("directory_reference_unavailable"))
    return DIRECTORY_REFERENCE_UNAVAILABLE;
  if (error.message.includes("file_reference_unavailable"))
    return "Couldn't find this file on disk. Attach it again from its folder.";
  if (error.message.includes("native_agent_frame_limit"))
    return "This message exceeds the connection limit. Shorten it and try again.";
  return fallback;
}

/** Product-facing reasons for a refused model change; no account inference. */
function modelChangeRefusal(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const reasons = {
    pending_work:
      "Wait for pending workspace chat work to finish before changing the model.",
    active_turn:
      "Finish or stop running chat turns in this workspace before changing the model.",
    retained_turn:
      "Resume and finish paused or interrupted turns in this workspace, or stop them, before changing the model.",
    queued_input:
      "Run or remove queued messages in this workspace before changing the model.",
    unresolved_goal:
      "Finish or clear active goals in this workspace before changing the model.",
    delegated_session:
      "Close temporary side chats and finish delegated work before changing the model.",
    background_process:
      "Stop background commands in this workspace before changing the model.",
    unsupported: "Update Desktop to change model connections safely.",
    busy: "Another model change is in progress. Try again.",
    unverified:
      "Couldn't verify that all chat work has finished. Retry the model change.",
    failed_restored:
      "Couldn't start that model connection. The previous connection has been restored.",
    restore_failed:
      "Couldn't start that model connection or restore the previous one. Retry or choose another connection.",
    recovery_pending:
      "The previous connection is recovering. Wait a moment, then retry.",
  };
  for (const [reason, label] of Object.entries(reasons))
    if (message.includes(`native_chat_model_change_${reason}`)) return label;
  return "This model connection is unavailable. Check its saved settings.";
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
    "goalEffortAvailable" | "observation" | "operatingRegime"
  >,
  checkCapabilities = true
): string | null {
  if (
    checkCapabilities &&
    request.effort === "ultra" &&
    !view.goalEffortAvailable
  )
    return "Ultra is unavailable for goals on this connection.";
  if (
    request.maxCostMills !== undefined &&
    request.allowance !== undefined &&
    request.allowance.inferenceSteps > 4096
  )
    return "An enforced spending limit supports at most 4,096 inference steps per goal.";
  if (
    request.namedChildId &&
    (request.effort !== "ultra" ||
      view.operatingRegime !== "act" ||
      (checkCapabilities &&
        !view.observation?.snapshot.goalNamedChildAvailable))
  )
    return "Choose Act and Ultra to use a named reviewer on a supported connection.";
  const objectiveProblem = goalObjectiveProblem(
    request.objective,
    request.criteria
  );
  if (objectiveProblem) return objectiveProblem;
  if (
    request.allowance &&
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

export namespace NativeChatController {
  /** Welcome's unsent model choice; catalogue refresh never replaces a choice. */
  export class ModelSelection {
    private state: Readonly<{
      profiles: NativeChatProfileCatalog | null;
      profileId: string | null;
      error: string | null;
    }> = { profiles: null, profileId: null, error: null };
    private explicit = false;
    private request?: {
      read: () => Promise<NativeChatProfileCatalog | null>;
      done: Promise<void>;
    };
    private readonly listeners = new Set<() => void>();

    readonly read = () => this.state;

    readonly subscribe = (listener: () => void) => {
      this.listeners.add(listener);
      return () => {
        this.listeners.delete(listener);
      };
    };

    choose(selection: NativeChatProfileSelection): void {
      this.explicit = true;
      this.update({
        ...this.state,
        profileId: selection.kind === "default" ? null : selection.id,
      });
    }

    refresh(
      read: () => Promise<NativeChatProfileCatalog | null>
    ): Promise<void> {
      if (this.request?.read === read) return this.request.done;
      const request = { read, done: Promise.resolve() };
      this.request = request;
      request.done = (async () => {
        try {
          let profiles = await read();
          if (this.request !== request) return;
          const current = this.state.profileId;
          if (
            this.explicit &&
            current &&
            !profiles?.choices.some(({ id }) => id === current)
          ) {
            const previous =
              this.state.profiles?.choices.find(({ id }) => id === current) ??
              this.state.profiles?.saved.find(({ id }) => id === current);
            if (previous)
              profiles = {
                ...(profiles ?? { active: null, choices: [], saved: [] }),
                saved: [
                  ...(profiles?.saved ?? []).filter(({ id }) => id !== current),
                  { ...previous, available: false },
                ],
              };
          }
          this.update({
            profiles,
            profileId: this.explicit
              ? current
              : profiles?.newChatDefault
                ? profiles.newChatDefault.profileId
                : NativeChatController.recommendedProfile(profiles),
            error: null,
          });
        } catch {
          if (this.request === request)
            this.update({
              ...this.state,
              error: "Couldn't load model connections.",
            });
        } finally {
          if (this.request === request) this.request = undefined;
        }
      })();
      return request.done;
    }

    /** A closed view must not receive an outstanding catalogue response. */
    release(): void {
      this.request = undefined;
    }

    private update(state: typeof this.state) {
      this.state = state;
      for (const listener of this.listeners) listener();
    }
  }

  /**
   * A session a chat is bound to without choosing it. Its owner opens the
   * session and ends it; the chat only shows and drives it. A side chat is
   * one: its owner is the chat that opened it.
   */
  export type FixedSession = Readonly<{
    /** Attach the session. Every call returns the same attachment. */
    open(): Promise<NativeChatAttachment>;
    /** The effort the chat starts with. */
    effort: NativeChatEffort;
    /** The model connections shown; the chat cannot choose another. */
    profiles: NativeChatProfileCatalog | null;
    /** The person sends a message from this chat. */
    sent?(): void;
  }>;
}
