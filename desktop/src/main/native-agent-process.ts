import type { ChatGptTurnCapabilities } from "@grida/ai-host";
// GRIDA-SEC-004 / GRIDA-SEC-008 — main-owned ACP connection to the packaged agent.
import { AsyncLocalStorage } from "node:async_hooks";
import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { clearTimeout, setTimeout } from "node:timers";
import { promisify } from "node:util";
import type { NativeEditorSurfaceSnapshot } from "@grida/desktop-bridge";
import { NativeProviderRoutes } from "./native-provider-routes";
import { NativeProviderSelection } from "./native-provider-selection";
import { NativeAgentArtifacts } from "./native-agent-artifacts";
import { NativeAgentBackgroundProcesses } from "./native-agent-background-processes";
import { NativeAgentDeletion } from "./native-agent-deletion";
import { NativeAgentCommands } from "./native-agent-commands";
import { NativeCommandProfiles } from "./native-agent-command-profile";
import { NativeAgentHooks } from "./native-agent-hooks";
import { NativeAgentRevisions } from "./native-agent-revisions";
import type { NativeMcpLaunch } from "./native-mcp-launch";
import { NativeAgentGoals } from "./native-agent-goals";
import { NativeChatTitle } from "./native-chat-title";
import {
  NativeImageGeneration,
  type ImageReferenceReview,
} from "./native-image-generation";
import { NativeImagePlacement } from "./native-image-placement";
import { NativeFileReference } from "./native-file-reference";
import { NativeInputImages } from "./native-input-images";
import { NativeToolImages } from "./native-tool-images";
import { NativeQueuedMessages } from "./native-queued-messages";
import { NativeSubagentActivity } from "./native-subagent-activity";
import { NativeActivityOrder } from "./native-activity-order";
import { NativeSelectedImages } from "./native-selected-images";
import {
  NativeEditorSurfaceEndpoints,
  type NativeEditorSurfaceDelivery,
  type NativeEditorSvgSelectionDelivery,
  type NativeEditorSvgTextDelivery,
} from "./native-editor-surfaces";
import type { DesktopBrowserToolLease } from "./desktop-browser-tools";
import { NativeDesktopTools } from "./native-desktop-tools";
import {
  NativeAgentPermissions,
  type NativeWorkspaceSelection,
} from "./native-agent-permissions";
import {
  NativeProviderEgress,
  type NativeProviderNetwork,
} from "./native-provider-egress";
import {
  NativeGatewayConnection,
  type NativeGatewayBilling,
} from "./native-gateway-connection";

const FRAME_LIMIT = 1024 * 1024;
const REQUEST_LIMIT = 16;
const EDITOR_BUSY_REPLY_LIMIT = 8 * 1024;
const START_TIMEOUT_MS = 10_000;
const readAgentHelp = promisify(execFile);
const SHUTDOWN_TIMEOUT_MS = 12_000;
const KILL_TIMEOUT_MS = 2_000;
const SESSION_EFFORT = "co.grida/session/effort";
const LIBRARY_SELECTION_CAPABILITIES = {
  "co.grida/session/library-selections": 1,
  "co.grida/session/answer-library-selection": 1,
} as const;
const CATALOG_QUERY = "co.grida/session/catalog-query";
export const QUESTION_BATCHES = {
  list: "co.grida/session/questions-v2",
  answer: "co.grida/session/answer-question-v2",
} as const;
const QUESTION_ADMISSION_METHODS = new Set([
  "_co.grida/session/submit",
  "_co.grida/session/enqueue",
  "_co.grida/session/replace",
  "_co.grida/session/revise",
  "_co.grida/goal/start",
]);
export const TRANSCRIPT_WINDOW = "co.grida/session/transcript-window";
export const PREDICT_PROMPT = "co.grida/session/predict-prompt";
const MODEL_CHANGE = "co.grida/session/model-change";
const SUBAGENT_CAPABILITIES = {
  "co.grida/subagent/list": 1,
  "co.grida/subagent/create": 1,
  "co.grida/subagent/assign": 1,
  "co.grida/subagent/inspect": 1,
  "co.grida/subagent/pause": 1,
  "co.grida/subagent/resume": 1,
  "co.grida/subagent/stop": 1,
} as const;
const CHILD_STEERING = "co.grida/subagent/steer";
const CHILD_MESSAGING = "co.grida/subagent/send-message";
const CHILD_QUEUE = [
  "co.grida/subagent/resume-queue",
  "co.grida/subagent/withdraw",
] as const;

export type NativeAgentLaunch = {
  resourcesPath: string;
  stateDirectory: string;
  processCwd?: string;
  provider: "openai-compatible" | "responses" | "anthropic" | "gemini";
  endpoint: string;
  model: string;
  maxOutputTokens?: number;
  compatibleOutputLimitField?: "max-tokens";
  llamaCppInputCount?: true;
  /** The selected model accepts a reasoning level for each turn. */
  reasoning?: true;
  credentialHome?: string;
  configuredEndpointKey?: string;
  /** Main-owned settings identity, including anonymous configured endpoints. */
  configuredEndpointId?: string;
  workspaceConfiguration?: Readonly<{ directory: string; epoch: string }>;
  hooks?: NativeAgentHooks;
  providerNetwork?: NativeProviderNetwork;
  inputRouteConnectionId?: string | null;
  lookupProviderRoute?: NativeProviderRoutes.Lookup;
  lookupPredictionRoute?: NativeProviderRoutes.PredictionLookup;
  gatewayScope?: string;
  gatewayJobBilling?: NativeGatewayConnection["readJobBilling"];
  subscriptionScope?: string;
  subscriptionCapabilities?: () => Promise<ChatGptTurnCapabilities>;
  /** Trusted Main opt-in for child work on the selected provider connection. */
  subagents?: true;
  /** Title an untitled chat from its first request (one extra model request). */
  chatTitles?: true;
  mcp?: NativeMcpLaunch;
  workspace?: NativeWorkspaceSelection;
  imageGeneration?: NativeImageGeneration;
  imagePlacement?: NativeImagePlacement;
  reviewImageReference?: ImageReferenceReview;
  capabilities?: Readonly<Record<string, 1>>;
  onSessionUpdate?: (params: unknown) => void;
};
const EDITOR_CONTEXT = "co.grida/session/editor-context";
const MESSAGE_CONTEXT = "co.grida/session/message-context";

