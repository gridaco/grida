// GRIDA-SEC-004 / GRIDA-SEC-008 — main-owned ACP connection to the packaged agent.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { clearTimeout, setTimeout } from "node:timers";
import { NativeAgentArtifacts } from "./native-agent-artifacts";
import { NativeAgentDeletion } from "./native-agent-deletion";
import { NativeAgentWakeups } from "./native-agent-wakeups";
import { NativeAgentCommands } from "./native-agent-commands";
import {
  NativeAgentPermissions,
  type NativeWorkspaceSelection,
} from "./native-agent-permissions";
import {
  NativeProviderEgress,
  type NativeProviderNetwork,
} from "./native-provider-egress";

const FRAME_LIMIT = 1024 * 1024;
const REQUEST_LIMIT = 16;
const START_TIMEOUT_MS = 10_000;
const SHUTDOWN_TIMEOUT_MS = 12_000;
const KILL_TIMEOUT_MS = 2_000;

export type NativeAgentLaunch = {
  resourcesPath: string;
  stateDirectory: string;
  provider: "openai-compatible" | "responses" | "anthropic" | "gemini";
  endpoint: string;
  model: string;
  credentialHome?: string;
  providerNetwork?: NativeProviderNetwork;
  gatewayScope?: string;
  subscriptionScope?: string;
  workspace?: NativeWorkspaceSelection;
  capabilities?: Readonly<Record<string, 1>>;
  onSessionUpdate?: (params: unknown) => void;
};

type Pending = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

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
  private scheduledWakeups = false;
  private artifacts = false;
  private savedChatDeletion = false;
  private readonly commandCapabilities = new Set<string>();
  private observedExit = false;
  private shutdown: Promise<void> | undefined;
  private failure: Error | undefined;

  private constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly onSessionUpdate?: (params: unknown) => void,
    askRoots?: ReadonlyMap<string, string>,
    private readonly providerEgress?: NativeProviderEgress
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

  get acceptsWakeups(): boolean {
    return this.connected && this.scheduledWakeups;
  }

  get acceptsArtifacts(): boolean {
    return this.connected && this.artifacts;
  }

  get acceptsSavedChatDeletion(): boolean {
    return this.connected && this.savedChatDeletion;
  }

  get availableCommands() {
    return this.connected
      ? NativeAgentCommands.available((key) =>
          this.commandCapabilities.has(key)
        )
      : [];
  }

  static async start(options: NativeAgentLaunch): Promise<NativeAgentProcess> {
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
    ]) {
      if (directory !== undefined && !path.isAbsolute(directory)) {
        throw new Error("native_agent_absolute_directory_required");
      }
    }
    const resources = path.join(options.resourcesPath, "native-agent");
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
          options.model
        )
      : undefined;
    const capabilities: Record<string, 1> = {
      ...options.capabilities,
      ...(permissionProfile ? NativeAgentPermissions.capabilities : {}),
    };
    if (providerEgress) capabilities[NativeProviderEgress.capability] = 1;
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
    if (options.credentialHome)
      args.push("--credential-home", options.credentialHome);
    if (providerEgress) args.push("--supervised-provider");
    if (options.gatewayScope)
      args.push("--supervised-gateway-scope", options.gatewayScope);
    if (options.subscriptionScope)
      args.push("--supervised-chatgpt-scope", options.subscriptionScope);
    if (permissionProfile)
      args.push("--permission-profile", permissionProfile.profile);
    const processOwner = new NativeAgentProcess(
      spawn(executable, args, {
        env: nativeEnvironment(),
        shell: false,
        windowsHide: true,
        stdio: "pipe",
      }),
      options.onSessionUpdate,
      permissionProfile?.askRoots,
      providerEgress
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
                ...NativeAgentCommands.capabilities,
                ...NativeAgentWakeups.capabilities,
                [NativeAgentArtifacts.capability]: 1,
                ...(requestDeletion && { [NativeAgentDeletion.capability]: 1 }),
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
      for (const [capability, version] of Object.entries(capabilities)) {
        if (advertised?.[capability] !== version)
          throw new Error("native_agent_capabilities_unavailable");
      }
      processOwner.imageInput =
        object(agentCapabilities?.promptCapabilities)?.image === true;
      processOwner.scheduledWakeups = Object.keys(
        NativeAgentWakeups.capabilities
      ).every((key) => advertised?.[key] === 1);
      for (const key of Object.keys(NativeAgentCommands.capabilities)) {
        if (advertised?.[key] === 1) processOwner.commandCapabilities.add(key);
      }
      processOwner.artifacts =
        advertised?.[NativeAgentArtifacts.capability] === 1;
      processOwner.savedChatDeletion =
        requestDeletion && advertised?.[NativeAgentDeletion.capability] === 1;
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
        this.write({
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32601, message: "Method not found" },
        });
      } else if (message.method === NativeProviderEgress.cancelMethod) {
        this.providerEgress?.cancel(message.params);
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
