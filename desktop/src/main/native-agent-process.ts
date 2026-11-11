// GRIDA-SEC-004 / GRIDA-SEC-008 — main-owned ACP connection to the packaged agent.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { clearTimeout, setTimeout } from "node:timers";
import type { NativeEditorSurfaceSnapshot } from "@grida/desktop-bridge";
import { NativeAgentArtifacts } from "./native-agent-artifacts";
import { NativeAgentDeletion } from "./native-agent-deletion";
import { NativeAgentWakeups } from "./native-agent-wakeups";
import { NativeAgentCommands } from "./native-agent-commands";
import { NativeAgentRevisions } from "./native-agent-revisions";
import type { NativeMcpLaunch } from "./native-mcp-launch";
import { NativeAgentGoals } from "./native-agent-goals";
import {
  NativeImageGeneration,
  type ImageReferenceReview,
} from "./native-image-generation";
import { NativeImagePlacement } from "./native-image-placement";
import {
  NativeEditorSurfaceEndpoints,
  type NativeEditorSurfaceDelivery,
  type NativeEditorSvgTextDelivery,
} from "./native-editor-surfaces";
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
const START_TIMEOUT_MS = 10_000;
const SHUTDOWN_TIMEOUT_MS = 12_000;
const KILL_TIMEOUT_MS = 2_000;
const SESSION_EFFORT = "co.grida/session/effort";
const LIBRARY_SELECTION_CAPABILITIES = {
  "co.grida/session/library-selections": 1,
  "co.grida/session/answer-library-selection": 1,
} as const;
export const TRANSCRIPT_WINDOW = "co.grida/session/transcript-window";
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
  credentialHome?: string;
  configuredEndpointKey?: string;
  workspaceConfiguration?: Readonly<{ directory: string; epoch: string }>;
  providerNetwork?: NativeProviderNetwork;
  gatewayScope?: string;
  gatewayJobBilling?: NativeGatewayConnection["readJobBilling"];
  subscriptionScope?: string;
  /** Trusted Main opt-in for the captured Gateway connection. */
  subagents?: true;
  mcp?: NativeMcpLaunch;
  workspace?: NativeWorkspaceSelection;
  imageGeneration?: NativeImageGeneration;
  imagePlacement?: NativeImagePlacement;
  reviewImageReference?: ImageReferenceReview;
  capabilities?: Readonly<Record<string, 1>>;
  onSessionUpdate?: (params: unknown) => void;
};

