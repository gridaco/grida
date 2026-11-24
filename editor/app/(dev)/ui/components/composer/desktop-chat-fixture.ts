import type {
  DesktopNativeChat,
  NativeChatAcceptance,
  NativeChatAttachmentInput,
  NativeChatControlReceipt,
  NativeChatControlResult,
  NativeChatEffort,
  NativeChatMessage,
  NativeChatMessageAttachment,
  NativeChatMessageContext,
  NativeChatOperatingRegime,
  NativeChatQuestion,
  NativeChatSkill,
  NativeChatSkillReference,
  NativeChatQueueAction,
  NativeChatQueueActionReceipt,
  NativeChatQueueCheckout,
  NativeChatQueueCheckoutRequest,
  NativeChatQueuePage,
  NativeChatQueueReceipt,
  NativeChatQueueReinsertRequest,
  NativeChatQueueReinsertResult,
  NativeChatTurn,
  NativeChatUpdate,
} from "@grida/desktop-bridge";
import type { NativeChatEditorSurfaces } from "@/lib/agent-chat/native-chat-controller";
import { DesktopComposerFixtures as fixtures } from "./desktop-fixtures";
import { DesktopConversationFixtures as conversations } from "./desktop-conversation-fixtures";
import { DesktopRequestFixture } from "./desktop-request-fixture";
import { DesktopChatSettingsFixture } from "./desktop-chat-settings-fixture";
import { DesktopChatGoalFixture } from "./desktop-chat-goal-fixture";

const SELECTION_DECK = "/quiet-tide.canvas";
const SELECTION_SLIDE = {
  kind: "svg",
  path: `${SELECTION_DECK}/slides/cover.svg`,
} as const;
const REPLY_PROGRESS_MS = 300;
const REPLY_FINISH_MS = 2400;
const COMPACTION_FINISH_MS = 750;

type Input = {
  action: "submit" | "enqueue";
  inputId: string;
  text: string;
  operatingRegime?: NativeChatOperatingRegime;
  effort?: NativeChatEffort;
  attachments?: readonly NativeChatMessageAttachment[];
  svgSelection?: true;
  goalStart?: fixtures.Queued["goalStart"];
  messageContext?: NativeChatMessageContext;
  skills?: readonly NativeChatSkillReference[];
};

type CapturedInput = Omit<fixtures.Queued, "effort"> & {
  effort?: NativeChatEffort;
  modelId?: string;
  steerableAttachments?: readonly boolean[];
  goalContinuation?: true;
  svgSelection?: true;
  displayParts?: NativeChatMessage["displayParts"];
};

type QueueCheckout = {
  item: CapturedInput;
  checkoutId: string;
  position: number;
};

/** Local implementation of the fragment of Desktop IPC used by the examples. */
export class DesktopChatFixture {
  private projectSkillVersion = 1;
  readonly submission = new DesktopRequestFixture();

  updateProjectSkill(): void {
    this.projectSkillVersion++;
  }

  private skillCatalog(): readonly NativeChatSkill[] {
    const projectRevision = this.projectSkillVersion
      .toString(16)
      .padStart(64, "0");
    const personalRevision = "f".repeat(64);
    return [
      {
        name: "slides",
        description: "Make slides with the gallery project's layout.",
        source: "project_agents",
        uri: `grida-skill:slides@${projectRevision}`,
        revision: projectRevision,
      },
      {
        name: "slides",
        description: "Make slides with your personal layout.",
        source: "personal",
        uri: `grida-skill:slides@${personalRevision}`,
        revision: personalRevision,
      },
    ];
  }
  readonly compaction = new DesktopRequestFixture();
  readonly modelsRead = new DesktopRequestFixture();
  readonly accessRead = new DesktopRequestFixture();
  readonly reconnect = new DesktopRequestFixture();
  readonly sessionId = crypto.randomUUID();
  private readonly goal = new DesktopChatGoalFixture(this.sessionId);
  private goalInput?: CapturedInput;
  private messages: readonly NativeChatMessage[];
  private records: NonNullable<conversations.Example["records"]>;
  private waiting: readonly CapturedInput[];
  readonly settings: DesktopChatSettingsFixture;
  private readonly subscribers = new Map<
    string,
    (update: NativeChatUpdate) => void
  >();
  private readonly svgListeners = new Set<() => void>();
  private readonly runningListeners = new Set<() => void>();
  private readonly imageBytes = new Map<string, ArrayBuffer | Blob>();
  private readonly receipts = new Map<string, NativeChatAcceptance>();
  private readonly queueReceipts = new Map<string, NativeChatQueueReceipt>();
  private readonly compactionRequests = new Map<
    string,
    { turnId: string; outcome: Promise<"installed" | "failed" | "stopped"> }
  >();
  private readonly controlReceipts = new Map<string, NativeChatControlResult>();
  private readonly steerReceipts = new Map<
    string,
    { text: string; observationId: string; receipt: NativeChatControlReceipt }
  >();
  private readonly queueActionReceipts = new Map<
    string,
    { receipt: NativeChatQueueActionReceipt; observationId?: string }
  >();
  private readonly checkoutReceipts = new Map<
    string,
    {
      request: NativeChatQueueCheckoutRequest;
      result: Awaited<ReturnType<NativeChatQueueCheckout["checkout"]>>;
    }
  >();
  private readonly reinsertReceipts = new Map<
    string,
    {
      request: NativeChatQueueReinsertRequest;
      result: NativeChatQueueReinsertResult;
    }
  >();
  private checkedOut?: QueueCheckout;
  private liveTurnId: string;
  private questions: readonly NativeChatQuestion[];
  private waitingFor: "approval" | "library-request" | null;
  private selectedSvg = true;
  private running: boolean;
  private paused: boolean;
  private settled = false;
  private admissionPaused = false;
  private revision = 0;
  private view = 0;
  private editMessageId?: string;
  private replyHeld = false;
  private activeReply?: CapturedInput;
  private replyTimer?: ReturnType<typeof setTimeout>;
  private compactionWork?: {
    timer?: ReturnType<typeof setTimeout>;
    resume?: () => void;
    stop: () => void;
  };
  private suggestionTimer?: ReturnType<typeof setTimeout>;

