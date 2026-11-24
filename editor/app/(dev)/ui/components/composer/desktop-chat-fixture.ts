import type {
  DesktopNativeChat,
  NativeChatAcceptance,
  NativeChatAttachmentInput,
  NativeChatControlReceipt,
  NativeChatEffort,
  NativeChatMessage,
  NativeChatMessageAttachment,
  NativeChatOperatingRegime,
  NativeChatProfileCatalog,
  NativeChatPermissionState,
  NativeChatQuestion,
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

const SELECTION_DECK = "/quiet-tide.canvas";
const SELECTION_SLIDE = {
  kind: "svg",
  path: `${SELECTION_DECK}/slides/cover.svg`,
} as const;

type Input = {
  action: "submit" | "enqueue";
  inputId: string;
  text: string;
  operatingRegime?: NativeChatOperatingRegime;
  effort?: NativeChatEffort;
  attachments?: readonly NativeChatMessageAttachment[];
  svgSelection?: true;
  goalStart?: fixtures.Queued["goalStart"];
};

type QueuePosition = {
  item: fixtures.Queued;
  before: readonly string[];
  after: readonly string[];
};

type QueueCheckout = {
  item: fixtures.Queued;
  checkoutId: string;
  position: number;
};

/** Local implementation of the fragment of Desktop IPC used by the examples. */
export class DesktopChatFixture {
  readonly submission = new DesktopRequestFixture();
  readonly compaction = new DesktopRequestFixture();
  readonly modelsRead = new DesktopRequestFixture();
  readonly accessRead = new DesktopRequestFixture();
  readonly reconnect = new DesktopRequestFixture();
  readonly sessionId = crypto.randomUUID();
  private messages: readonly NativeChatMessage[];
  private records: NonNullable<conversations.Example["records"]>;
  private waiting: readonly fixtures.Queued[];
  private profiles: NativeChatProfileCatalog = fixtures.profiles;
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
    { turnId: string; outcome: Promise<"installed" | "failed"> }
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
  private revision = 0;
  private view = 0;
  private editMessageId?: string;
  private suggestionTimer?: ReturnType<typeof setTimeout>;

  constructor(
    readonly scenario: conversations.Scenario,
    queued: boolean
  ) {
    const example = conversations.get(scenario);
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
    if (scenario === "loading") {
      this.modelsRead.hold(true);
      this.accessRead.hold(true);
      const readTranscript = this.bridge.transcriptPage!;
      let opened = false;
      let openingAccess: Promise<void> | undefined;
      let permission: NativeChatPermissionState = {
        sessionId: this.sessionId,
        revision: 0,
        mode: "full_access",
        available: ["restricted", "full_access"],
      };
      Object.assign(this.bridge, {
        acceptsPermissionMode: async () => true,
        permissionMode: async () => {
          // Attaching and loading the first transcript read the same policy.
          // Give both reads the outcome chosen in the demo's opening controls.
          await (opened
            ? this.accessRead.wait()
            : (openingAccess ??= this.accessRead.wait()));
          return permission;
        },
        transcriptPage: async (attachmentId) => {
          opened = true;
          return readTranscript(attachmentId);
        },
        reviewPermissionMode: async () => ({
          reviewId: "fixture-access",
          chatTitle: "Gallery tour",
          workspaceName: "Gallery project",
        }),
        setPermissionMode: async (_, __, ___, mode, review) => {
          if (review?.confirmed === false) return null;
          permission = {
            ...permission,
            revision: permission.revision + 1,
            mode,
          };
          return permission;
        },
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
    this.compaction.reset();
    this.modelsRead.reset();
    this.accessRead.reset();
    this.reconnect.reset();
  }

  disconnect() {
    this.reconnect.hold(true);
    this.emit({ kind: "closed", reason: "delivery_limit" });
    this.subscribers.clear();
  }

  expireQuestions() {
    if (!this.questions.some((question) => question.expiresWithTurn)) return;
    this.questions = [];
    this.setRunning(false);
    this.submission.accept();
  }

  private finishRequest(requestId: string, text: string) {
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
    this.setRunning(false);
    return this.receipt(requestId);
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
    if (running && !this.readRunning() && this.scenario !== "streaming")
      this.liveTurnId = `${this.sessionId}-turn-${this.revision + 1}`;
    this.running = running;
    this.paused = false;
    this.settled = !running;
    this.records = this.records.map((record) =>
      record.turnId === this.liveTurnId
        ? {
            ...record,
            status: running ? null : "succeeded",
            settledAtMs: running ? undefined : record.startedAtMs + 5200,
          }
        : record
    );
    this.changed();
  }

  readonly readRunning = () => this.running && !this.paused;
  readonly subscribeRunning = (listener: () => void) => {
    this.runningListeners.add(listener);
    return () => this.runningListeners.delete(listener);
  };

  publishProgress(text: string) {
    const messageId = conversations.question.progressId;
    const message: NativeChatMessage = {
      messageId,
      role: "assistant",
      turnId: this.liveTurnId,
      phase: "progress",
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
    const blocked =
      !!this.waitingFor ||
      this.questions.some((question) => question.style === "answer_dependent");
    return {
      turnId: this.liveTurnId,
      epoch: 0,
      journalPosition: this.revision,
      historyPosition: this.messages.length,
      controlRevision: this.revision,
      paused: this.paused,
      cancelled: false,
      disposition: this.running
        ? this.paused || blocked
          ? "suspended"
          : "running"
        : "settled",
      status: this.running
        ? null
        : (this.records.find(({ turnId }) => turnId === this.liveTurnId)
            ?.status ?? "succeeded"),
      inputNeeded: !!this.questions.length || !!this.waitingFor,
    };
  }

  private receipt(requestId: string): NativeChatControlReceipt {
    return {
      sessionId: this.sessionId,
      turnId: this.liveTurnId,
      requestId,
      sessionRevision: this.revision,
      journalPosition: this.revision,
    };
  }

  private startCompaction(requestId: string) {
    if (this.scenario !== "compaction") return;
    const previous = this.compactionRequests.get(requestId);
    if (previous) return previous;
    if (this.running || this.waiting.length > 0)
      throw new Error("session_prompt_in_progress");
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
      this.running = false;
      this.settled = true;
      if (this.waiting.length) this.mutateQueue({ action: "resume" });
      this.changed();
      return succeeded ? ("installed" as const) : ("failed" as const);
    };
    const outcome = this.compaction.wait().then(
      () => settle(true),
      () => settle(false)
    );
    const started = { turnId, outcome };
    this.compactionRequests.set(requestId, started);
    this.changed();
    return started;
  }

  private canSteerQueued(item: fixtures.Queued): boolean {
    return (
      this.turn().disposition === "running" &&
      !item.goalStart &&
      item.operatingRegime !== "plan" &&
      item.effort !== "ultra" &&
      (item.attachments?.every((attachment) => !!attachment.previewId) ?? true)
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
          effort,
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

  private describeQueued({
    id,
    text,
    attachments,
    goalStart,
  }: fixtures.Queued) {
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
    item: fixtures.Queued
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

  private queuePosition(item: fixtures.Queued): QueuePosition {
    const index = this.waiting.indexOf(item);
    return {
      item,
      before: this.waiting.slice(0, index).map((row) => row.id),
      after: this.waiting.slice(index + 1).map((row) => row.id),
    };
  }

  private insertAtQueuePosition(
    position: QueuePosition,
    item: fixtures.Queued
  ): void {
    const indexOf = (id: string) =>
      this.waiting.findIndex((row) => row.id === id);
    const successor = position.after.map(indexOf).find((index) => index >= 0);
    const predecessor = position.before
      .map(indexOf)
      .findLast((index) => index >= 0);
    const index = successor ?? (predecessor ?? -1) + 1;
    this.waiting = [
      ...this.waiting.slice(0, index),
      item,
      ...this.waiting.slice(index),
    ];
  }

  /** Capture the original item before the confirmed withdrawal is recorded. */
  readonly captureQueueRemoval = (inputId: string) => {
    const item = this.waiting.find((row) => row.id === inputId);
    if (!item) return;
    const position = this.queuePosition(item);
    let removed = true;
    return (forward: boolean) => {
      if (forward === removed) return;
      if (forward) {
        if (!this.waiting.includes(item)) return;
        this.removeQueued(this.waiting.indexOf(item));
      } else {
        this.insertAtQueuePosition(position, item);
      }
      removed = forward;
      this.changed();
    };
  };

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
          size: input.file.size,
        }
      : { name: input.name, size: input.bytes.byteLength };
  }

  private revisedQueuedItem(
    item: fixtures.Queued,
    text: string,
    edit?: NativeChatQueueReinsertRequest["attachments"]
  ): fixtures.Queued {
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
    return { ...item, id: crypto.randomUUID(), text, attachments };
  }

  private mutateQueue(action: NativeChatQueueAction) {
    if (action.action === "resume") {
      if (this.running || !this.waiting.length)
        throw new Error("fixture_queue_cannot_resume");
      const item = this.removeQueued(0);
      this.running = true;
      this.paused = false;
      this.settled = false;
      this.liveTurnId = `${this.sessionId}-turn-${this.revision + 1}`;
      this.messages = [
        ...this.messages,
        {
          messageId: item.id,
          inputId: item.id,
          role: "user",
          turnId: this.liveTurnId,
          text: item.text,
          attachments: item.attachments,
        },
      ];
      this.records = [
        ...this.records,
        { turnId: this.liveTurnId, status: null, startedAtMs: Date.now() },
      ];
      return;
    }
    const index = this.waiting.findIndex((item) => item.id === action.inputId);
    if (index < 0) throw new Error("fixture_queued_input_unavailable");
    if (action.action === "withdraw") {
      this.removeQueued(index);
      return;
    }
    const [item] = this.waiting.slice(index, index + 1);
    const next = [...this.waiting];
    if (action.action === "replace" || action.action === "replaceText") {
      if (item.attachments?.length && action.action === "replace")
        throw new Error("fixture_attachment_requires_text_replacement");
      next[index] = this.revisedQueuedItem(item, action.text);
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
    try {
      await this.submission.wait();
    } catch (error) {
      if (!selectedAttachments?.length) throw error;
      throw new Error("native_chat_attachment_preparation_failed", {
        cause: error,
      });
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
    const attachments =
      selectedAttachments?.map((item) => this.attachmentCard(item)) ??
      input.attachments;
    const turnId = action === "submit" ? `${inputId}-turn` : null;
    if (!turnId) {
      this.waiting = [
        ...this.waiting,
        {
          id: inputId,
          text,
          attachments,
          operatingRegime,
          effort: effort === "ultra" ? effort : undefined,
          goalStart,
        },
      ];
    } else {
      const now = Date.now();
      this.liveTurnId = turnId;
      this.settled = true;
      this.messages = [
        ...this.messages,
        {
          messageId: inputId,
          inputId,
          turnId,
          role: "user",
          text,
          attachments,
          svgSelection,
        },
      ];
      this.records = [
        ...this.records,
        { turnId, status: "succeeded", startedAtMs: now, settledAtMs: now },
      ];
    }
    this.revision++;
    const receipt = {
      sessionId: this.sessionId,
      inputId,
      inputPosition: this.revision,
      turnId,
      disposition: turnId ? "completed" : "queued",
    } satisfies NativeChatAcceptance;
    this.receipts.set(inputId, receipt);
    return receipt;
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
    profiles: async () => {
      await this.modelsRead.wait();
      return this.profiles;
    },
    selectProfile: async (profile) => {
      this.profiles = {
        ...fixtures.profiles,
        active: profile.kind === "default" ? null : profile.id,
      };
    },
    acceptsEffort: async () => true,
    acceptsGoalEffort: async () => true,
    create: async () => ({
      sessionId: this.sessionId,
      attachmentId: this.sessionId,
    }),
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
    acceptsQueuedTextReplacement: async () => true,
    submit: async (_, inputId, text) =>
      this.accept({ action: "submit", inputId, text }),
    enqueue: async (_, inputId, text) =>
      this.accept({ action: "enqueue", inputId, text }),
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
      target
    ) =>
      this.accept({
        action,
        inputId,
        text,
        operatingRegime,
        effort,
        ...(target && { svgSelection: true }),
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
        attachmentBatches: true,
        compactionStart: true,
        queuePreview: this.queuePage(),
        ...(this.checkedOut && {
          queueCheckout: {
            checkoutId: this.checkedOut.checkoutId,
            inputId: this.checkedOut.item.id,
          },
        }),
        admissionPaused: false,
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
      if (input.action === "stop") this.setRunning(false);
      else {
        this.paused = input.action === "pause";
        this.changed();
      }
      return input.action === "resume"
        ? { action: "resume", turn: this.turn() }
        : { action: input.action, receipt: this.receipt(input.requestId) };
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
      this.messages = [
        ...this.messages,
        {
          messageId: inputId,
          inputId,
          role: "user",
          turnId,
          text: item.text,
          attachments: item.attachments,
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
      this.messages = [
        ...this.messages,
        {
          messageId: input.requestId,
          role: "user",
          text: input.text,
          turnId: this.liveTurnId,
        },
      ];
      this.revision++;
      return this.receipt(input.requestId);
    },
    goal: async () => ({ observationId: null, goal: null }),
    startGoal: async (_, inputId, goalStart) =>
      this.accept({
        action: this.running ? "enqueue" : "submit",
        inputId,
        text: goalStart.objective,
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
      this.messages = [
        ...this.messages.slice(0, index),
        {
          ...this.messages[index],
          text: input.text,
          svgSelection: undefined,
        },
      ];
      this.revision++;
      return {
        sessionId: this.sessionId,
        view: ++this.view,
        inputId: input.reviewId,
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