type Pending = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
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
  readonly permissions?: NativeAgentPermissions;
  private readonly pending = new Map<number, Pending>();
  private readonly providerRequests = new Set<number | string>();
  private readonly gatewayBillingRequests = new Map<
    number | string,
    AbortController
  >();
  private readonly editorEndpoints = new NativeEditorSurfaceEndpoints();
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
  private imageReference = false;
  private imagePlacementEnabled = false;
  private imageAttachmentEnabled = false;
  private imageWorkspaceReferenceEnabled = false;
  private librarySelection = false;
  private fileInput = false;
  private agentEffort = false;
  private scheduledWakeups = false;
  private historyRevision = false;
  private transcriptWindow = false;
  private gatewayBillingEnabled = false;
  private childGatewayBilling = false;
  private namedChildren = false;
  private childTurnControls = false;
  private childMessaging = false;
  private childQueueControls = false;
  private artifacts = false;
  private savedChatDeletion = false;
  private savedChatDeletionPreview = false;
  private goalCompletionReview = false;
  private goalManualContinuation = false;
  private goalFundedReview = false;
  private goalNamedChild = false;
  private editorSurfaces = false;
  private editorSurfaceOpen = false;
  private editorSvgText = false;
  private readonly commandCapabilities = new Set<string>();
  private observedExit = false;
  private shutdown: Promise<void> | undefined;
  private failure: Error | undefined;

  private constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly onSessionUpdate?: (params: unknown) => void,
    askRoots?: ReadonlyMap<string, string>,
    private readonly providerEgress?: NativeProviderEgress,
    private readonly imageGeneration?: NativeImageGeneration,
    private readonly imagePlacement?: NativeImagePlacement,
    private readonly reviewImageReference?: ImageReferenceReview,
    private readonly gatewayJobBilling?: NativeAgentLaunch["gatewayJobBilling"]
  ) {
    if (askRoots) {
      this.permissions = new NativeAgentPermissions(
        (method, params) => this.call(method, params),
        askRoots
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

  get acceptsChildGatewayBilling(): boolean {
    return this.connected && this.childGatewayBilling;
  }

  get acceptsFile(): boolean {
    return this.connected && this.fileInput;
  }

  get acceptsEffort(): boolean {
    return this.connected && this.agentEffort;
  }

  get acceptsWakeups(): boolean {
    return this.connected && this.scheduledWakeups;
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
    return (
      this.acceptsGoalEffort && this.acceptsSubagents && this.goalNamedChild
    );
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

  get acceptsArtifacts(): boolean {
    return this.connected && this.artifacts;
  }

  get acceptsSavedChatDeletion(): boolean {
    return this.connected && this.savedChatDeletion;
  }

  get acceptsSavedChatDeletionPreview(): boolean {
    return this.acceptsSavedChatDeletion && this.savedChatDeletionPreview;
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

  static async start(options: NativeAgentLaunch): Promise<NativeAgentProcess> {
    const imageGeneration = options.workspace
      ? options.imageGeneration
      : undefined;
    const imagePlacement = imageGeneration ? options.imagePlacement : undefined;
    const reviewImageReference = imageGeneration?.supportsReference
      ? options.reviewImageReference
      : undefined;
    if (
      imageGeneration &&
      (options.provider !== "openai-compatible" ||
        options.endpoint !== imageGeneration.endpoint ||
        !options.credentialHome ||
        !options.providerNetwork ||
        options.configuredEndpointKey !== undefined ||
        options.gatewayScope !== undefined ||
        options.subscriptionScope !== undefined)
    )
      throw new Error("native_agent_image_generation_profile_invalid");
    if (
      options.maxOutputTokens !== undefined &&
      (!Number.isSafeInteger(options.maxOutputTokens) ||
        options.maxOutputTokens < 1 ||
        options.maxOutputTokens > 65_536)
    )
      throw new Error("native_agent_output_limit_invalid");
    if (
      options.compatibleOutputLimitField !== undefined &&
      (options.compatibleOutputLimitField !== "max-tokens" ||
        options.provider !== "openai-compatible" ||
        !options.providerNetwork ||
        (options.credentialHome !== undefined &&
          options.configuredEndpointKey === undefined) ||
        options.gatewayScope !== undefined ||
        options.subscriptionScope !== undefined)
    )
      throw new Error("native_agent_compatible_output_limit_invalid");
    if (options.workspaceConfiguration && !options.providerNetwork)
      throw new Error("native_workspace_configuration_requires_supervision");
    const storedSubagents =
      options.provider === "openai-compatible" &&
      (options.endpoint === "https://openrouter.ai/api/v1" ||
        options.endpoint === "https://ai-gateway.vercel.sh/v1") &&
      options.credentialHome !== undefined &&
      options.providerNetwork !== undefined &&
      options.configuredEndpointKey === undefined &&
      options.gatewayScope === undefined &&
      options.subscriptionScope === undefined;
    if (options.subagents && !options.gatewayScope && !storedSubagents)
      throw new Error("native_agent_subagent_provider_unsupported");
    if (
      options.configuredEndpointKey !== undefined &&
      (!options.credentialHome ||
        !options.providerNetwork ||
        options.provider !== "openai-compatible" ||
        options.gatewayScope !== undefined ||
        options.subscriptionScope !== undefined)
    )
      throw new Error("native_agent_configured_endpoint_profile_invalid");
    if (
      options.subscriptionScope !== undefined &&
      (!/^[a-f0-9]{64}$/.test(options.subscriptionScope) ||
        options.provider !== "responses" ||
        !options.providerNetwork ||
        options.credentialHome !== undefined ||
        options.gatewayScope !== undefined)
    )
      throw new Error("native_agent_subscription_profile_invalid");
    if (
      options.gatewayScope !== undefined &&
      (!/^[a-f0-9]{64}$/.test(options.gatewayScope) ||
        options.provider !== "openai-compatible" ||
        !options.providerNetwork ||
        options.credentialHome)
    )
      throw new Error("native_agent_gateway_profile_invalid");
    for (const directory of [
      options.resourcesPath,
      options.stateDirectory,
      options.credentialHome,
      options.processCwd,
    ]) {
      if (directory !== undefined && !path.isAbsolute(directory)) {
        throw new Error("native_agent_absolute_directory_required");
      }
    }
    const executable = NativeAgentProcess.executable(options.resourcesPath);
    const permissionProfile = options.workspace
      ? await NativeAgentPermissions.stage(
          options.stateDirectory,
          options.workspace
        )
      : undefined;
    const providerEgress = options.providerNetwork
      ? new NativeProviderEgress(
          options.providerNetwork,
          options.subscriptionScope ? "chatgpt-subscription" : options.provider,
          options.endpoint,
          options.model,
          options.llamaCppInputCount
        )
      : undefined;
    const capabilities: Record<string, 1> = {
      ...options.capabilities,
      ...(permissionProfile ? NativeAgentPermissions.capabilities : {}),
    };
    if (storedSubagents) {
      delete capabilities[SESSION_EFFORT];
      delete capabilities[NativeAgentGoals.fundedReviewCapability];
      delete capabilities[NativeAgentGoals.namedChildCapability];
    }
    if (options.gatewayJobBilling && !options.gatewayScope)
      throw new Error("native_agent_gateway_profile_invalid");
    if (options.llamaCppInputCount && !providerEgress)
      throw new Error("native_provider_input_count_unavailable");
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
    if (options.subscriptionScope)
      args.push("--supervised-chatgpt-scope", options.subscriptionScope);
    if (permissionProfile)
      args.push("--permission-profile", permissionProfile.profile);
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
      permissionProfile?.askRoots,
      providerEgress,
      imageGeneration,
      imagePlacement,
      reviewImageReference,
      options.gatewayJobBilling
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
                ...(imageGeneration?.supportsReference && {
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
                ...(options.subagents && {
                  ...SUBAGENT_CAPABILITIES,
                  [CHILD_STEERING]: 1,
                  [CHILD_MESSAGING]: 1,
                  [CHILD_QUEUE[0]]: 1,
                  [CHILD_QUEUE[1]]: 1,
                }),
                ...(options.subagents &&
                  options.gatewayScope && {
                    [SESSION_EFFORT]: 1,
                    [NativeAgentGoals.fundedReviewCapability]: 1,
                    [NativeAgentGoals.namedChildCapability]: 1,
                  }),
                ...NativeAgentWakeups.capabilities,
                [NativeEditorSurfaceEndpoints.capability]: 1,
                ...(providerEgress && {
                  [NativeEditorSurfaceEndpoints.openCapability]: 1,
                  [NativeEditorSurfaceEndpoints.svgTextCapability]: 1,
                }),
                [NativeAgentArtifacts.capability]: 1,
                ...(options.gatewayJobBilling && {
                  [NativeGatewayConnection.billingCapability]: 1,
                  [NativeGatewayConnection.childBillingCapability]: 1,
                }),
                ...(options.workspace && LIBRARY_SELECTION_CAPABILITIES),
                "co.grida/session/selected-file": 1,
                [TRANSCRIPT_WINDOW]: 1,
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
      processOwner.gatewayBillingEnabled =
        options.gatewayJobBilling !== undefined &&
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
      processOwner.imageReference =
        imageGeneration?.supportsReference === true &&
        processOwner.imageInput &&
        advertised?.[NativeImageGeneration.referenceCapability] === 1;
      processOwner.imagePlacementEnabled =
        imagePlacement !== undefined &&
        advertised?.[NativeImagePlacement.capability] === 1;
      processOwner.imageAttachmentEnabled =
        reviewImageReference !== undefined &&
        processOwner.imageInput &&
        advertised?.[NativeImageGeneration.attachmentCapability] === 1;
      processOwner.imageWorkspaceReferenceEnabled =
        reviewImageReference !== undefined &&
        advertised?.[NativeImageGeneration.workspaceReferenceCapability] === 1;
      processOwner.librarySelection =
        options.workspace !== undefined &&
        processOwner.imageInput &&
        Object.keys(LIBRARY_SELECTION_CAPABILITIES).every(
          (key) => advertised?.[key] === 1
        );
      processOwner.fileInput =
        advertised?.["co.grida/session/selected-file"] === 1;
      processOwner.agentEffort =
        options.subagents === true &&
        options.gatewayScope !== undefined &&
        advertised?.[SESSION_EFFORT] === 1;
      processOwner.scheduledWakeups = Object.keys(
        NativeAgentWakeups.capabilities
      ).every((key) => advertised?.[key] === 1);
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
      processOwner.goalNamedChild =
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
      for (const key of Object.keys(NativeAgentCommands.capabilities)) {
        if (advertised?.[key] === 1) processOwner.commandCapabilities.add(key);
      }
      processOwner.artifacts =
        advertised?.[NativeAgentArtifacts.capability] === 1;
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
      processOwner.ready = true;
      return processOwner;
    } catch (error) {
      await processOwner.close();
      throw error;
    }
  }

  request(
    method: string,
    params: unknown,
    timeoutMs = 130_000
  ): Promise<unknown> {
    if (method === NativeAgentPermissions.answerMethod)
      return Promise.reject(new Error("native_agent_approval_requires_review"));
    return this.call(method, params, timeoutMs);
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
    svgText?: NativeEditorSvgTextDelivery
  ) {
    if (this.connected && this.editorSurfaces)
      return this.editorEndpoints.register(
        sessionId,
        snapshot,
        requireCurrent,
        this.editorSurfaceOpen ? deliver : undefined,
        revision,
        this.editorSvgText ? svgText : undefined
      );
  }

  private call(
    method: string,
    params: unknown,
    timeoutMs = 130_000
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
      this.pending.set(id, { resolve, reject, timer });
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
    this.cancelGatewayBillingRequests();
    this.imageGeneration?.close();
    this.imagePlacement?.close();
    this.editorEndpoints.close();
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
    if (
      bytes.length > FRAME_LIMIT ||
      this.child.stdin.writableLength + bytes.length > FRAME_LIMIT
    ) {
      throw new Error("native_agent_frame_limit");
    }
    this.child.stdin.write(bytes);
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
          this.gatewayJobBilling &&
          message.method === NativeGatewayConnection.readJobBillingMethod
        ) {
          this.gatewayBillingRequest(message.id, message.params);
          return;
        }
        if (
          this.connected &&
          this.imageGeneration &&
          message.method === NativeImageGeneration.method
        ) {
          const id = message.id;
          void this.imageGeneration
            .generate(id, message.params, {
              libraryReference: this.imageReference,
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
        this.providerEgress?.cancel(message.params);
      } else if (message.method === "$/cancel_request") {
        const id = object(message.params)?.requestId;
        if (typeof id === "number" || typeof id === "string")
          this.gatewayBillingRequests.get(id)?.abort();
        this.imageGeneration?.cancel(id);
        this.imagePlacement?.cancel(id);
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
    this.cancelGatewayBillingRequests();
    this.imageGeneration?.close();
    this.imagePlacement?.close();
    this.editorEndpoints.close();
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

  private cancelGatewayBillingRequests(): void {
    for (const controller of this.gatewayBillingRequests.values())
      controller.abort();
    this.gatewayBillingRequests.clear();
  }

  private gatewayBillingRequest(id: number | string, params: unknown): void {
    if (this.gatewayBillingRequests.has(id))
      throw new Error("native_agent_gateway_request_id_reused");
    const value = object(params);
    if (
      this.gatewayBillingRequests.size >= REQUEST_LIMIT ||
      Object.keys(value ?? {}).length !== 1 ||
      typeof value?.requestId !== "string"
    ) {
      this.write({ jsonrpc: "2.0", id, result: { kind: "unavailable" } });
      return;
    }
    const controller = new AbortController();
    this.gatewayBillingRequests.set(id, controller);
    void this.gatewayJobBilling!(value.requestId, controller.signal)
      .then((result) => {
        if (this.connected && !controller.signal.aborted)
          this.write({ jsonrpc: "2.0", id, result });
      })
      .catch(() => this.disconnect("native_agent_gateway_billing_reply_failed"))
      .finally(() => this.gatewayBillingRequests.delete(id));
  }

  private providerRequest(id: number | string, params: unknown): void {
    if (
      this.providerRequests.has(id) ||
      this.providerRequests.size >= REQUEST_LIMIT
    )
      throw new Error("native_agent_provider_request_limit");
    this.providerRequests.add(id);
    void this.providerEgress!.exchange(params)
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