  constructor(
    readonly scenario: conversations.Scenario,
    queued: boolean,
    options: { settings?: DesktopChatSettingsFixture } = {}
  ) {
    const example = conversations.get(scenario);
    const loading = scenario === "loading";
    if (loading) {
      this.modelsRead.hold(true);
      this.accessRead.hold(true);
    }
    this.settings =
      options.settings ??
      new DesktopChatSettingsFixture({
        profiles: fixtures.profiles,
        ...(loading && {
          initialPermission: "full_access",
          readModels: () => this.modelsRead.wait(),
          readAccess: () => this.accessRead.wait(),
        }),
      });
    Object.assign(this.bridge, this.settings.bridge);

    if (scenario === "compaction") this.compaction.hold(true);
    this.questions = example.questions ?? [];
    this.waitingFor =
      scenario === "approval" || scenario === "library-request"
        ? scenario
        : null;
    this.liveTurnId =
      example.activeTurnId ??
      (this.questions.length
        ? conversations.question.turnId
        : `${this.sessionId}-turn`);
    this.paused = scenario === "paused";
    const activeReply =
      !!example.activeTurnId ||
      scenario === "streaming" ||
      scenario === "suggested-prompt" ||
      this.paused;
    this.running =
      queued || !!this.questions.length || !!this.waitingFor || activeReply;
    this.waiting = queued ? fixtures.queue : [];
    this.messages =
      (activeReply || this.waitingFor) && !example.activeTurnId
        ? example.messages.map((message) => ({
            ...message,
            turnId: this.liveTurnId,
            ...(message.role === "assistant" && { phase: "answer" }),
          }))
        : example.messages;
    this.records = this.running
      ? [
          ...(example.activeTurnId ? (example.records ?? []) : []),
          {
            turnId: this.liveTurnId,
            status: null,
            startedAtMs: conversations.startedAtMs,
          },
        ]
      : (example.records ?? []);
    if (scenario === "suggested-prompt") {
      this.bridge.predictPrompt = async () => conversations.suggestedPrompt;
      const readTranscript = this.bridge.transcriptPage!;
      this.bridge.transcriptPage = async (attachmentId) => {
        const page = await readTranscript(attachmentId);
        // Replay the end of the sample turn after the pane opens its history.
        if (this.running && this.suggestionTimer === undefined) {
          this.suggestionTimer = setTimeout(() => {
            this.suggestionTimer = undefined;
            if (this.running && this.subscribers.size) this.setRunning(false);
          }, 250);
        }
        return page;
      };
    }
    const activity = example.subagentActivity;
    if (activity) {
      // The native pane negotiates the full capability before reading activity.
      const unavailable = async (): Promise<never> => {
        throw new Error("fixture_subagent_details_unavailable");
      };
      Object.assign(this.bridge, {
        subagentActivity: async () => activity,
        subagentConversation: unavailable,
        listSubagents: unavailable,
        inspectSubagent: unavailable,
        createSubagent: unavailable,
        assignSubagent: unavailable,
        stopSubagent: unavailable,
      } satisfies Partial<DesktopNativeChat>);
    }
    if (scenario === "library-request") {
      Object.assign(this.bridge, {
        acceptsLibrarySelection: async () => true,
        submitWithLibrarySelection: async (
          _,
          inputId,
          text,
          operatingRegime,
          effort
        ) =>
          this.accept({
            action: "submit",
            inputId,
            text,
            operatingRegime,
            effort,
          }),
        librarySelections: async () =>
          this.waitingFor === "library-request"
            ? [
                {
                  selectionId: "gallery-cover",
                  reviewId: "gallery-cover-review",
                  initialSearchQuery: "Gallery cover",
                },
              ]
            : [],
        answerLibrarySelection: async (_, reviewId, answer) =>
          this.finishRequest(
            reviewId,
            answer.kind === "skipped"
              ? "I’ll continue without a Library reference."
              : "I’ll use the selected Library image for the cover."
          ),
      } satisfies Partial<DesktopNativeChat>);
    }
  }

  resetRequests() {
    this.submission.reset();
    this.compactionWork?.stop();
    this.compaction.reset();
    this.modelsRead.reset();
    this.accessRead.reset();
    this.reconnect.reset();
    this.clearReplyTimer();
    clearTimeout(this.suggestionTimer);
    this.suggestionTimer = undefined;
  }

  /** Copy settled history into a newly created development chat. */
  seedHistoryFrom(source: DesktopChatFixture): void {
    const live = source.running ? source.liveTurnId : undefined;
    this.messages = source.messages.filter(
      (message) => live === undefined || message.turnId !== live
    );
    this.records = source.records.filter(({ turnId }) => turnId !== live);
    for (const [id, bytes] of source.imageBytes) this.imageBytes.set(id, bytes);
    const latest = this.records.at(-1);
    if (latest) {
      this.liveTurnId = latest.turnId;
      this.settled = true;
    }
  }

  disconnect() {
    this.reconnect.hold(true);
    this.emit({ kind: "closed", reason: "delivery_limit" });
    this.subscribers.clear();
  }

  expireQuestions() {
    if (!this.questions.some((question) => question.expiresWithTurn)) return;
    this.questions = [];
    this.settleTurn("succeeded", true);
    this.submission.accept();
  }

  private finishRequest(requestId: string, text: string) {
    const turnId = this.liveTurnId;
    this.waitingFor = null;
    this.messages = [
      ...this.messages,
      {
        messageId: `${requestId}-answer`,
        role: "assistant",
        turnId: this.liveTurnId,
        phase: "answer",
        text,
      },
    ];
    if (this.paused || this.questions.length) this.changed();
    else this.settleTurn("succeeded", true);
    return this.receipt(requestId, turnId);
  }

  readonly readSvgSelected = () => this.selectedSvg;

  readonly subscribeSvgSelection = (listener: () => void) => {
    this.svgListeners.add(listener);
    return () => this.svgListeners.delete(listener);
  };

  readonly editorSurfaces: NativeChatEditorSurfaces = {
    readEditorSurfaces: () => ({
      active: SELECTION_DECK,
      open: [SELECTION_DECK],
      truncated: false,
      selection: SELECTION_SLIDE,
    }),
    subscribeToEditorSurfaces: () => () => {},
    editorSelection: {
      readSubject: () => SELECTION_SLIDE,
      readLabel: () => (this.readSvgSelected() ? "Quiet tide" : undefined),
      subscribe: this.subscribeSvgSelection,
      clear: () => this.setSvgSelected(false),
      capture: () => (this.selectedSvg ? crypto.randomUUID() : undefined),
      invoke: () => ({ kind: "unavailable" }),
    },
  };

