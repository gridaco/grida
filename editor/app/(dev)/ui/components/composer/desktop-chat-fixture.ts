import type {
  DesktopNativeChat,
  NativeChatAcceptance,
  NativeChatControlReceipt,
  NativeChatEffort,
  NativeChatMessage,
  NativeChatMessageAttachment,
  NativeChatOperatingRegime,
  NativeChatProfileCatalog,
  NativeChatPermissionState,
  NativeChatQuestion,
  NativeChatQueueAction,
  NativeChatQueuePage,
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

/** Local implementation of the fragment of Desktop IPC used by the examples. */
export class DesktopChatFixture {
  readonly submission = new DesktopRequestFixture();
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
  private readonly imageBytes = new Map<string, ArrayBuffer>();
  private readonly receipts = new Map<string, NativeChatAcceptance>();
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
    this.questions = example.questions ?? [];
    this.waitingFor =
      scenario === "approval" || scenario === "library-request"
        ? scenario
        : null;
    this.liveTurnId = this.questions.length
      ? conversations.question.turnId
      : `${this.sessionId}-turn`;
    this.paused = scenario === "paused";
    const activeReply =
      scenario === "streaming" ||
      scenario === "suggested-prompt" ||
      this.paused;
    this.running =
      queued || !!this.questions.length || !!this.waitingFor || activeReply;
    this.waiting = queued ? fixtures.queue : [];
    this.messages =
      activeReply || this.waitingFor
        ? example.messages.map((message) => ({
            ...message,
            turnId: this.liveTurnId,
            ...(message.role === "assistant" && { phase: "answer" }),
          }))
        : example.messages;
    this.records = this.running
      ? [
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
      status: this.running ? null : "succeeded",
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

  private queuePage(): NativeChatQueuePage {
    return {
      offset: 0,
      previousOffset: null,
      nextOffset: null,
      items: this.waiting.map(
        ({
          id,
          text,
          attachments,
          unavailable,
          operatingRegime,
          effort,
          goalStart,
        }) => ({
          inputId: id,
          preview: text || null,
          attachments,
          operatingRegime,
          effort,
          goalStart,
          textOnly: !attachments?.length && !unavailable,
          textEditable: !unavailable && !goalStart,
        })
      ),
    };
  }

  private queued(inputId: string) {
    const item = this.waiting.find((item) => item.id === inputId);
    if (!item || item.unavailable)
      throw new Error("fixture_queued_input_unavailable");
    return item;
  }

  private mutateQueue(action: NativeChatQueueAction) {
    if (action.action === "resume") return;
    const index = this.waiting.findIndex((item) => item.id === action.inputId);
    if (index < 0) throw new Error("fixture_queued_input_unavailable");
    const [item] = this.waiting.slice(index, index + 1);
    const next = [...this.waiting];
    if (action.action === "withdraw") next.splice(index, 1);
    else if (action.action === "replace" || action.action === "replaceText") {
      next[index] = { ...item, id: crypto.randomUUID(), text: action.text };
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

  private async accept(input: Input): Promise<NativeChatAcceptance> {
    const prior = this.receipts.get(input.inputId);
    if (prior) return prior;
    await this.submission.wait();
    const {
      action,
      inputId,
      text,
      attachments,
      svgSelection,
      operatingRegime,
      effort,
      goalStart,
    } = input;
    const queued = action === "enqueue";
    if (queued) {
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
      this.messages = [
        ...this.messages,
        {
          messageId: inputId,
          role: "user",
          text,
          attachments,
          svgSelection,
        },
      ];
    }
    this.revision++;
    const receipt = {
      sessionId: this.sessionId,
      inputId,
      inputPosition: this.revision,
      turnId: null,
      disposition: queued ? "queued" : "completed",
    } satisfies NativeChatAcceptance;
    this.receipts.set(inputId, receipt);
    return receipt;
  }

  private async imagePreview(previewId: string) {
    return (
      this.imageBytes.get(previewId) ??
      (await fixtures.readImage(previewId)).arrayBuffer()
    );
  }

  readonly bridge: DesktopNativeChat = {
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
    runCommand: async () => ({
      command: "compact",
      turnId: null,
      status: "no_change",
    }),
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
        queuePreview: this.queuePage(),
        admissionPaused: false,
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
    queuedMessage: async (_, __, inputId) => {
      const { text, attachments, goalStart } = this.queued(inputId);
      return {
        inputId,
        text,
        attachments,
        textEditable: !goalStart,
        textOnly: !attachments?.length,
      };
    },
    editQueue: async (_, action) => {
      this.mutateQueue(action);
      return {
        requestId: action.requestId,
        sessionId: this.sessionId,
        sessionRevision: ++this.revision,
      };
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