type Pending = {
  method: string;
  prediction?: AbortController;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type EditorRequest = {
  controller: AbortController;
  reply?: {
    bytes: Buffer;
    ifRevoked?: () => Buffer | undefined;
  };
};

type GatewayAttempt = Readonly<{
  sessionId: string;
  turnId: string;
  operationId: string;
  attemptId: string;
  child?: Readonly<{ childId: string; inputId: string }>;
}>;

/** Exact child custody after the bounded stop attempt has run out of time. */
export class NativeAgentTerminationPending extends Error {
  readonly terminated: Promise<void>;
  private observed = false;

  constructor(exited: Promise<unknown>) {
    super("native_agent_shutdown_unverified");
    this.terminated = exited.then(() => {
      this.observed = true;
    });
  }

  get hasExited(): boolean {
    return this.observed;
  }
}

export class NativeAgentProcess {
  private static readonly scopedApprovalProbes = new Map<
    string,
    { identity: string; supported: Promise<boolean> }
  >();
  readonly permissions?: NativeAgentPermissions;
  private readonly pending = new Map<number, Pending>();
  private readonly providerRequests = new Set<number | string>();
  private readonly gatewayBillingRequests = new Map<
    number | string,
    AbortController
  >();
  private readonly editorEndpoints: NativeEditorSurfaceEndpoints;
  private readonly buffer = Buffer.allocUnsafe(FRAME_LIMIT);
  private readonly decoder = new TextDecoder("utf-8", { fatal: true });
  private readonly exited: Promise<{
    code: number | null;
    signal: string | null;
  }>;
  private buffered = 0;
  private nextId = 1;
  private ready = false;
  private imageInput = false;
  private imageGenerationEnabled = false;
  private imageReference = false;
  private imagePlacementEnabled = false;
  private imageAttachmentEnabled = false;
  private imageWorkspaceReferenceEnabled = false;
  private librarySelection = false;
  private fileInput = false;
  private fileReference = false;
  private inputImages = false;
  private toolImages = false;
  private inputImageChunks = false;
  private queuedMessages = false;
  private queuedTextReplacement = false;
  private selectedImage = false;
  private agentEffort = false;
  private historyRevision = false;
  private transcriptWindow = false;
  private activityOrder = false;
  private optionalQuestions = false;
  private questionBatches = false;
  private readonly questionBatchPreference = new AsyncLocalStorage<boolean>();
  private catalogQuery = false;
  private modelChange = false;
  private inputRoutes = false;
  private turnCapabilities = false;
  get acceptsTurnCapabilities() {
    return this.connected && this.turnCapabilities;
  }
  private predictionRoutes = false;
  get acceptsInputRoutes() {
    return this.connected && this.inputRoutes;
  }
  private changingModel = false;
  private gatewayBillingEnabled = false;
  private childGatewayBilling = false;
  private namedChildren = false;
  private childTurnControls = false;
  private childMessaging = false;
  private childQueueControls = false;
  private childActivity = false;
  private artifacts = false;
  private savedChatDeletion = false;
  private savedChatDeletionPreview = false;
  private backgroundProcesses = false;
  private goalCompletionReview = false;
  private goalManualContinuation = false;
  private goalFundedReview = false;
  private goalNamedChild = false;
  private goalSpending = false;
  private editorSurfaces = false;
  private editorSurfaceOpen = false;
  private editorSvgText = false;
  private editorBrowserTools = false;
  private editorBrowserMcp = false;
  private editorTools = false;
  private editorToolSources = false;
  private editorWorkbenchPaths = false;
  private editorContext = false;
  private editorToolContext = false;
  private messageContext = false;
  private initialTitle = false;
  private promptPrediction = false;
  private readonly editorRequests = new Map<string | number, EditorRequest>();
  private readonly editorBusyReplies = new Map<string | number, Buffer>();
  private editorBusyReplyBytes = 0;
  private chatSelection = false;
  private permissionMode = false;
  private readonly commandCapabilities = new Set<string>();
  private observedExit = false;
  private shutdown: Promise<void> | undefined;
  private failure: Error | undefined;

  private constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly onSessionUpdate?: (params: unknown) => void,
    permissions?: Readonly<{
      askRoots: ReadonlyMap<string, string>;
      settingsRoot?: string;
      scopedAccess?: ConstructorParameters<typeof NativeAgentPermissions>[3];
    }>,
    private readonly providerEgress?: NativeProviderEgress,
    private readonly imageGeneration?: NativeImageGeneration,
    private readonly imagePlacement?: NativeImagePlacement,
    private readonly reviewImageReference?: ImageReferenceReview,
    private readonly gatewayJobBilling?: NativeAgentLaunch["gatewayJobBilling"],
    private readonly providerRoutes?: NativeProviderRoutes,
    workspaceRoot?: string
  ) {
    this.editorEndpoints = new NativeEditorSurfaceEndpoints(workspaceRoot);
    if (permissions) {
      this.permissions = new NativeAgentPermissions(
        (method, params) => this.call(method, params),
        permissions.askRoots,
        permissions.settingsRoot,
        permissions.scopedAccess
      );
    }
    let diagnostics = "";
    this.exited = new Promise((resolve) => {
      child.once("close", (code, signal) => {
        this.observedExit = true;
        const diagnostic = /^grida-agent: ([a-z0-9_]{1,96})$/m.exec(
          diagnostics
        )?.[1];
        this.fail(new Error(diagnostic ?? "native_agent_disconnected"));
        resolve({ code, signal });
      });
    });
    child.once("error", () => this.disconnect("native_agent_spawn_failed"));
    child.stdin.on("error", () => this.disconnect("native_agent_input_failed"));
    child.stdout.on("error", () =>
      this.disconnect("native_agent_output_failed")
    );
    child.stdout.on("data", (chunk: Buffer) => this.receive(chunk));
    // Capture only a bounded prefix and project fixed host error codes.
    child.stderr.on("error", () =>
      this.disconnect("native_agent_diagnostics_failed")
    );
    child.stderr.on("data", (chunk: Buffer) => {
      if (diagnostics.length < 4096)
        diagnostics += chunk
          .subarray(0, 4096 - diagnostics.length)
          .toString("utf8");
    });
  }

  private onCatalogChanged?: (params: unknown) => void;

  get terminated() {
    return this.exited;
  }

  get connected(): boolean {
    return this.ready && !this.failure && !this.shutdown;
  }

  get hasExited(): boolean {
    return this.observedExit;
  }

  get acceptsPng(): boolean {
    return this.connected && this.imageInput;
  }

  get acceptsLibrarySelection(): boolean {
    return this.connected && this.librarySelection;
  }

  get acceptsTranscriptWindow(): boolean {
    return this.connected && this.transcriptWindow;
  }

  get acceptsActivityOrder(): boolean {
    return this.connected && this.activityOrder;
  }

  get acceptsCatalogQuery(): boolean {
    return this.connected && this.catalogQuery;
  }

  get acceptsOptionalQuestions(): boolean {
    return this.connected && this.optionalQuestions;
  }

  get acceptsQuestionBatches(): boolean {
    return this.connected && this.questionBatches;
  }

  get acceptsEditorContext(): boolean {
    return this.connected && this.editorContext;
  }

  get acceptsEditorToolContext(): boolean {
    return this.connected && this.editorToolContext;
  }

  get acceptsMessageContext(): boolean {
    return this.connected && this.messageContext;
  }

  get acceptsPromptPrediction(): boolean {
    return this.connected && this.promptPrediction;
  }

  get acceptsInitialTitle(): boolean {
    return this.connected && this.initialTitle;
  }

  get acceptsChildGatewayBilling(): boolean {
    return this.connected && this.childGatewayBilling;
  }

  get acceptsFile(): boolean {
    return this.connected && this.fileInput;
  }

  get acceptsFileReference(): boolean {
    return this.connected && this.fileReference;
  }

  get acceptsInputImages(): boolean {
    return this.connected && this.inputImages;
  }

  get acceptsToolImages(): boolean {
    return this.connected && this.toolImages;
  }

  get acceptsInputImageChunks(): boolean {
    return this.connected && this.inputImageChunks;
  }

  get acceptsQueuedMessages(): boolean {
    return this.connected && this.queuedMessages;
  }

  get acceptsQueuedTextReplacement(): boolean {
    return this.connected && this.queuedMessages && this.queuedTextReplacement;
  }

  get acceptsSelectedImage(): boolean {
    return this.connected && this.imageInput && this.selectedImage;
  }

  get supportsSelectedImage(): boolean {
    return this.connected && this.selectedImage;
  }

  get acceptsPermissionMode(): boolean {
    return this.connected && this.permissionMode;
  }

  get acceptsSelection(): boolean {
    return this.connected && this.chatSelection;
  }

  get acceptsEffort(): boolean {
    return this.connected && this.agentEffort;
  }

  get acceptsHistoryRevision(): boolean {
    return this.connected && this.historyRevision;
  }

  get acceptsGoalCompletion(): boolean {
    return this.connected && this.goalCompletionReview;
  }

  get acceptsGoalManualContinuation(): boolean {
    return this.connected && this.goalManualContinuation;
  }

  get acceptsGoalEffort(): boolean {
    return this.connected && this.goalFundedReview;
  }

  get acceptsGoalNamedChild(): boolean {
    return this.acceptsSubagents && this.goalNamedChild;
  }

  get acceptsGoalSpending(): boolean {
    return this.connected && this.goalSpending;
  }

  get acceptsSubagents(): boolean {
    return this.connected && this.namedChildren;
  }

  get acceptsSubagentTurnControls(): boolean {
    return this.acceptsSubagents && this.childTurnControls;
  }

  get acceptsSubagentMessaging(): boolean {
    return this.acceptsSubagents && this.childMessaging;
  }

  get acceptsSubagentQueueControls(): boolean {
    return this.acceptsSubagents && this.childQueueControls;
  }

  get acceptsSubagentActivity(): boolean {
    return this.acceptsSubagents && this.childActivity;
  }

  get acceptsArtifacts(): boolean {
    return this.connected && this.artifacts;
  }

  get acceptsSavedChatDeletion(): boolean {
    return this.connected && this.savedChatDeletion;
  }

  get acceptsSavedChatDeletionPreview(): boolean {
    return this.acceptsSavedChatDeletion && this.savedChatDeletionPreview;
  }

  get acceptsBackgroundProcesses(): boolean {
    return this.connected && this.backgroundProcesses;
  }

  get availableCommands() {
    return this.connected
      ? NativeAgentCommands.available((key) =>
          this.commandCapabilities.has(key)
        )
      : [];
  }

  static executable(resourcesPath: string): string {
    if (!path.isAbsolute(resourcesPath))
      throw new Error("native_agent_absolute_directory_required");
    const resources = path.join(resourcesPath, "native-agent");
    const executable = path.join(
      resources,
      process.platform === "win32" ? "grida-agent.exe" : "grida-agent"
    );
    const directory = fs.lstatSync(resources, { throwIfNoEntry: false });
    const file = fs.lstatSync(executable, { throwIfNoEntry: false });
    if (
      !directory?.isDirectory() ||
      !file?.isFile() ||
      (process.platform !== "win32" &&
        ((directory.mode & 0o022) !== 0 ||
          (file.mode & 0o022) !== 0 ||
          (file.mode & 0o111) === 0))
    ) {
      throw new Error("native_agent_installation_unavailable");
    }
    return executable;
  }

  /** Whether the packaged host can launch with scoped approvals before a chat exists. */
  static async supportsScopedApprovals(
    resourcesPath: string
  ): Promise<boolean> {
    if (process.platform !== "darwin" && process.platform !== "linux")
      return false;
    try {
      return await this.supportsScopedApprovalLaunch(
        this.executable(resourcesPath)
      );
    } catch {
      return false;
    }
  }

  /** The switch is parsed before ACP can advertise the host's permission modes. */
  private static async supportsScopedApprovalLaunch(
    executable: string
  ): Promise<boolean> {
    const [installed, file] = await Promise.all([
      fs.promises.realpath(executable).catch(() => undefined),
      fs.promises.lstat(executable, { bigint: true }).catch(() => undefined),
    ]);
    if (!installed || !file?.isFile()) return false;
    const identity = [
      file.dev,
      file.ino,
      file.size,
      file.mtimeNs,
      file.ctimeNs,
    ].join("/");
    const cached = this.scopedApprovalProbes.get(installed);
    if (cached?.identity === identity) return cached.supported;
    const supported: Promise<boolean> = readAgentHelp(
      executable,
      ["serve", "--help"],
      {
        env: {},
        timeout: 2000,
        killSignal: "SIGKILL",
        maxBuffer: 64 * 1024,
        encoding: "utf8",
        windowsHide: true,
      }
    )
      .then(({ stdout }) =>
        /^[ \t]*--allow-scoped-approvals[ \t]*\r?$/m.test(stdout)
      )
      .catch(() => {
        // A timeout or process error can clear on a later launch.
        if (this.scopedApprovalProbes.get(installed)?.supported === supported) {
          this.scopedApprovalProbes.delete(installed);
        }
        return false;
      });
    this.scopedApprovalProbes.set(installed, { identity, supported });
    return supported;
  }

  /** Metadata-only ACP host. Its client has no provider route or editor capabilities. */
  static async startCatalog(
    resourcesPath: string,
    registry: string,
    onChanged: (params: unknown) => void
  ): Promise<NativeAgentProcess | null> {
    const child = spawn(
      this.executable(resourcesPath),
      ["serve-catalog", "--stdio", "--catalog-registry", registry],
      {
        cwd: path.dirname(registry),
        env: {},
        shell: false,
        windowsHide: true,
        stdio: "pipe",
      }
    );
    const owner = new NativeAgentProcess(child);
    owner.onCatalogChanged = onChanged;
    try {
      const capabilities = {
        [CATALOG_QUERY]: 1,
        "co.grida/catalog/watch": 1,
        "co.grida/session/read-state": 1,
      };
      const reply = object(
        await owner.request(
          "initialize",
          { protocolVersion: 1, clientCapabilities: { _meta: capabilities } },
          START_TIMEOUT_MS
        )
      );
      const advertised = object(object(reply?.agentCapabilities)?._meta);
      if (
        reply?.protocolVersion !== 1 ||
        advertised?.["co.grida/catalog/watch"] !== 1 ||
        advertised?.[CATALOG_QUERY] !== 1
      ) {
        await owner.close();
        return null;
      }
      owner.ready = true;
      return owner;
    } catch (error) {
      await owner.close();
      // clap reports an unknown subcommand on binaries predating this capability.
      if ((await owner.exited).code === 2) return null;
      throw error;
    }
  }

  static async start(options: NativeAgentLaunch): Promise<NativeAgentProcess> {
    const imageGeneration = options.workspace
      ? options.imageGeneration
      : undefined;
    const routeImages = !!(
      options.workspace &&
      options.providerNetwork &&
      options.lookupProviderRoute
    );
    const imagePlacement =
      imageGeneration || routeImages ? options.imagePlacement : undefined;
    const reviewImageReference =
      imageGeneration?.supportsReference || routeImages
        ? options.reviewImageReference
        : undefined;
    const providerEgress = NativeProviderRoutes.egress({
      ...options,
      imageGeneration,
    });
    if (options.workspaceConfiguration && !options.providerNetwork)
      throw new Error("native_workspace_configuration_requires_supervision");
    if (options.subagents && !options.providerNetwork)
      throw new Error("native_agent_subagent_transport_unavailable");
    for (const directory of [
      options.resourcesPath,
      options.stateDirectory,
      options.processCwd,
    ]) {
      if (directory !== undefined && !path.isAbsolute(directory)) {
        throw new Error("native_agent_absolute_directory_required");
      }
    }
    const executable = NativeAgentProcess.executable(options.resourcesPath);
    const hooks = options.workspace
      ? await options.hooks?.launch(options.resourcesPath, options.workspace)
      : undefined;
    const permissionProfile = options.workspace
      ? await NativeAgentPermissions.stage(
          options.stateDirectory,
          options.workspace,
          hooks,
          await NativeCommandProfiles.launch(
            options.resourcesPath,
            options.workspace.primary.path,
            hooks,
            options.workspace.protectedPaths
          )
        )
      : undefined;
    const inputRoutes = !!(providerEgress && options.lookupProviderRoute);
    const predictionRoutes = !!(
      providerEgress && options.lookupPredictionRoute
    );
    const directLocalPrediction =
      !providerEgress &&
      NativeProviderSelection.isLoopbackEndpoint(options.endpoint);
    const providerRoutes =
      inputRoutes || predictionRoutes || options.subscriptionCapabilities
        ? new NativeProviderRoutes(
            options.inputRouteConnectionId ?? null,
            options,
            options.lookupProviderRoute,
            options.lookupPredictionRoute
          )
        : undefined;
    const capabilities: Record<string, 1> = {
      ...options.capabilities,
      ...(options.hooks ? NativeAgentHooks.capabilities : {}),
      ...(permissionProfile ? NativeAgentPermissions.capabilities : {}),
    };
    if (options.subagents) {
      // Review support is negotiated with the worker, independently of the
      // connection's provider and any optional monetary spending capability.
      delete capabilities[SESSION_EFFORT];
      delete capabilities[NativeAgentGoals.fundedReviewCapability];
      delete capabilities[NativeAgentGoals.namedChildCapability];
    }
    if (providerEgress) capabilities[NativeProviderEgress.capability] = 1;
    if (imageGeneration) capabilities[NativeImageGeneration.capability] = 1;
    const requestDeletion =
      process.platform === "darwin" || process.platform === "linux";
    const args = [
      "serve",
      "--stdio",
      "--state-dir",
      permissionProfile?.stateDirectory ?? options.stateDirectory,
      "--provider",
      options.provider,
      "--endpoint",
      options.endpoint,
      "--model",
      options.model,
    ];
    if (options.maxOutputTokens !== undefined)
      args.push("--max-output-tokens", String(options.maxOutputTokens));
    if (options.compatibleOutputLimitField !== undefined)
      args.push(
        "--compatible-output-limit-field",
        options.compatibleOutputLimitField
      );
    if (options.credentialHome)
      args.push("--credential-home", options.credentialHome);
    if (providerEgress) args.push("--supervised-provider");
    if (options.llamaCppInputCount) args.push("--llama-cpp-input-count");
    if (options.reasoning) args.push("--reasoning");
    if (imageGeneration)
      args.push("--desktop-image-generation", imageGeneration.binding);
    if (options.workspaceConfiguration) {
      args.push(
        "--workspace-configuration",
        options.workspaceConfiguration.directory,
        "--workspace-configuration-epoch",
        options.workspaceConfiguration.epoch
      );
    }
    if (options.configuredEndpointKey !== undefined)
      args.push(
        "--supervised-configured-endpoint-key",
        options.configuredEndpointKey
      );
    if (options.gatewayScope)
      args.push("--supervised-gateway-scope", options.gatewayScope);
    if (options.subagents) args.push("--subagents");
    if (options.chatTitles) args.push("--chat-titles");
    if (options.subscriptionScope)
      args.push("--supervised-chatgpt-scope", options.subscriptionScope);
    if (permissionProfile)
      args.push("--permission-profile", permissionProfile.profile);
    // Keep the content-derived profile path stable for work accepted by an
    // earlier binary. The launcher selects additional per-action capabilities.
    const scopedAccess =
      permissionProfile?.scopedAccess &&
      (await this.supportsScopedApprovalLaunch(executable))
        ? permissionProfile.scopedAccess
        : undefined;
    if (scopedAccess) args.push("--allow-scoped-approvals");
    const environment = nativeEnvironment();
    if (options.mcp) {
      if (!options.workspace || !options.gatewayScope)
        throw new Error("native_desktop_mcp_gateway_workspace_required");
      await options.mcp.extendChild(
        options.workspace.primary.path,
        options.gatewayScope,
        args,
        environment
      );
    }
    const processOwner = new NativeAgentProcess(
      spawn(executable, args, {
        ...(options.processCwd && { cwd: options.processCwd }),
        env: environment,
        shell: false,
        windowsHide: true,
        stdio: "pipe",
      }),
      options.onSessionUpdate,
      permissionProfile && {
        askRoots: permissionProfile.askRoots,
        scopedAccess,
        // The host keeps the agent settings file in the workspace
        // configuration folder, or in its own state folder.
        settingsRoot: await fs.promises.realpath(
          options.workspaceConfiguration?.directory ??
            permissionProfile.stateDirectory
        ),
      },
      providerEgress,
      imageGeneration,
      imagePlacement,
      reviewImageReference,
      options.gatewayJobBilling,
      providerRoutes,
      options.workspace?.primary.path
    );
    try {
      const response = object(
        await processOwner.request(
          "initialize",
          {
            protocolVersion: 1,
            clientCapabilities: {
              _meta: {
                ...capabilities,
                ...(routeImages && { [NativeImageGeneration.capability]: 1 }),
                ...((imageGeneration?.supportsReference || routeImages) && {
                  [NativeImageGeneration.referenceCapability]: 1,
                }),
                ...(imagePlacement && { [NativeImagePlacement.capability]: 1 }),
                ...(reviewImageReference && {
                  [NativeImageGeneration.attachmentCapability]: 1,
                  [NativeImageGeneration.workspaceReferenceCapability]: 1,
                }),
                ...NativeAgentCommands.capabilities,
                ...NativeAgentRevisions.capabilities,
                [NativeAgentGoals.completionCapability]: 1,
                [NativeAgentGoals.manualContinuationCapability]: 1,
                ...(((options.gatewayScope && options.gatewayJobBilling) ||
                  inputRoutes) && {
                  [NativeAgentGoals.spendingCapability]: 1,
                }),
                ...(options.subagents && {
                  ...SUBAGENT_CAPABILITIES,
                  [CHILD_STEERING]: 1,
                  [CHILD_MESSAGING]: 1,
                  [CHILD_QUEUE[0]]: 1,
                  [CHILD_QUEUE[1]]: 1,
                  [NativeSubagentActivity.capability]: 1,
                  [SESSION_EFFORT]: 1,
                }),
                ...(options.subagents && {
                  [NativeAgentGoals.fundedReviewCapability]: 1,
                  [NativeAgentGoals.namedChildCapability]: 1,
                }),
                [NativeEditorSurfaceEndpoints.capability]: 1,
                ...(options.workspace && { [EDITOR_CONTEXT]: 1 }),
                [MESSAGE_CONTEXT]: 1,
                [NativeChatTitle.capability]: 1,
                ...((predictionRoutes || directLocalPrediction) && {
                  [PREDICT_PROMPT]: 1,
                }),
                ...(providerEgress && {
                  [NativeEditorSurfaceEndpoints.openCapability]: 1,
                  [NativeEditorSurfaceEndpoints.svgTextCapability]: 1,
                  [NativeEditorSurfaceEndpoints.browserCapability]: 1,
                  [NativeDesktopTools.capability]: 1,
                  [NativeDesktopTools.browserCapability]: 1,
                  [NativeDesktopTools.sourcesCapability]: 1,
                  ...(options.workspace && {
                    [NativeDesktopTools.workbenchPathsCapability]: 1,
                  }),
                  [NativeEditorSurfaceEndpoints.toolContextCapability]: 1,
                }),
                [NativeAgentArtifacts.capability]: 1,
                [NativeAgentBackgroundProcesses.capability]: 1,
                ...((options.gatewayJobBilling || inputRoutes) && {
                  [NativeGatewayConnection.billingCapability]: 1,
                  [NativeGatewayConnection.childBillingCapability]: 1,
                }),
                ...(options.workspace && LIBRARY_SELECTION_CAPABILITIES),
                "co.grida/session/selected-file": 1,
                [NativeFileReference.capability]: 1,
                [NativeInputImages.capability]: 1,
                [NativeInputImages.chunkCapability]: 1,
                [NativeToolImages.capability]: 1,
                [NativeQueuedMessages.capability]: 1,
                [NativeQueuedMessages.replaceTextCapability]: 1,
                [NativeSelectedImages.capability]: 1,
                [TRANSCRIPT_WINDOW]: 1,
                [CATALOG_QUERY]: 1,
                [QUESTION_BATCHES.list]: 1,
                [QUESTION_BATCHES.answer]: 1,
                [NativeActivityOrder.capability]: 1,
                [MODEL_CHANGE]: 1,
                ...(inputRoutes && { [NativeProviderRoutes.capability]: 1 }),
                ...((inputRoutes || options.subscriptionCapabilities) && {
                  [NativeProviderRoutes.turnCapability]: 1,
                }),
                ...(predictionRoutes && {
                  [NativeProviderRoutes.predictionCapability]: 1,
                }),
                "co.grida/session/selection": 1,
                "co.grida/session/permission-mode": 1,
                ...(requestDeletion && {
                  [NativeAgentDeletion.capability]: 1,
                  [NativeAgentDeletion.previewCapability]: 1,
                }),
              },
            },
          },
          START_TIMEOUT_MS
        )
      );
      if (
        response?.protocolVersion !== 1 ||
        object(response.agentInfo)?.name !== "grida-agent"
      ) {
        throw new Error("native_agent_protocol_incompatible");
      }
      const agentCapabilities = object(response.agentCapabilities);
      const advertised = object(agentCapabilities?._meta);
      processOwner.transcriptWindow = advertised?.[TRANSCRIPT_WINDOW] === 1;
      processOwner.catalogQuery = advertised?.[CATALOG_QUERY] === 1;
      processOwner.optionalQuestions =
        advertised?.["co.grida/session/optional-questions"] === 1;
      processOwner.questionBatches =
        advertised?.[QUESTION_BATCHES.list] === 1 &&
        advertised?.[QUESTION_BATCHES.answer] === 1;
      processOwner.activityOrder =
        advertised?.[NativeActivityOrder.capability] === 1;
      processOwner.modelChange = advertised?.[MODEL_CHANGE] === 1;
      processOwner.inputRoutes =
        inputRoutes && advertised?.[NativeProviderRoutes.capability] === 1;
      processOwner.turnCapabilities =
        !!providerRoutes &&
        advertised?.[NativeProviderRoutes.turnCapability] === 1;
      processOwner.predictionRoutes =
        predictionRoutes &&
        advertised?.[NativeProviderRoutes.predictionCapability] === 1;
      processOwner.permissionMode =
        advertised?.["co.grida/session/permission-mode"] === 1;
      processOwner.chatSelection =
        advertised?.["co.grida/session/selection"] === 1;
      processOwner.gatewayBillingEnabled =
        (options.gatewayJobBilling !== undefined || processOwner.inputRoutes) &&
        advertised?.[NativeGatewayConnection.billingCapability] === 1;
      processOwner.childGatewayBilling =
        processOwner.gatewayBillingEnabled &&
        advertised?.[NativeGatewayConnection.childBillingCapability] === 1;
      for (const [capability, version] of Object.entries(capabilities)) {
        if (advertised?.[capability] !== version)
          throw new Error("native_agent_capabilities_unavailable");
      }
      processOwner.imageInput =
        object(agentCapabilities?.promptCapabilities)?.image === true;
      const routedImages = routeImages && processOwner.inputRoutes;
      processOwner.imageGenerationEnabled =
        (!!imageGeneration || routedImages) &&
        advertised?.[NativeImageGeneration.capability] === 1;
      processOwner.imageReference =
        ((imageGeneration?.supportsReference === true &&
          processOwner.imageInput) ||
          routedImages) &&
        advertised?.[NativeImageGeneration.referenceCapability] === 1;
      processOwner.imagePlacementEnabled =
        (imageGeneration !== undefined || routedImages) &&
        imagePlacement !== undefined &&
        advertised?.[NativeImagePlacement.capability] === 1;
      processOwner.imageAttachmentEnabled =
        reviewImageReference !== undefined &&
        (processOwner.imageInput || routedImages) &&
        advertised?.[NativeImageGeneration.attachmentCapability] === 1;
      processOwner.imageWorkspaceReferenceEnabled =
        (imageGeneration?.supportsReference === true || routedImages) &&
        reviewImageReference !== undefined &&
        advertised?.[NativeImageGeneration.workspaceReferenceCapability] === 1;
      processOwner.librarySelection =
        options.workspace !== undefined &&
        (processOwner.imageInput || routedImages) &&
        Object.keys(LIBRARY_SELECTION_CAPABILITIES).every(
          (key) => advertised?.[key] === 1
        );
      processOwner.fileInput =
        advertised?.["co.grida/session/selected-file"] === 1;
      processOwner.fileReference =
        advertised?.[NativeFileReference.capability] === 1;
      processOwner.inputImages =
        advertised?.[NativeInputImages.capability] === 1;
      processOwner.inputImageChunks =
        advertised?.[NativeInputImages.chunkCapability] === 1;
      processOwner.toolImages = advertised?.[NativeToolImages.capability] === 1;
      processOwner.queuedMessages =
        advertised?.[NativeQueuedMessages.capability] === 1;
      processOwner.queuedTextReplacement =
        advertised?.[NativeQueuedMessages.replaceTextCapability] === 1;
      processOwner.selectedImage =
        advertised?.[NativeSelectedImages.capability] === 1;
      processOwner.agentEffort =
        options.subagents === true && advertised?.[SESSION_EFFORT] === 1;
      processOwner.historyRevision = Object.keys(
        NativeAgentRevisions.capabilities
      ).every((key) => advertised?.[key] === 1);
      processOwner.goalCompletionReview =
        advertised?.[NativeAgentGoals.completionCapability] === 1;
      processOwner.goalManualContinuation =
        advertised?.[NativeAgentGoals.manualContinuationCapability] === 1;
      processOwner.goalFundedReview =
        processOwner.agentEffort &&
        advertised?.[NativeAgentGoals.fundedReviewCapability] === 1;
      processOwner.goalSpending =
        ((!!options.gatewayScope && !!options.gatewayJobBilling) ||
          processOwner.inputRoutes) &&
        advertised?.[NativeAgentGoals.spendingCapability] === 1;
      processOwner.goalNamedChild =
        processOwner.goalFundedReview &&
        advertised?.[NativeAgentGoals.namedChildCapability] === 1;
      processOwner.namedChildren =
        options.subagents === true &&
        Object.keys(SUBAGENT_CAPABILITIES).every(
          (key) => advertised?.[key] === 1
        );
      processOwner.childTurnControls = advertised?.[CHILD_STEERING] === 1;
      processOwner.childMessaging = advertised?.[CHILD_MESSAGING] === 1;
      processOwner.childQueueControls = CHILD_QUEUE.every(
        (key) => advertised?.[key] === 1
      );
      processOwner.childActivity =
        advertised?.[NativeSubagentActivity.capability] === 1;
      for (const key of Object.keys(NativeAgentCommands.capabilities)) {
        if (advertised?.[key] === 1) processOwner.commandCapabilities.add(key);
      }
      processOwner.artifacts =
        advertised?.[NativeAgentArtifacts.capability] === 1;
      processOwner.backgroundProcesses =
        advertised?.[NativeAgentBackgroundProcesses.capability] === 1;
      processOwner.savedChatDeletion =
        requestDeletion && advertised?.[NativeAgentDeletion.capability] === 1;
      processOwner.savedChatDeletionPreview =
        requestDeletion &&
        advertised?.[NativeAgentDeletion.previewCapability] === 1;
      processOwner.editorSurfaces =
        providerEgress !== undefined &&
        advertised?.[NativeEditorSurfaceEndpoints.capability] === 1;
      processOwner.editorSurfaceOpen =
        processOwner.editorSurfaces &&
        advertised?.[NativeEditorSurfaceEndpoints.openCapability] === 1;
      processOwner.editorSvgText =
        processOwner.editorSurfaces &&
        advertised?.[NativeEditorSurfaceEndpoints.svgTextCapability] === 1;
      processOwner.editorBrowserTools =
        processOwner.editorSurfaces &&
        advertised?.[NativeEditorSurfaceEndpoints.browserCapability] === 1;
      processOwner.editorTools =
        processOwner.editorSurfaces &&
        advertised?.[NativeDesktopTools.capability] === 1;
      processOwner.editorBrowserMcp =
        processOwner.editorTools &&
        advertised?.[NativeDesktopTools.browserCapability] === 1;
      processOwner.editorToolSources =
        processOwner.editorTools &&
        advertised?.[NativeDesktopTools.sourcesCapability] === 1;
      processOwner.editorWorkbenchPaths =
        processOwner.editorToolSources &&
        options.workspace !== undefined &&
        advertised?.[NativeDesktopTools.workbenchPathsCapability] === 1;
      processOwner.editorToolContext =
        processOwner.editorTools &&
        advertised?.[NativeEditorSurfaceEndpoints.toolContextCapability] === 1;
      processOwner.editorContext =
        options.workspace !== undefined && advertised?.[EDITOR_CONTEXT] === 1;
      processOwner.messageContext =
        processOwner.transcriptWindow && advertised?.[MESSAGE_CONTEXT] === 1;
      processOwner.promptPrediction =
        (processOwner.predictionRoutes || directLocalPrediction) &&
        advertised?.[PREDICT_PROMPT] === 1;
      processOwner.initialTitle =
        advertised?.[NativeChatTitle.capability] === 1;
      processOwner.ready = true;
      return processOwner;
    } catch (error) {
      await processOwner.close();
      throw error;
    }
  }

  /** Keep the attached renderer's preference local to the admitting request. */
  withQuestionBatchPreference<T>(available: boolean, admit: () => T): T {
    return this.questionBatchPreference.run(available, admit);
  }

  request(
    method: string,
    params: unknown,
    timeoutMs = 130_000,
    permission?: AbortSignal
  ): Promise<unknown> {
    if (this.changingModel)
      return Promise.reject(new Error("native_chat_model_change_busy"));
    if (method === NativeAgentPermissions.answerMethod)
      return Promise.reject(new Error("native_agent_approval_requires_review"));
    if (method === `_${PREDICT_PROMPT}`)
      return this.predictPrompt(params, timeoutMs, permission);
    if (
      this.acceptsQuestionBatches &&
      this.questionBatchPreference.getStore() === false &&
      QUESTION_ADMISSION_METHODS.has(method)
    ) {
      const input = object(params);
      if (input)
        params = {
          ...input,
          _meta: {
            ...object(input._meta),
            [QUESTION_BATCHES.list]: false,
          },
        };
    }
    return this.call(method, params, timeoutMs);
  }

  private get predictionPermission(): AbortSignal | undefined {
    for (const request of this.pending.values())
      if (request.prediction) return request.prediction.signal;
    return undefined;
  }

  private async predictPrompt(
    params: unknown,
    timeoutMs: number,
    permission?: AbortSignal
  ): Promise<unknown> {
    if (
      !this.acceptsPromptPrediction ||
      permission?.aborted ||
      this.predictionPermission
    )
      return { text: null };
    const controller = new AbortController();
    const id = this.nextId;
    const cancel = () => {
      controller.abort();
      if (this.connected && this.pending.has(id)) {
        // Main revokes egress synchronously. ACP cancellation also stops the
        // worker while it is preparing a request or waiting on a provider.
        try {
          this.notify("$/cancel_request", { requestId: id });
        } catch {
          // A disconnected worker cannot receive cancellation. Its pending
          // prediction still has no authority to dispatch from Main.
        }
      }
    };
    permission?.addEventListener("abort", cancel, { once: true });
    try {
      // Keep the slot until the worker replies, including after opt-out. A
      // delayed resolver from this request cannot borrow a later opt-in.
      const result = await this.call(
        `_${PREDICT_PROMPT}`,
        params,
        timeoutMs,
        controller
      );
      return permission?.aborted ? { text: null } : result;
    } catch (error) {
      if (permission?.aborted) return { text: null };
      throw error;
    } finally {
      permission?.removeEventListener("abort", cancel);
      controller.abort();
    }
  }

  /** Seal native work admission before the owner replaces this store's worker. */
  get modelChangePending(): boolean {
    return this.changingModel;
  }

  async prepareModelChange(): Promise<void> {
    if (!this.modelChange)
      throw new Error("native_chat_model_change_unsupported");
    if (this.changingModel) throw new Error("native_chat_model_change_busy");
    for (const request of this.pending.values())
      if (request.method !== `_${PREDICT_PROMPT}`)
        throw new Error("native_chat_model_change_pending_work");
    // An optional prediction must give way to an explicit connection switch.
    // A late native reply carries the retired id and cannot enter the new chat.
    for (const [id, prediction] of this.pending) {
      prediction.prediction?.abort();
      this.notify("$/cancel_request", { requestId: id });
      this.pending.delete(id);
      clearTimeout(prediction.timer);
      prediction.reject(new Error("native_chat_prediction_cancelled"));
    }
    this.changingModel = true;
    // A lost response can mean that native admission was already sealed.
    // Keep the local gate closed until this exact process has exited.
    const response = object(
      await this.call(`_${MODEL_CHANGE}`, { prepare: true }, 20_000)
    );
    const blocker = response?.blocker;
    if (
      typeof blocker === "string" &&
      [
        "pending_work",
        "active_turn",
        "retained_turn",
        "queued_input",
        "unresolved_goal",
        "delegated_session",
        "background_process",
      ].includes(blocker)
    ) {
      this.changingModel = false;
      throw new Error(`native_chat_model_change_${blocker}`);
    }
    if (response?.prepared !== true)
      throw new Error("native_chat_model_change_unverified");
  }

  async gatewayBillingStatus(
    attempt: GatewayAttempt
  ): Promise<NativeGatewayBilling> {
    if (
      !this.connected ||
      !this.gatewayBillingEnabled ||
      (attempt.child && !this.childGatewayBilling)
    )
      return { kind: "unavailable" };
    try {
      return NativeGatewayConnection.billingResult(
        await this.call(
          NativeGatewayConnection.billingStatusMethod,
          attempt,
          20_000
        )
      );
    } catch {
      return { kind: "unavailable" };
    }
  }

  registerEditorSurfaces(
    sessionId: string,
    snapshot: NativeEditorSurfaceSnapshot,
    requireCurrent: () => void,
    deliver: NativeEditorSurfaceDelivery | undefined,
    revision?: number,
    svgText?: NativeEditorSvgTextDelivery,
    browser?: DesktopBrowserToolLease,
    svgSelection?: NativeEditorSvgSelectionDelivery
  ) {
    if (this.connected && this.editorSurfaces)
      return this.editorEndpoints.register(
        sessionId,
        snapshot,
        requireCurrent,
        this.editorSurfaceOpen || this.editorTools ? deliver : undefined,
        revision,
        this.editorSvgText || this.editorTools ? svgText : undefined,
        this.editorBrowserTools || this.editorBrowserMcp ? browser : undefined,
        this.editorToolContext ? svgSelection : undefined
      );
  }

  private call(
    method: string,
    params: unknown,
    timeoutMs = 130_000,
    prediction?: AbortController
  ): Promise<unknown> {
    if (this.failure || this.shutdown) {
      return Promise.reject(this.failure ?? new Error("native_agent_closing"));
    }
    if (this.pending.size >= REQUEST_LIMIT)
      return Promise.reject(new Error("native_agent_request_limit"));
    if (
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > 600_000
    ) {
      return Promise.reject(new Error("native_agent_invalid_timeout"));
    }
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        // The host can still own the accepted operation and its response slot.
        reject(new Error("native_agent_request_timeout"));
      }, timeoutMs);
      this.pending.set(id, { method, resolve, reject, timer, prediction });
      try {
        this.write({ jsonrpc: "2.0", id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  notify(method: string, params: unknown): void {
    if (this.changingModel) throw new Error("native_chat_model_change_busy");
    if (method === NativeAgentPermissions.answerMethod)
      throw new Error("native_agent_approval_requires_review");
    if (this.failure || this.shutdown)
      throw this.failure ?? new Error("native_agent_closing");
    this.write({ jsonrpc: "2.0", method, params });
  }

  close(): Promise<void> {
    return (this.shutdown ??= Promise.resolve().then(() => this.stop()));
  }

  private async stop(): Promise<void> {
    this.providerEgress?.close();
    this.providerRoutes?.close();
    this.cancelGatewayBillingRequests();
    this.imageGeneration?.close();
    this.imagePlacement?.close();
    this.closeEditorEndpoints();
    this.child.stdin.end();
    const exit = await bounded(this.exited, SHUTDOWN_TIMEOUT_MS);
    if (exit && !this.ready) return;
    if (exit?.code === 0 && exit.signal === null) return;
    if (!exit) {
      try {
        this.child.kill("SIGKILL");
      } catch {
        // A signal failure is not evidence that the child has closed.
      }
      const forced = await bounded(this.exited, KILL_TIMEOUT_MS);
      if (!forced && !this.observedExit)
        throw new NativeAgentTerminationPending(this.exited);
      if (!this.ready) return;
    }
    throw new Error("native_agent_shutdown_unverified");
  }

  private write(message: object): void {
    const bytes = Buffer.from(JSON.stringify(message) + "\n");
    if (!this.tryWrite(bytes)) throw new Error("native_agent_frame_limit");
  }

  private tryWrite(bytes: Buffer): boolean {
    if (
      bytes.length > FRAME_LIMIT ||
      this.child.stdin.writableLength + bytes.length > FRAME_LIMIT
    )
      return false;
    // A deferred frame can need space even when the writer never signals drain.
    this.child.stdin.write(bytes, (error) => {
      if (error) return;
      try {
        this.flushEditorReplies();
      } catch {
        this.disconnect("native_agent_browser_reply_failed");
      }
    });
    return true;
  }

  private editorReplyFrame(
    id: string | number,
    result?: object | null
  ): Buffer {
    const message = {
      jsonrpc: "2.0",
      id,
      ...(result
        ? { result }
        : {
            error:
              result === null
                ? { code: -32602, message: "Invalid params" }
                : { code: -32603, message: "Editor reply unverified" },
          }),
    };
    return Buffer.from(JSON.stringify(message) + "\n");
  }

  private startEditorRequest<T extends object>(
    id: string | number,
    invoke: (signal: AbortSignal) => Promise<T | null>,
    busy: () => T | null,
    replyGuard: (reply: T) => () => T | undefined
  ): void {
    if (this.editorRequests.has(id) || this.editorBusyReplies.has(id))
      throw new Error("native_agent_editor_request_id_reused");
    if (this.editorRequests.size >= REQUEST_LIMIT) {
      this.writeEditorBusyReply(id, busy());
      return;
    }
    const controller = new AbortController();
    const request = { controller };
    this.editorRequests.set(id, request);
    void invoke(controller.signal)
      .then(
        (result) => {
          const check = result ? replyGuard(result) : undefined;
          this.completeEditorRequest(
            id,
            request,
            result,
            check &&
              (() => {
                const revoked = check();
                return revoked && this.editorReplyFrame(id, revoked);
              })
          );
        },
        () => this.completeEditorRequest(id, request)
      )
      .catch(() => this.disconnect("native_agent_editor_reply_failed"));
  }

  private completeEditorRequest(
    id: string | number,
    request: EditorRequest,
    result?: object | null,
    ifRevoked?: () => Buffer | undefined
  ): void {
    if (!this.connected) return;
    if (request.controller.signal.aborted) {
      this.editorRequests.delete(id);
      return;
    }
    const bytes = this.editorReplyFrame(id, result);
    const reply =
      bytes.length <= FRAME_LIMIT
        ? { bytes, ifRevoked }
        : { bytes: this.editorReplyFrame(id) };
    if (reply.bytes.length > FRAME_LIMIT)
      throw new Error("native_agent_frame_limit");
    // A completed request keeps its admitted slot until its one bounded frame
    // is written or canceled. This keeps the stdin cap and the admission cap.
    if (this.tryWriteEditorReply(reply)) this.editorRequests.delete(id);
    else request.reply = reply;
  }

  private tryWriteEditorReply(
    reply: NonNullable<EditorRequest["reply"]>
  ): boolean {
    const revoked = reply.ifRevoked?.();
    // An independently owned catalog can lose another source while queued.
    if (revoked) reply.bytes = revoked;
    return this.tryWrite(reply.bytes);
  }

  private writeEditorBusyReply(
    id: string | number,
    result: object | null
  ): void {
    const bytes = this.editorReplyFrame(id, result);
    if (this.tryWrite(bytes)) return;
    // The caller can time out if this queue also fills. The operation was never
    // dispatched, and its refusal must not disconnect the shared worker.
    if (this.editorBusyReplyBytes + bytes.length > EDITOR_BUSY_REPLY_LIMIT)
      return;
    this.editorBusyReplies.set(id, bytes);
    this.editorBusyReplyBytes += bytes.length;
  }

  private flushEditorReplies(): void {
    if (!this.connected) return;
    for (const [id, request] of this.editorRequests) {
      if (!request.reply) continue;
      if (!this.tryWriteEditorReply(request.reply)) return;
      this.editorRequests.delete(id);
    }
    for (const [id, bytes] of this.editorBusyReplies) {
      if (!this.tryWrite(bytes)) return;
      this.removeEditorBusyReply(id);
    }
  }

  private removeEditorBusyReply(id: string | number): void {
    const bytes = this.editorBusyReplies.get(id);
    if (bytes) {
      this.editorBusyReplyBytes -= bytes.length;
      this.editorBusyReplies.delete(id);
    }
  }

  private receive(chunk: Buffer): void {
    if (this.failure) return;
    try {
      let cursor = 0;
      while (cursor < chunk.length) {
        const newline = chunk.indexOf(10, cursor);
        const end = newline === -1 ? chunk.length : newline;
        const length = end - cursor;
        if (this.buffered + length >= FRAME_LIMIT)
          throw new Error("native_agent_frame_limit");
        chunk.copy(this.buffer, this.buffered, cursor, end);
        this.buffered += length;
        if (newline === -1) return;
        const line = this.decoder.decode(
          this.buffer.subarray(0, this.buffered)
        );
        this.buffered = 0;
        cursor = newline + 1;
        this.deliver(JSON.parse(line));
      }
    } catch {
      this.disconnect("native_agent_invalid_frame");
    }
  }

  private deliver(value: unknown): void {
    const message = object(value);
    if (message?.jsonrpc !== "2.0")
      throw new Error("native_agent_invalid_message");
    if (typeof message.method === "string") {
      if (message.id !== undefined) {
        if (typeof message.id !== "string" && typeof message.id !== "number")
          throw new Error("native_agent_invalid_message");
        if (
          this.connected &&
          ((message.method === NativeProviderRoutes.turnMethod &&
            this.turnCapabilities) ||
            (message.method === NativeProviderRoutes.resolveMethod &&
              (object(message.params)?.purpose === "composerPrediction"
                ? this.predictionRoutes
                : this.inputRoutes)))
        ) {
          const id = message.id;
          if (this.providerRequests.has(id))
            throw new Error("native_agent_provider_request_id_reused");
          if (this.providerRequests.size >= REQUEST_LIMIT) {
            this.write({
              jsonrpc: "2.0",
              id,
              error: { code: -32602, message: "Provider route unavailable" },
            });
            return;
          }
          this.providerRequests.add(id);
          const resolving =
            message.method === NativeProviderRoutes.turnMethod
              ? this.providerRoutes!.turnCapabilities(message.params)
              : this.providerRoutes!.resolve(
                  message.params,
                  this.predictionPermission
                );
          void resolving
            .then(
              (result) => {
                if (this.connected) this.write({ jsonrpc: "2.0", id, result });
              },
              () => {
                if (this.connected)
                  this.write({
                    jsonrpc: "2.0",
                    id,
                    error: {
                      code: -32602,
                      message: "Provider route unavailable",
                    },
                  });
              }
            )
            .catch(() => this.disconnect("native_agent_provider_reply_failed"))
            .finally(() => this.providerRequests.delete(id));
          return;
        }
        if (
          message.method === NativeProviderEgress.exchangeMethod &&
          this.ready &&
          this.providerEgress &&
          !this.shutdown
        ) {
          this.providerRequest(message.id, message.params);
          return;
        }
        if (
          this.connected &&
          this.gatewayBillingEnabled &&
          message.method === NativeGatewayConnection.readJobBillingMethod
        ) {
          this.gatewayBillingRequest(message.id, message.params);
          return;
        }
        if (
          this.connected &&
          this.imageGenerationEnabled &&
          message.method === NativeImageGeneration.method
        ) {
          const id = message.id;
          const { routeId, ...params } = object(message.params) ?? {};
          const route = this.acceptsInputRoutes
            ? this.providerRoutes?.get(routeId)
            : undefined;
          const generation =
            routeId === undefined
              ? this.imageGeneration
              : route?.launch.imageGeneration;
          if (!generation) {
            this.write({ jsonrpc: "2.0", id, result: { kind: "unavailable" } });
            return;
          }
          void generation
            .generate(id, params, {
              libraryReference:
                this.imageReference && generation.supportsReference,
              placement: this.imagePlacementEnabled,
              reviewAttachment: this.imageAttachmentEnabled
                ? this.reviewImageReference
                : undefined,
              reviewWorkspace: this.imageWorkspaceReferenceEnabled
                ? this.reviewImageReference
                : undefined,
            })
            .then((result) => {
              if (this.connected) this.write({ jsonrpc: "2.0", id, result });
            })
            .catch(() =>
              this.disconnect("native_agent_image_generation_reply_failed")
            );
          return;
        }
        if (
          this.connected &&
          this.imagePlacementEnabled &&
          this.imagePlacement &&
          message.method === NativeImagePlacement.method
        ) {
          const id = message.id;
          void this.imagePlacement
            .place(id, message.params)
            .then((result) => {
              if (this.connected) this.write({ jsonrpc: "2.0", id, result });
            })
            .catch(() =>
              this.disconnect("native_agent_image_placement_reply_failed")
            );
          return;
        }
        if (
          this.connected &&
          this.editorSvgText &&
          message.method === NativeEditorSurfaceEndpoints.svgTextMethod
        ) {
          const id = message.id;
          void this.editorEndpoints
            .svgText(message.params)
            .then(
              (result) =>
                this.write({
                  jsonrpc: "2.0",
                  id,
                  ...(result
                    ? { result }
                    : {
                        error: { code: -32602, message: "Invalid params" },
                      }),
                }),
              () =>
                this.write({
                  jsonrpc: "2.0",
                  id,
                  error: { code: -32603, message: "Editor reply unverified" },
                })
            )
            .catch(() => {});
          return;
        }
        if (
          this.connected &&
          this.editorBrowserTools &&
          message.method === NativeEditorSurfaceEndpoints.browserMethod
        ) {
          this.startEditorRequest(
            message.id,
            (signal) =>
              this.editorEndpoints.browserTool(message.params, signal),
            () => this.editorEndpoints.browserBusy(message.params),
            (reply) => this.editorEndpoints.browserReplyGuard(reply)
          );
          return;
        }
        if (
          this.connected &&
          this.editorTools &&
          message.method === NativeDesktopTools.method
        ) {
          this.startEditorRequest(
            message.id,
            (signal) =>
              this.editorEndpoints.desktopTools(
                message.params,
                signal,
                this.editorBrowserMcp,
                this.editorToolSources,
                this.editorWorkbenchPaths
              ),
            () =>
              this.editorEndpoints.desktopToolsBusy(
                message.params,
                this.editorBrowserMcp,
                this.editorToolSources,
                this.editorWorkbenchPaths
              ),
            (reply) =>
              this.editorEndpoints.desktopToolsReplyGuard(
                reply,
                message.params,
                this.editorBrowserMcp,
                this.editorToolSources,
                this.editorWorkbenchPaths
              )
          );
          return;
        }
        if (
          this.connected &&
          this.editorSurfaces &&
          (message.method === NativeEditorSurfaceEndpoints.readMethod ||
            (this.editorSurfaceOpen &&
              message.method === NativeEditorSurfaceEndpoints.openMethod))
        ) {
          const result =
            message.method === NativeEditorSurfaceEndpoints.readMethod
              ? this.editorEndpoints.read(message.params)
              : this.editorEndpoints.open(message.params);
          this.write({
            jsonrpc: "2.0",
            id: message.id,
            ...(result
              ? { result }
              : { error: { code: -32602, message: "Invalid params" } }),
          });
          return;
        }
        this.write({
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32601, message: "Method not found" },
        });
      } else if (message.method === NativeProviderEgress.cancelMethod) {
        this.egress(message.params)?.cancel(message.params);
      } else if (message.method === "$/cancel_request") {
        const id = object(message.params)?.requestId;
        if (typeof id === "number" || typeof id === "string") {
          this.gatewayBillingRequests.get(id)?.abort();
          const request = this.editorRequests.get(id);
          request?.controller.abort();
          if (request?.reply) this.editorRequests.delete(id);
          this.removeEditorBusyReply(id);
        }
        this.imageGeneration?.cancel(id);
        if (typeof id === "string" || typeof id === "number")
          this.providerRoutes?.cancelImage(id);
        this.imagePlacement?.cancel(id);
      } else if (message.method === "_co.grida/catalog/changed") {
        this.onCatalogChanged?.(message.params);
      } else if (message.method === "session/update") {
        try {
          this.onSessionUpdate?.(message.params);
        } catch {
          // Observation can be repaired through a subsequent snapshot.
        }
      }
      return;
    }
    const id = message.id;
    if (
      typeof id !== "number" ||
      !Number.isSafeInteger(id) ||
      id < 1 ||
      id >= this.nextId ||
      "result" in message === "error" in message
    ) {
      throw new Error("native_agent_invalid_response");
    }
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    if ("result" in message) pending.resolve(message.result);
    else {
      const code = object(message.error)?.data;
      pending.reject(
        new Error(
          typeof code === "string" && /^[a-z0-9_]{1,96}$/.test(code)
            ? code
            : "native_agent_request_failed"
        )
      );
    }
  }

  private fail(error: Error): void {
    this.failure ??= error;
    this.providerEgress?.close();
    this.providerRoutes?.close();
    this.cancelGatewayBillingRequests();
    this.imageGeneration?.close();
    this.imagePlacement?.close();
    this.closeEditorEndpoints();
    this.providerRequests.clear();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(this.failure);
    }
    this.pending.clear();
  }

  private disconnect(code: string): void {
    this.fail(new Error(code));
    void this.close().catch(() => {});
  }

  private closeEditorEndpoints(): void {
    for (const request of this.editorRequests.values())
      request.controller.abort();
    this.editorRequests.clear();
    this.editorBusyReplies.clear();
    this.editorBusyReplyBytes = 0;
    this.editorEndpoints.close();
  }

  private cancelGatewayBillingRequests(): void {
    for (const controller of this.gatewayBillingRequests.values())
      controller.abort();
    this.gatewayBillingRequests.clear();
  }

  private gatewayBillingRequest(id: number | string, params: unknown): void {
    if (this.gatewayBillingRequests.has(id))
      throw new Error("native_agent_gateway_request_id_reused");
    const value = object(params);
    const routeId = value?.routeId;
    const billing =
      routeId === undefined
        ? this.gatewayJobBilling
        : this.connected && (this.inputRoutes || this.predictionRoutes)
          ? this.providerRoutes?.get(routeId)?.launch.gatewayJobBilling
          : undefined;
    if (
      !billing ||
      this.gatewayBillingRequests.size >= REQUEST_LIMIT ||
      Object.keys(value ?? {}).length !== (routeId === undefined ? 1 : 2) ||
      typeof value?.requestId !== "string"
    ) {
      this.write({ jsonrpc: "2.0", id, result: { kind: "unavailable" } });
      return;
    }
    const controller = new AbortController();
    this.gatewayBillingRequests.set(id, controller);
    void billing(value.requestId, controller.signal)
      .then((result) => {
        if (this.connected && !controller.signal.aborted)
          this.write({ jsonrpc: "2.0", id, result });
      })
      .catch(() => this.disconnect("native_agent_gateway_billing_reply_failed"))
      .finally(() => this.gatewayBillingRequests.delete(id));
  }

  private egress(params: unknown): NativeProviderEgress | undefined {
    const routeId = object(params)?.routeId;
    if (routeId === undefined) return this.providerEgress;
    return this.connected && (this.inputRoutes || this.predictionRoutes)
      ? this.providerRoutes?.get(routeId)?.egress
      : undefined;
  }

  private providerRequest(id: number | string, params: unknown): void {
    if (this.providerRequests.has(id))
      throw new Error("native_agent_provider_request_id_reused");
    const egress = this.egress(params);
    if (
      !egress ||
      this.providerRequests.size >= REQUEST_LIMIT ||
      (object(params)?.action === "open" &&
        (this.providerRoutes?.openExchangeCount ?? 0) +
          (this.providerEgress?.openExchangeCount ?? 0) >=
          NativeProviderEgress.maxExchanges)
    ) {
      // Too many concurrent exchanges fail only this request; the agent
      // reports it as an unavailable transport and other chats keep running.
      this.write({ jsonrpc: "2.0", id, result: { status: "unavailable" } });
      return;
    }
    this.providerRequests.add(id);
    void egress
      .exchange(params)
      .then((result) => {
        if (!this.failure && !this.shutdown)
          this.write({ jsonrpc: "2.0", id, result });
      })
      .catch(() => {
        this.disconnect("native_agent_provider_reply_failed");
      })
      .finally(() => {
        this.providerRequests.delete(id);
      });
  }
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function nativeEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const name of [
    "SystemRoot",
    "TMPDIR",
    "TEMP",
    "TMP",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "no_proxy",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
  ]) {
    if (process.env[name] !== undefined) environment[name] = process.env[name];
  }
  return environment;
}

async function bounded<T>(
  promise: Promise<T>,
  timeout: number
): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), timeout);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