  setSvgSelected(value: boolean) {
    if (this.selectedSvg === value) return;
    this.selectedSvg = value;
    for (const listener of this.svgListeners) listener();
  }

  setRunning(running: boolean) {
    if (!running) {
      if (this.running) this.settleTurn("succeeded", false);
      return;
    }
    if (!this.running && this.scenario !== "streaming") {
      this.liveTurnId = `${this.sessionId}-turn-${this.revision + 1}`;
      this.records = [
        ...this.records,
        { turnId: this.liveTurnId, status: null, startedAtMs: Date.now() },
      ];
    }
    if (!this.running && this.scenario === "streaming") {
      this.records = this.records.map((record) =>
        record.turnId === this.liveTurnId
          ? { ...record, status: null, settledAtMs: undefined }
          : record
      );
    }
    this.running = true;
    this.paused = false;
    this.settled = false;
    this.scheduleReply();
    this.changed();
  }

  readonly readReplyHeld = () => this.replyHeld;
  readonly canFinishReply = () =>
    this.readRunning() &&
    !this.waitingFor &&
    this.questions.length === 0 &&
    !this.records
      .at(-1)
      ?.compactions?.some((item) => item.status === "running");

  setReplyHeld(value: boolean): void {
    if (this.replyHeld === value) return;
    this.replyHeld = value;
    if (value) this.clearReplyTimer();
    else this.scheduleReply();
    for (const listener of this.runningListeners) listener();
  }

  readonly finishReply = (): void => {
    if (!this.canFinishReply()) return;
    const answer =
      this.activeReply?.operatingRegime === "plan"
        ? "I’ll start by reviewing the requested changes and preparing a draft for confirmation."
        : "I’ve finished reviewing the request and the material you supplied.";
    this.publishReply("answer", answer);
    this.settleTurn("succeeded", true);
  };

  readonly failReply = (): void => {
    if (this.canFinishReply()) this.settleTurn("failed", true);
  };

  private clearReplyTimer(): void {
    clearTimeout(this.replyTimer);
    this.replyTimer = undefined;
  }

  private scheduleReply(): void {
    if (
      this.replyHeld ||
      this.replyTimer !== undefined ||
      !this.activeReply ||
      !this.canFinishReply()
    )
      return;
    const turnId = this.liveTurnId;
    this.replyTimer = setTimeout(() => {
      if (turnId !== this.liveTurnId) return;
      this.publishReply("progress", "I’m reviewing your request.");
      this.replyTimer = setTimeout(() => {
        this.replyTimer = undefined;
        if (turnId === this.liveTurnId) this.finishReply();
      }, REPLY_FINISH_MS - REPLY_PROGRESS_MS);
    }, REPLY_PROGRESS_MS);
  }

  private publishReply(phase: "progress" | "answer", text: string) {
    this.publishText(`${this.liveTurnId}-${phase}`, phase, text);
  }

  private settleTurn(
    status: NonNullable<NativeChatTurn["status"]>,
    advance: boolean,
    notify = true
  ): void {
    const turnId = this.liveTurnId;
    this.clearReplyTimer();
    this.compactionWork?.stop();
    this.compaction.refuse();
    this.questions = [];
    this.waitingFor = null;
    this.running = false;
    this.paused = false;
    this.settled = true;
    if (this.activeReply && !this.activeReply.goalContinuation)
      this.updateInputReceipt(this.activeReply.id, "completed", turnId);
    this.activeReply = undefined;
    this.goal.settle(turnId, status);
    this.records = this.records.map((record) =>
      record.turnId === turnId
        ? {
            ...record,
            status,
            settledAtMs: Math.max(Date.now(), record.startedAtMs),
            compactions: record.compactions?.map((item) =>
              item.status === "running"
                ? { ...item, status: "failed", finishedAtMs: Date.now() }
                : item
            ),
          }
        : record
    );
    if (advance && !this.admissionPaused && this.waiting.length)
      this.startReply(this.removeQueued(0));
    if (notify) this.changed();
  }

  readonly readRunning = () => this.running && !this.paused;
  readonly subscribeRunning = (listener: () => void) => {
    this.runningListeners.add(listener);
    return () => this.runningListeners.delete(listener);
  };

  publishProgress(text: string) {
    this.publishText(conversations.question.progressId, "progress", text);
  }

  private publishText(
    messageId: string,
    phase: "progress" | "answer",
    text: string
  ) {
    const message: NativeChatMessage = {
      messageId,
      role: "assistant",
      turnId: this.liveTurnId,
      phase,
      text,
    };
    const index = this.messages.findIndex(
      (entry) => entry.messageId === messageId
    );
    this.messages =
      index < 0
        ? [...this.messages, message]
        : this.messages.map((entry) =>
            entry.messageId === messageId ? message : entry
          );
    this.emit({
      kind: "text",
      messageId,
      role: "assistant",
      turnId: this.liveTurnId,
      text,
      offsetBytes: 0,
      replace: true,
    });
  }

  private changed() {
    this.revision++;
    this.emit({ kind: "resync" });
    for (const listener of this.runningListeners) listener();
  }

  private emit(update: NativeChatUpdate) {
    for (const receive of this.subscribers.values()) receive(update);
  }

  private turn(): NativeChatTurn {
    const record = this.records.find(
      ({ turnId }) => turnId === this.liveTurnId
    );
    const blocked =
      !!this.waitingFor ||
      this.questions.some((question) => question.style === "answer_dependent");
    return {
      turnId: this.liveTurnId,
      modelId: record?.modelId,
      epoch: 0,
      journalPosition: this.revision,
      historyPosition: this.messages.length,
      controlRevision: this.revision,
      paused: this.paused,
      cancelled: record?.status === "cancelled",
      disposition: this.running
        ? this.paused || blocked
          ? "suspended"
          : "running"
        : "settled",
      status: this.running ? null : (record?.status ?? "succeeded"),
      inputNeeded: !!this.questions.length || !!this.waitingFor,
    };
  }

  private receipt(
    requestId: string,
    turnId = this.liveTurnId
  ): NativeChatControlReceipt {
    return {
      sessionId: this.sessionId,
      turnId,
      requestId,
      sessionRevision: this.revision,
      journalPosition: this.revision,
    };
  }

  private startCompaction(requestId: string) {
    const previous = this.compactionRequests.get(requestId);
    if (previous) return previous;
    if (this.running || this.waiting.length > 0)
      throw new Error("session_prompt_in_progress");
    if (this.messages.length === 0) return;
    const turnId = `compaction-${requestId}`;
    const startedAtMs = Date.now();
    const item = {
      id: turnId,
      automatic: false,
      startedAtMs,
    } as const;
    this.liveTurnId = turnId;
    this.running = true;
    this.settled = false;
    this.records = [
      ...this.records,
      {
        turnId,
        startedAtMs,
        status: null,
        compactions: [{ ...item, status: "running" }],
      },
    ];
    const settle = (succeeded: boolean) => {
      if (!this.running || this.liveTurnId !== turnId)
        return "stopped" as const;
      const finishedAtMs = Date.now();
      this.records = this.records.map((record) =>
        record.turnId === turnId
          ? {
              ...record,
              status: succeeded ? "succeeded" : "failed",
              settledAtMs: finishedAtMs,
              compactions: [
                {
                  ...item,
                  status: succeeded ? "succeeded" : "failed",
                  finishedAtMs,
                  ...(succeeded && {
                    summary:
                      "The gallery handout uses large print with a map on the back.",
                  }),
                },
              ],
            }
          : record
      );
      this.settleTurn(succeeded ? "succeeded" : "failed", true);
      return succeeded ? ("installed" as const) : ("failed" as const);
    };
    const outcome = Promise.withResolvers<"installed" | "failed" | "stopped">();
    const work: NonNullable<DesktopChatFixture["compactionWork"]> = {
      stop: () => {
        clearTimeout(work.timer);
        this.compactionWork = undefined;
        outcome.resolve("stopped");
      },
    };
    this.compactionWork = work;
    const complete = (succeeded: boolean) => {
      if (this.compactionWork !== work) return;
      if (this.paused) {
        work.resume = () => complete(succeeded);
        return;
      }
      this.compactionWork = undefined;
      outcome.resolve(settle(succeeded));
    };
    if (this.compaction.read().hold) {
      void this.compaction.wait().then(
        () => complete(true),
        () => complete(false)
      );
    } else {
      work.timer = setTimeout(() => complete(true), COMPACTION_FINISH_MS);
    }
    const started = { turnId, outcome: outcome.promise };
    this.compactionRequests.set(requestId, started);
    this.changed();
    return started;
  }

  private canSteerQueued(item: CapturedInput): boolean {
    return (
      this.turn().disposition === "running" &&
      !this.records
        .at(-1)
        ?.compactions?.some((item) => item.status === "running") &&
      !this.questions.length &&
      !item.goalStart &&
      !item.svgSelection &&
      !item.displayParts?.some(({ kind }) => kind === "skill") &&
      item.operatingRegime !== "plan" &&
      item.effort === undefined &&
      (item.attachments?.every((_, index) =>
        this.canSteerAttachment(item, index)
      ) ??
        true)
    );
  }

  private canSteerAttachment(item: CapturedInput, index: number): boolean {
    return (
      item.steerableAttachments?.[index] ??
      !!item.attachments?.[index]?.previewId
    );
  }

  private queuePage(): NativeChatQueuePage {
    return {
      offset: 0,
      previousOffset: null,
      nextOffset: null,
      items: this.waiting.map((item) => {
        const { id, text, attachments, operatingRegime, effort, goalStart } =
          item;
        return {
          inputId: id,
          preview: text || null,
          attachments,
          operatingRegime,
          ...(effort === "ultra" && { effort }),
          goalStart,
          textOnly: !attachments?.length,
          attachmentIndexes: attachments?.map((_, index) => index) ?? [],
          textEditable: !goalStart,
          checkoutable: !goalStart && !this.checkedOut,
          steerable: this.canSteerQueued(item),
        };
      }),
    };
  }

  private queued(inputId: string) {
    const item = this.waiting.find((item) => item.id === inputId);
    if (!item) throw new Error("fixture_queued_input_unavailable");
    return item;
  }

  private readonly queueCheckout: NativeChatQueueCheckout = {
    checkout: async (_, request) => {
      const { inputId, observationId, requestId } = request;
      const prior = this.checkoutReceipts.get(requestId);
      if (prior) {
        if (
          prior.request.inputId !== inputId ||
          prior.request.observationId !== observationId
        )
          throw new Error("fixture_queue_request_id_reused");
        return prior.result;
      }
      if (this.queueActionReceipts.has(requestId))
        throw new Error("fixture_queue_request_id_reused");
      if (this.checkedOut || observationId !== `observation-${this.revision}`)
        throw new Error("stale_session_revision");
      const item = this.queued(inputId);
      if (item.goalStart) throw new Error("fixture_queued_input_unavailable");
      const checkoutId = requestId;
      this.checkedOut = {
        checkoutId,
        item,
        position: this.waiting.indexOf(item),
      };
      this.waiting = this.waiting.filter((row) => row !== item);
      this.updateInputReceipt(inputId, "checked_out", null);
      const result = { checkoutId, message: this.describeQueued(item) };
      this.checkoutReceipts.set(requestId, { request, result });
      this.queueActionReceipts.set(requestId, {
        receipt: {
          action: "checkout",
          checkoutId,
          inputId,
          requestId,
          sessionId: this.sessionId,
          sessionRevision: this.revision + 1,
        },
      });
      this.changed();
      return result;
    },
    reinsert: async (_, request) => {
      const { checkoutId, requestId, text, attachments } = request;
      const prior = this.reinsertReceipts.get(requestId);
      if (prior) {
        if (
          prior.request.checkoutId !== checkoutId ||
          prior.request.text !== text ||
          prior.request.attachments !== attachments
        )
          throw new Error("fixture_queue_request_id_reused");
        return prior.result;
      }
      if (this.queueActionReceipts.has(requestId))
        throw new Error("fixture_queue_request_id_reused");
      const checkout = this.checkedOut;
      if (checkout?.checkoutId !== checkoutId)
        throw new Error("fixture_queue_checkout_unavailable");
      if (text !== undefined || attachments !== undefined) {
        try {
          await this.submission.wait();
        } catch {
          const result = { outcome: "refused" } as const;
          this.reinsertReceipts.set(requestId, { request, result });
          return result;
        }
      }
      if (this.checkedOut !== checkout)
        throw new Error("fixture_queue_checkout_unavailable");
      const item =
        text === undefined && attachments === undefined
          ? checkout.item
          : this.revisedQueuedItem(
              checkout.item,
              text ?? checkout.item.text,
              attachments
            );
      this.restoreQueuePosition(checkout, item);
      if (item.id !== checkout.item.id)
        this.updateInputReceipt(checkout.item.id, "superseded", null, item.id);
      this.updateInputReceipt(item.id, "queued", null);
      const receipt = {
        requestId,
        sessionId: this.sessionId,
        sessionRevision: this.revision + 1,
      };
      const result = { outcome: "reinserted", receipt } as const;
      this.reinsertReceipts.set(requestId, { request, result });
      this.queueActionReceipts.set(requestId, {
        receipt: {
          ...receipt,
          action: "reinsert",
          checkoutId,
          inputId: item.id,
        },
      });
      this.changed();
      return result;
    },
    receipt: async (_, requestId) =>
      this.queueActionReceipts.get(requestId)?.receipt ?? null,
    read: async (_, checkoutId, inputId) => {
      const checkout = this.checkedOut;
      if (checkout?.checkoutId !== checkoutId || checkout.item.id !== inputId)
        throw new Error("queue_checkout_unavailable");
      return this.describeQueued(checkout.item);
    },
    readAttachmentPreview: async (_, checkoutId, previewId) => {
      const checkout = this.checkedOut;
      if (
        checkout?.checkoutId !== checkoutId ||
        !checkout.item.attachments?.some(
          (entry) => entry.previewId === previewId
        )
      )
        throw new Error("fixture_image_unavailable");
      return this.imagePreview(previewId);
    },
  };

  private describeQueued({ id, text, attachments, goalStart }: CapturedInput) {
    return {
      inputId: id,
      text,
      attachments,
      attachmentIndexes: attachments?.map((_, index) => index) ?? [],
      textEditable: !goalStart,
      textOnly: !attachments?.length,
    };
  }

  private restoreQueuePosition(
    checkout: QueueCheckout,
    item: CapturedInput
  ): void {
    const next = [...this.waiting];
    next.splice(checkout.position, 0, item);
    this.waiting = next;
    this.checkedOut = undefined;
  }

  private removeQueued(index: number) {
    const next = [...this.waiting];
    const [item] = next.splice(index, 1);
    this.waiting = next;
    if (this.checkedOut && index < this.checkedOut.position)
      this.checkedOut.position--;
    return item;
  }

  private attachmentCard(
    input: NativeChatAttachmentInput
  ): NativeChatMessageAttachment {
    if (input.kind === "image" || input.kind === "png") {
      const previewId = crypto.randomUUID();
      const source = input.kind === "image" ? input.file : input.bytes;
      this.imageBytes.set(previewId, source);
      return input.kind === "image"
        ? {
            name: input.file.name,
            size: input.file.size,
            mimeType: input.file.type,
            previewId,
          }
        : {
            name: input.name,
            size: input.bytes.byteLength,
            mimeType: "image/png",
            previewId,
          };
    }
    return input.kind === "reference"
      ? {
          name: input.file.name,
          mimeType: input.mimeType,
          ...(input.mimeType !== "inode/directory" && {
            size: input.file.size,
          }),
          preview: input.preview,
        }
      : { name: input.name, size: input.bytes.byteLength };
  }

  private revisedQueuedItem(
    item: CapturedInput,
    text: string,
    edit?: NativeChatQueueReinsertRequest["attachments"]
  ): CapturedInput {
    const attachments =
      edit === undefined
        ? item.attachments
        : edit.map((entry) => {
            if (entry.kind !== "keep") return this.attachmentCard(entry);
            const original = item.attachments?.[entry.index];
            if (!original)
              throw new Error("fixture_queue_attachment_unavailable");
            return original;
          });
    if (!text.trim() && !attachments?.length)
      throw new Error("fixture_empty_queued_message");
    return {
      ...item,
      id: crypto.randomUUID(),
      text,
      attachments,
      steerableAttachments:
        edit?.map((entry) =>
          entry.kind === "keep"
            ? this.canSteerAttachment(item, entry.index)
            : entry.kind !== "file"
        ) ?? item.steerableAttachments,
    };
  }

  private startReply(item: CapturedInput, turnId = `${item.id}-turn`) {
    this.activeReply = item;
    this.running = true;
    this.paused = false;
    this.settled = false;
    this.liveTurnId = turnId;
    const { id, text, attachments, displayParts, svgSelection, modelId } = item;
    if (item.goalContinuation) {
      this.goal.reserve(turnId);
    } else {
      if (item.goalStart) {
        this.goalInput = item;
        this.goal.start(id, turnId, item.goalStart);
      }
      this.messages = [
        ...this.messages,
        {
          messageId: id,
          inputId: id,
          role: "user",
          turnId,
          text,
          attachments,
          displayParts,
          svgSelection,
        },
      ];
      this.updateInputReceipt(id, "claimed", turnId);
    }
    this.records = [
      ...this.records,
      {
        turnId,
        modelId,
        status: null,
        startedAtMs: Date.now(),
        ...(item.goalStart && { goalStart: true }),
      },
    ];
    this.scheduleReply();
  }

  private continueGoal() {
    if (!this.goalInput || this.goal.read(this.revision).goal?.paused) return;
    this.startReply({
      ...this.goalInput,
      id: `${this.goalInput.id}-followup-${this.revision + 1}`,
      goalStart: undefined,
      goalContinuation: true,
    });
  }

  private setReplyPaused(paused: boolean) {
    this.paused = paused;
    if (paused) this.clearReplyTimer();
    else {
      this.scheduleReply();
      const ready = this.compactionWork?.resume;
      if (ready) queueMicrotask(ready);
    }
  }

  private updateInputReceipt(
    inputId: string,
    disposition: NativeChatAcceptance["disposition"],
    turnId: string | null,
    replacementInputId?: string
  ) {
    const previous = this.receipts.get(inputId);
    this.receipts.set(inputId, {
      sessionId: this.sessionId,
      inputId,
      inputPosition: previous?.inputPosition ?? this.revision + 1,
      turnId,
      disposition,
      ...(replacementInputId && { replacementInputId }),
    });
  }

  private mutateQueue(action: NativeChatQueueAction) {
    if (action.action === "resume") {
      if (this.running || (!this.admissionPaused && !this.waiting.length))
        throw new Error("fixture_queue_cannot_resume");
      this.admissionPaused = false;
      if (this.waiting.length) this.startReply(this.removeQueued(0));
      return;
    }
    const index = this.waiting.findIndex((item) => item.id === action.inputId);
    if (index < 0) throw new Error("fixture_queued_input_unavailable");
    if (action.action === "withdraw") {
      const item = this.removeQueued(index);
      this.updateInputReceipt(item.id, "withdrawn", null);
      return;
    }
    const [item] = this.waiting.slice(index, index + 1);
    const next = [...this.waiting];
    if (action.action === "replace" || action.action === "replaceText") {
      if (item.attachments?.length && action.action === "replace")
        throw new Error("fixture_attachment_requires_text_replacement");
      const replacement = this.revisedQueuedItem(item, action.text);
      next[index] = replacement;
      this.updateInputReceipt(item.id, "superseded", null, replacement.id);
      this.updateInputReceipt(replacement.id, "queued", null);
    } else {
      const destination =
        action.action === "place"
          ? action.index
          : index + (action.direction === "up" ? -1 : 1);
      next.splice(index, 1);
      next.splice(Math.max(0, destination), 0, item);
    }
    this.waiting = next;
  }

  private async accept(
    input: Input,
    selectedAttachments?: readonly NativeChatAttachmentInput[]
  ): Promise<NativeChatAcceptance> {
    const prior = this.receipts.get(input.inputId);
    if (prior) return prior;
    const modelId = this.settings.model(this.sessionId);
    try {
      await this.submission.wait();
    } catch (error) {
      if (!selectedAttachments?.length) throw error;
      throw new Error("native_chat_attachment_preparation_failed", {
        cause: error,
      });
    }
    const alreadyAccepted = this.receipts.get(input.inputId);
    if (alreadyAccepted) return alreadyAccepted;
    const displayParts = [...(input.messageContext?.displayParts ?? [])];
    for (const reference of input.skills ?? []) {
      const skill = this.skillCatalog().find(
        ({ uri }) => uri === reference.uri
      );
      if (!skill) throw new Error("selected_skill_changed");
      const { name, source, uri } = skill;
      displayParts.push({
        kind: "skill",
        version: 1,
        data: { name, source, uri },
      });
    }
    if (input.goalStart) {
      if (this.waiting.some((item) => item.goalStart))
        throw new Error("session_goal_queued");
      if (!this.goal.canStart) throw new Error("session_goal_exists");
    }
    const {
      action,
      inputId,
      text,
      svgSelection,
      operatingRegime,
      effort,
      goalStart,
    } = input;
    const item: CapturedInput = {
      id: inputId,
      text,
      attachments:
        selectedAttachments?.map((entry) => this.attachmentCard(entry)) ??
        input.attachments,
      modelId,
      steerableAttachments: selectedAttachments?.map(
        (entry) => entry.kind !== "file"
      ),
      operatingRegime,
      effort,
      svgSelection,
      goalStart,
      ...(displayParts.length && { displayParts }),
    };
    if (
      action === "enqueue" ||
      this.running ||
      this.admissionPaused ||
      this.waiting.length > 0
    ) {
      this.waiting = [...this.waiting, item];
      this.updateInputReceipt(inputId, "queued", null);
    } else {
      this.startReply(item);
    }
    this.changed();
    return this.receipts.get(inputId)!;
  }

  private async imagePreview(previewId: string) {
    const source =
      this.imageBytes.get(previewId) ?? (await fixtures.readImage(previewId));
    return source instanceof Blob ? source.arrayBuffer() : source;
  }

  readonly bridge: DesktopNativeChat = {
    queueCheckout: this.queueCheckout,
    status: async () => "native-ready",
    takeNotificationFocus: async () => null,
    list: async () => ({
      sessionIds: [this.sessionId],
      titles: [{ sessionId: this.sessionId, title: "Example chat" }],
      nextCursor: null,
    }),
    skills: async () => this.skillCatalog(),
    acceptsEffort: async () => true,
    acceptsGoalEffort: async () => true,
    create: async () => ({
      sessionId: this.sessionId,
      attachmentId: this.sessionId,
    }),
    createFromDraft: async (draftId, manualApproval) =>
      this.settings.createFromDraft(draftId, this.sessionId, manualApproval),
    load: async (id) => ({ sessionId: id, attachmentId: id }),
    detach: async () => {},
    commands: async () => ["compact"],
    runCommand: async (_attachmentId, _command, requestId) => {
      const started = this.startCompaction(requestId);
      return started
        ? {
            command: "compact",
            turnId: started.turnId,
            status: await started.outcome,
          }
        : { command: "compact", turnId: null, status: "no_change" };
    },
    startCompaction: async (_attachmentId, requestId) => {
      const started = this.startCompaction(requestId);
      return started
        ? { requestId, turnId: started.turnId, status: "admitted" }
        : { requestId, turnId: null, status: "no_change" };
    },
    acceptsAttachments: async () => true,
    submitAttachments: async (_, { attachments, ...input }) =>
      this.accept(input, attachments),
    acceptsSelectedImage: async () => true,
    acceptsPng: async () => true,
    acceptsFile: async () => true,
    acceptsFileReference: async () => true,
    acceptsDirectoryReference: async () => true,
    canReferenceFile: (file) => file.type === "inode/directory",
    submitFileReference: async (_, input) =>
      this.accept(input, [
        {
          kind: "reference",
          file: input.file,
          mimeType: input.mimeType,
          preview: input.preview,
        },
      ]),
    acceptsQueuedTextReplacement: async () => true,
    submit: async (_, inputId, text) =>
      this.accept({ action: "submit", inputId, text }),
    enqueue: async (_, inputId, text) =>
      this.accept({ action: "enqueue", inputId, text }),
    submitMessage: async (_, input) =>
      this.accept({ ...input, action: input.action ?? "submit" }),
    submitInRegime: async (
      action,
      _,
      inputId,
      text,
      operatingRegime,
      effort,
      _svgTextTarget,
      _selectionRevision,
      _editorContextId,
      target,
      _webSearch,
      skills
    ) =>
      this.accept({
        action,
        inputId,
        text,
        operatingRegime,
        effort,
        ...(target && { svgSelection: true }),
        ...(skills?.length && { skills }),
      }),
    submitImage: async (_, input) => {
      this.imageBytes.set(input.inputId, input.png);
      return this.accept({
        ...input,
        attachments: [
          {
            name: "Image.png",
            mimeType: "image/png",
            previewId: input.inputId,
          },
        ],
      });
    },
    submitSelectedImage: async (_, input) => {
      this.imageBytes.set(input.inputId, await input.file.arrayBuffer());
      return this.accept({
        ...input,
        attachments: [
          {
            name: input.file.name,
            mimeType: input.file.type,
            previewId: input.inputId,
          },
        ],
      });
    },
    submitFile: async (_, input) =>
      this.accept({
        ...input,
        attachments: [{ name: input.name, size: input.bytes.byteLength }],
      }),
    publishEditorSurfaces: async () => {},
    editorSelectionContext: true,
    onEditorSvgSelection: () => () => {},
    inputReceipt: async (_, id) => {
      const receipt = this.receipts.get(id);
      if (!receipt) throw new Error("input_unavailable");
      return receipt;
    },
    observe: async () => ({
      observationId: `observation-${this.revision}`,
      snapshot: {
        sessionId: this.sessionId,
        sessionRevision: this.revision,
        current: this.running ? this.turn() : null,
        latest: this.settled ? this.turn() : null,
        queuedInputs: this.waiting.length,
        pendingGoalId: this.waiting.find((item) => item.goalStart)?.id,
        goalManualContinuationAvailable: true,
        attachmentBatches: true,
        compactionStart: true,
        queuePreview: this.queuePage(),
        ...(this.checkedOut && {
          queueCheckout: {
            checkoutId: this.checkedOut.checkoutId,
            inputId: this.checkedOut.item.id,
          },
        }),
        admissionPaused: this.admissionPaused,
        ...(!this.running &&
          this.waiting.length > 0 && {
            idleQueueResumeAvailable: true as const,
          }),
        historyRevisionAvailable: true,
        ...(this.bridge.subagentActivity && {
          subagentsAvailable: true,
          subagentActivityAvailable: true,
        }),
      },
    }),
    transcript: async () => this.messages,
    transcriptPage: async () => ({
      view: this.view,
      messages: this.messages,
      turns: this.records,
      older: null,
    }),
    subscribe: async (_, receive) => {
      await this.reconnect.wait();
      const id = crypto.randomUUID();
      this.subscribers.set(id, receive);
      return id;
    },
    unsubscribe: async (id) => {
      this.subscribers.delete(id);
      if (!this.subscribers.size) {
        clearTimeout(this.suggestionTimer);
        this.suggestionTimer = undefined;
      }
    },
    control: async (_, input) => {
      const prior = this.controlReceipts.get(input.requestId);
      if (prior) return prior;
      if (
        !this.running ||
        input.observationId !== `observation-${this.revision}`
      )
        throw new Error("stale_session_revision");
      if (input.action === "stop") {
        this.admissionPaused = true;
        this.settleTurn("cancelled", false);
      } else {
        this.setReplyPaused(input.action === "pause");
        this.changed();
      }
      const result =
        input.action === "resume"
          ? ({ action: "resume", turn: this.turn() } as const)
          : { action: input.action, receipt: this.receipt(input.requestId) };
      this.controlReceipts.set(input.requestId, result);
      return result;
    },
    queue: async () => this.queuePage(),
    queuedText: async (_, __, inputId) => this.queued(inputId).text,
    queuedMessage: async (_, __, inputId) =>
      this.describeQueued(this.queued(inputId)),
    editQueue: async (_, action) => {
      const prior = this.queueReceipts.get(action.requestId);
      if (prior) return prior;
      if (action.action === "replace" || action.action === "replaceText")
        await this.submission.wait();
      if (action.observationId !== `observation-${this.revision}`)
        throw new Error("stale_session_revision");
      this.mutateQueue(action);
      const receipt = {
        requestId: action.requestId,
        sessionId: this.sessionId,
        sessionRevision: this.revision + 1,
      };
      this.queueReceipts.set(action.requestId, receipt);
      this.changed();
      return receipt;
    },
    steerQueued: async (_, request) => {
      const { inputId, observationId, requestId } = request;
      const prior = this.queueActionReceipts.get(requestId);
      if (prior) {
        if (
          prior.receipt.action !== "steer" ||
          prior.receipt.inputId !== inputId ||
          prior.observationId !== observationId
        )
          throw new Error("fixture_queue_request_id_reused");
        return prior.receipt;
      }
      if (observationId !== `observation-${this.revision}`)
        throw new Error("stale_session_revision");
      const item = this.queued(inputId);
      if (!this.canSteerQueued(item))
        throw new Error("queue_steer_target_unavailable");
      const turnId = this.liveTurnId;
      this.removeQueued(this.waiting.indexOf(item));
      this.updateInputReceipt(inputId, "transferred", turnId);
      this.messages = [
        ...this.messages,
        {
          messageId: inputId,
          inputId,
          role: "user",
          turnId,
          text: item.text,
          attachments: item.attachments,
          displayParts: item.displayParts,
        },
      ];
      const receipt = {
        action: "steer",
        inputId,
        turnId,
        requestId,
        sessionId: this.sessionId,
        sessionRevision: this.revision + 1,
      } as const;
      this.queueActionReceipts.set(requestId, { receipt, observationId });
      this.changed();
      return receipt;
    },
    steer: async (_, input) => {
      const previous = this.steerReceipts.get(input.requestId);
      if (previous) {
        if (
          input.text !== previous.text ||
          input.observationId !== previous.observationId
        )
          throw new Error("request_identity_reused");
        return previous.receipt;
      }
      if (input.observationId !== `observation-${this.revision}`)
        throw new Error("stale_session_revision");
      if (!this.canFinishReply())
        throw new Error("queue_steer_target_unavailable");
      this.messages = [
        ...this.messages,
        {
          messageId: input.requestId,
          role: "user",
          text: input.text,
          turnId: this.liveTurnId,
        },
      ];
      this.changed();
      const receipt = this.receipt(input.requestId);
      this.steerReceipts.set(input.requestId, {
        text: input.text,
        observationId: input.observationId,
        receipt,
      });
      return receipt;
    },
    goal: async (_, observationId) => {
      if (observationId !== `observation-${this.revision}`)
        throw new Error("native_chat_goal_changed");
      return this.goal.read(this.revision);
    },
    controlGoal: async (_, change) =>
      this.goal.control(
        change,
        this.revision,
        this.running ? this.turn() : null,
        (effect) => {
          const turnId = this.running ? this.liveTurnId : null;
          if (effect === "pause" || effect === "resume")
            this.setReplyPaused(effect === "pause");
          if (effect === "clear" || effect === "restart")
            this.settleTurn("cancelled", effect === "clear", false);
          if (effect === "restart" || effect === "continue")
            this.continueGoal();
          this.changed();
          return { turnId, sessionRevision: this.revision };
        }
      ),
    startGoal: async (_, inputId, goalStart) =>
      this.accept({
        action: this.running ? "enqueue" : "submit",
        inputId,
        text: goalStart.objective,
        messageContext: goalStart.messageContext,
        goalStart,
        effort: goalStart.effort,
        operatingRegime: goalStart.operatingRegime,
      }),
    prepareRevision: async (_, __, messageId) => {
      const index = this.messages.findIndex(
        (entry) => entry.messageId === messageId
      );
      if (index < 0) throw new Error("fixture_message_unavailable");
      this.editMessageId = messageId;
      return {
        reviewId: messageId,
        messageId,
        text: this.messages[index].text,
        subsequentMessages: this.messages.length - index - 1,
      };
    },
    revise: async (_, input) => {
      const index = this.messages.findIndex(
        (entry) => entry.messageId === input.reviewId
      );
      if (index < 0 || this.editMessageId !== input.reviewId)
        throw new Error("fixture_message_unavailable");
      await this.submission.wait();
      const replacedTurnIds = new Set(
        this.messages.slice(index).map(({ turnId }) => turnId)
      );
      this.messages = this.messages.slice(0, index);
      this.records = this.records.filter(
        ({ turnId }) => !replacedTurnIds.has(turnId)
      );
      const inputId = crypto.randomUUID();
      this.startReply({
        id: inputId,
        text: input.text,
        operatingRegime: input.operatingRegime,
        effort: input.effort,
        modelId: this.settings.model(this.sessionId),
      });
      this.view++;
      this.changed();
      return {
        sessionId: this.sessionId,
        view: this.view,
        inputId,
        inputPosition: this.revision,
      };
    },
    readAttachmentPreview: async (_, previewId) => this.imagePreview(previewId),
    readQueuedAttachmentPreview: async (_, __, inputId, previewId) => {
      if (
        !this.queued(inputId).attachments?.some(
          (entry) => entry.previewId === previewId
        )
      )
        throw new Error("fixture_image_unavailable");
      return this.imagePreview(previewId);
    },
    approvals: async () =>
      this.waitingFor === "approval"
        ? [
            {
              reviewId: "printer-notes-review",
              tool: "read_file",
              root: "/Gallery project",
              relativePath: "printer-notes.md",
            },
          ]
        : [],
    answerApproval: async (_, reviewId, decision) =>
      this.finishRequest(
        reviewId,
        decision === "approve_once"
          ? "I’ll use the printer notes to prepare the handout."
          : "I’ll prepare the handout without the printer notes."
      ),
    questions: async () => this.questions,
    answerQuestion: async (_, reviewId, answer) => {
      await this.submission.wait();
      const question = this.questions.find(
        (question) => question.reviewId === reviewId
      );
      if (!question) throw new Error("question_no_longer_answerable");
      if ("questions" in question && answer.kind === "batch") {
        const replies = question.questions.map((item) => {
          const picked = answer.answers.find(
            ({ id }) => id === item.id
          )?.answer;
          const text =
            picked?.kind === "choice"
              ? item.options[picked.index]?.label
              : picked?.kind === "text"
                ? picked.text
                : picked?.kind === "skipped"
                  ? "The user skipped this question."
                  : undefined;
          if (text === undefined)
            throw new Error("fixture_invalid_question_answer");
          return {
            waitId: question.questionId,
            id: item.id,
            question: item.question,
            answer: text,
            ...(picked?.kind === "skipped" && { skipped: true as const }),
          };
        });
        this.questions = this.questions.filter((entry) => entry !== question);
        this.messages = [
          ...this.messages,
          {
            messageId: `${reviewId}-reply`,
            role: "user",
            turnId: this.liveTurnId,
            text: replies
              .map((reply) => `${reply.question}\n${reply.answer}`)
              .join("\n\n"),
            questionReplies: replies,
          },
        ];
        return this.finishRequest(
          reviewId,
          "I’ll use your answers to prepare the handout."
        );
      }
      if ("questions" in question || answer.kind === "batch")
        throw new Error("fixture_invalid_question_answer");
      this.questions = this.questions.filter((entry) => entry !== question);
      if (answer.kind === "skipped" && question.style === "answer_dependent")
        return this.finishRequest(
          reviewId,
          "I’ll leave the print quantity open for now."
        );
      this.messages = [
        ...this.messages,
        {
          messageId: `${reviewId}-reply`,
          role: "user",
          text:
            answer.kind === "choice"
              ? question.options[answer.index]
              : answer.kind === "text"
                ? answer.text
                : "The user skipped this question.",
          turnId: this.liveTurnId,
          questionReply: { waitId: reviewId, question: question.question },
        },
      ];
      this.revision++;
      if (question.style === "answer_dependent")
        return this.finishRequest(
          reviewId,
          "I’ll include that quantity in the print notes."
        );
      return this.receipt(reviewId);
    },
  };
}
