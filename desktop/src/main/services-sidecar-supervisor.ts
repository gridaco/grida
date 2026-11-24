// GRIDA-SEC-014 — explicit shared provider custody and protected native roots.
// GRIDA-GG: desktop — pass the GG host into the sandbox policy (docs/wg/platform/hosted-ai.md)
/**
 * GRIDA-SEC-004 — retained-service supervision and private host channels.
 *
 * Native Seatbelt or bubblewrap confines the socketless service on macOS/Linux.
 * Main supplies connected daemon sockets and provider HTTP through inherited
 * channels. The retained process has no model command or direct network owner.
 * Windows keeps its explicitly unconfined non-agent services.
 */
import { mkdir } from "node:fs/promises";
import { app } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { SidecarLogWriter } from "./sidecar-log";
import type { DesktopProfile } from "./desktop-profile";
import { ProviderNetworkAuthority } from "./provider-network-authority";
import { ProviderNetworkHost } from "./provider-network-host";
import { ServicesSidecarSocketHost } from "./services-sidecar-socket-host";
import { SidecarSandboxPolicy } from "./sidecar-sandbox-policy";
import type { NativeProviderNetwork } from "./native-provider-egress";
import type { DesktopAccountSession } from "./account-session";
import { NativeGatewayConnection } from "./native-gateway-connection";
import { ProviderNetworkPolicy } from "../provider-network-policy";
import { NativeDesktopProfile } from "./native-desktop-profile";
import { RetainedServiceSandbox } from "./retained-service-sandbox";
import { ProviderEndpointConsent } from "./provider-endpoint-consent";
import { MediaTransport } from "@grida/ai-host/media-transport";
import { NativeOpenAiModels } from "./native-openai-models";

export type ServicesSidecarInfo = {
  /** Electron-main-owned TCP listener port (exact 127.0.0.1, ephemeral). */
  port: number;
  /** Per-spawn Basic-Auth password. Main process only; preload requests it over guarded IPC. */
  password: string;
};

type ServicesSidecarMode = "disabled" | "native-chat";
type SidecarProfile = Pick<
  DesktopProfile,
  | "agentData"
  | "catalogueDirectory"
  | "configHome"
  | "editorBaseUrl"
  | "isPackaged"
  | "mediaRoot"
  | "nativeChat"
  | "projectsRoot"
  | "providerHome"
  | "temp"
  | "userData"
  | "userHome"
>;

const STARTUP_TIMEOUT_MS = 15_000;
const BACKOFF_INITIAL_MS = 250;
const BACKOFF_MAX_MS = 10_000;

/** Path facts Main fixes when it selects native chat, before any service starts. */
export type NativeChatPaths = Readonly<{
  /** Retained agent settings, the ChatGPT subscription home and service logs. */
  userDataPath: string;
  /** Electron's browser profile, which holds the native chat store. */
  desktopUserDataPath: string;
  providerHome: string;
  configHome: string;
  mediaRoot: string;
}>;

export class ServicesSidecarSupervisor {
  private openAiModels?: NativeOpenAiModels;
  private servicesStarted = false;
  private nativeChat?: NativeChatPaths;
  private child: ChildProcess | null = null;
  private activeGeneration = 0;
  private nextGeneration = 0;
  private spawning: Promise<ServicesSidecarInfo> | null = null;
  private networkHost: ProviderNetworkHost | null = null;
  private daemonSocketHost: ServicesSidecarSocketHost | null = null;
  private info: {
    connection: ServicesSidecarInfo;
    mode: ServicesSidecarMode;
  } | null = null;
  private restartBackoffMs = BACKOFF_INITIAL_MS;
  private isShuttingDown = false;
  private restartTimer: NodeJS.Timeout | null = null;
  private nativeSandbox?: RetainedServiceSandbox;
  private sandboxReady = false;
  private workspaceCatalog?: string;
  private protectedStateRoots: readonly string[] = [];
  private protectedFileRoots: readonly string[] = [];
  private endpointConsent?: ProviderEndpointConsent;
  private endpointTransport: MediaTransport.Client | null = null;
  private readonly editorOrigin: string;
  private readonly networkAuthority: ProviderNetworkAuthority;
  private readonly log: SidecarLogWriter;

  /** One statement per event: mirror to the console AND the durable log so
   * a lifecycle line can never land console-only. */
  private note(
    stream: "out" | "err" | "sup",
    line: string,
    level: "log" | "warn" | "error" = "log"
  ): void {
    const prefix =
      stream === "err" ? "[services-sidecar:err]" : "[services-sidecar]";
    // eslint-disable-next-line no-console
    console[level](`${prefix} ${line}`);
    this.log.write(stream, line);
  }

  constructor(private readonly profile: SidecarProfile) {
    this.editorOrigin = new URL(profile.editorBaseUrl).origin;
    this.networkAuthority = new ProviderNetworkAuthority(this.editorOrigin);
    this.log = new SidecarLogWriter(path.join(profile.agentData, "logs"));
    app.once("will-quit", () => {
      this.isShuttingDown = true;
      if (this.restartTimer) {
        clearTimeout(this.restartTimer);
        this.restartTimer = null;
      }
      this.stop();
    });
  }

  async start(workspaceCatalog?: string): Promise<ServicesSidecarInfo> {
    if (this.isShuttingDown) throw new Error("services_sidecar_shutting_down");
    if (
      (workspaceCatalog &&
        (!this.nativeChat || !RetainedServiceSandbox.isSupportedPlatform())) ||
      (this.sandboxReady && workspaceCatalog !== this.workspaceCatalog)
    )
      throw new Error("workspace_catalog_scope_invalid");
    this.workspaceCatalog = workspaceCatalog;
    this.servicesStarted = true;
    if (this.info) return this.info.connection;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (!this.sandboxReady) {
      await mkdir(this.profile.catalogueDirectory, {
        recursive: true,
        mode: 0o700,
      });
      await this.initSandbox();
    }
    return await this.spawn();
  }

  /** Fix native chat's path facts before the first service starts. */
  selectNativeChat(ordinary = false): NativeChatPaths {
    if (
      !app.hasSingleInstanceLock() ||
      this.profile.nativeChat !== (ordinary ? "ordinary" : "preview") ||
      this.servicesStarted ||
      this.isShuttingDown
    ) {
      throw new Error("native_chat_selection_unavailable");
    }
    return (this.nativeChat ??= Object.freeze({
      userDataPath: this.profile.agentData,
      desktopUserDataPath: this.profile.userData,
      providerHome: this.profile.providerHome,
      configHome: this.profile.configHome,
      mediaRoot: this.profile.mediaRoot,
    }));
  }

  getInfo(): ServicesSidecarInfo | null {
    return this.info?.connection ?? null;
  }

  getMode(): ServicesSidecarMode | null {
    return this.info?.mode ?? null;
  }

  stop() {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const child = this.child;
    const generation = this.activeGeneration;
    if (child) this.retireGeneration(child, generation, false);
    else this.closeCurrentHosts();
    // Invalidate a spawn still awaiting sandbox wrapping before it has a child.
    this.nextGeneration += 1;
    this.info = null;
  }

  async approveProviderEndpoint(id: string, baseUrl: string): Promise<void> {
    const revision = this.networkAuthority.revision;
    this.networkAuthority.approveCustomEndpoint(id, baseUrl);
    if (this.networkAuthority.revision !== revision) await this.publishGrants();
  }

  async revokeProviderEndpoint(id: string): Promise<void> {
    const revision = this.networkAuthority.revision;
    this.networkAuthority.revokeCustomEndpoint(id);
    if (this.networkAuthority.revision !== revision) await this.publishGrants();
  }

  async nativeEndpointNetwork(
    id: string,
    baseUrl: string
  ): Promise<NativeProviderNetwork> {
    const grantId = this.networkAuthority.approvedEndpointGrant(id, baseUrl);
    if (!grantId) throw new Error("native_provider_endpoint_not_approved");
    return await ProviderNetworkHost.nativeProviderNetwork(
      this.networkAuthority,
      grantId
    );
  }

  providerEndpointSettings(): ProviderEndpointConsent {
    if (!this.info || !this.endpointConsent)
      throw new Error("agent provider network is not ready");
    return this.endpointConsent;
  }

  nativeByokSettings(openAiProject = false) {
    return {
      credentialHome: this.profile.providerHome,
      network: () =>
        ProviderNetworkHost.nativeProviderNetwork(
          this.networkAuthority,
          openAiProject
            ? ProviderNetworkPolicy.OPENAI_PROJECT_GRANT_ID
            : ProviderNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID
        ),
      ...(openAiProject && {
        onOpenAiAuthenticationFailure: () => this.openAiModels?.invalidate(),
      }),
    };
  }

  async nativeOpenAiOffer(
    waitForDiscovery: boolean
  ): Promise<NativeOpenAiModels.Offer> {
    if (!this.nativeChat || this.isShuttingDown) return { status: "missing" };
    const { credentialHome, network } = this.nativeByokSettings(true);
    this.openAiModels ??= new NativeOpenAiModels(credentialHome, network);
    return await this.openAiModels.offer(waitForDiscovery);
  }

  // GRIDA-SEC-008 — the selected native chat paths name the sole OAuth home.
  async nativeSubscriptionSettings() {
    const paths = this.nativeChat;
    if (!paths || this.isShuttingDown)
      throw new Error("native_chatgpt_source_unavailable");
    const network = await ProviderNetworkHost.nativeProviderNetwork(
      this.networkAuthority,
      ProviderNetworkPolicy.CHATGPT_SUBSCRIPTION_GRANT_ID
    );
    if (this.isShuttingDown)
      throw new Error("native_chatgpt_source_unavailable");
    return { userDataPath: paths.userDataPath, network };
  }

  async nativeGatewayConnection(
    account: DesktopAccountSession,
    organizationId?: number,
    signal?: AbortSignal
  ): Promise<NativeGatewayConnection> {
    const origin = this.editorOrigin;
    const [network, jobNetwork] = await Promise.all([
      ProviderNetworkHost.nativeProviderNetwork(
        this.networkAuthority,
        ProviderNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID
      ),
      ProviderNetworkHost.nativeGatewayJobNetwork(
        this.networkAuthority,
        origin
      ),
    ]);
    return await NativeGatewayConnection.open({
      origin,
      account,
      network,
      jobNetwork,
      organizationId,
      signal,
    });
  }

  async describeProviderEndpoint(baseUrl: string): Promise<{
    origin: string;
    route: string;
  }> {
    const host = this.networkHost;
    if (!host) throw new Error("agent provider network is not ready");
    return await host.describeCustomEndpoint(baseUrl);
  }

  private async publishGrants(): Promise<void> {
    const host = this.networkHost;
    const child = this.child;
    const generation = this.activeGeneration;
    if (!host || !child) {
      throw new Error("agent provider network is not ready");
    }
    try {
      await host.updateGrants();
    } catch (error) {
      // A failed revocation must not leave the sidecar running with the stale
      // grant snapshot. Retire only the generation/host that owned this
      // publication: a delayed rejection from an old host must never kill the
      // replacement that already bootstrapped the latest authority snapshot.
      if (this.networkHost === host) {
        this.retireGeneration(child, generation, true);
      }
      throw error;
    }
  }

  /** Capture the retained service scope before any process is launched. */
  private async initSandbox(): Promise<void> {
    if (this.sandboxReady) return;
    const chat = this.nativeChat;
    const preview = chat && this.profile.nativeChat === "preview";
    if (preview)
      NativeDesktopProfile.assertPreviewIsolation(
        app,
        path.dirname(this.profile.userData)
      );
    const protectedRoots = preview
      ? NativeDesktopProfile.protectedRoots(app)
      : NativeDesktopProfile.installedRootsForDevelopment(app, this.profile);
    this.protectedStateRoots = protectedRoots?.canonicalPaths() ?? [];
    const chatState = path.join(
      this.profile.userData,
      NativeDesktopProfile.chatStateDirectory
    );
    const endpointConsent = ProviderEndpointConsent.directory(
      this.profile.userData
    );
    if (!RetainedServiceSandbox.isSupportedPlatform()) {
      if (chat) throw new Error("native_retained_sidecar_sandbox_unavailable");
      this.protectedFileRoots = [
        ...this.protectedStateRoots,
        this.profile.catalogueDirectory,
        endpointConsent,
        chatState,
      ];
      // Existing Windows file/media services have no native confinement claim.
      if (process.platform !== "win32")
        throw new Error("retained_service_platform_unsupported");
      console.warn(
        "[services-sidecar] Windows retained services have no kernel confinement"
      );
      this.sandboxReady = true;
      return;
    }
    const nativeStateRoot = preview ? this.profile.userData : chatState;
    this.protectedFileRoots = [
      ...new Set([
        ...this.protectedStateRoots,
        this.profile.catalogueDirectory,
        nativeStateRoot,
        endpointConsent,
        ...(this.workspaceCatalog ? [path.dirname(this.workspaceCatalog)] : []),
      ]),
    ];
    const policy = SidecarSandboxPolicy.build({
      userData: this.profile.agentData,
      providerRoot: path.join(this.profile.providerHome, "providers"),
      mediaRoot: this.profile.mediaRoot,
      desktopStateRoot: nativeStateRoot,
      protectedStateRoots: [
        ...(protectedRoots?.metadataPaths() ?? []),
        endpointConsent,
      ],
      catalogueDirectory: this.profile.catalogueDirectory,
      workspaceCatalogRoot: this.workspaceCatalog
        ? path.dirname(this.workspaceCatalog)
        : undefined,
      home: this.profile.userHome,
    });
    this.nativeSandbox = new RetainedServiceSandbox({
      network: {
        allowedDomains: policy.network.allowed_domains,
        deniedDomains: policy.network.denied_domains,
        allowLocalBinding: policy.network.allow_local_binding,
      },
      filesystem: {
        denyRead: policy.filesystem.deny_read,
        allowRead: policy.filesystem.allow_read,
        allowWrite: policy.filesystem.allow_write,
        denyWrite: policy.filesystem.deny_write,
      },
    });
    this.sandboxReady = true;
  }

  /**
   * Resolve the sidecar bin path on disk. Forge's Vite plugin emits
   * `.vite/build/services-sidecar.js` next to `main.js`. In packaged builds
   * `__dirname` is inside the asar; the bundled sidecar script lives
   * alongside, and Electron's asar transparent-read serves it when
   * we `spawn` Electron-as-node with that path.
   */
  private sidecarScriptPath(): string {
    return path.join(__dirname, "services-sidecar.js");
  }

  private spawn(): Promise<ServicesSidecarInfo> {
    if (this.info) return Promise.resolve(this.info.connection);
    if (this.spawning) return this.spawning;
    const pending = this.spawnOne();
    this.spawning = pending;
    const clear = () => {
      if (this.spawning === pending) this.spawning = null;
    };
    void pending.then(clear, clear);
    return pending;
  }

  private async spawnOne(): Promise<ServicesSidecarInfo> {
    const generation = ++this.nextGeneration;
    await this.initializeEndpointConsent();
    if (generation !== this.nextGeneration || this.isShuttingDown)
      throw new Error("services sidecar startup was cancelled");
    // Never bootstrap an old generation's grants before reading this service's
    // current config. Exact unchanged matches retain native chat bindings.
    this.networkAuthority.suspendCustomEndpoints();
    const scriptPath = this.sidecarScriptPath();
    const password = crypto.randomBytes(32).toString("base64url");

    const sandbox = this.nativeSandbox;
    const supportedSandbox = sandbox !== undefined;
    if (!supportedSandbox && process.platform !== "win32")
      throw new Error("services_sidecar_sandbox_unavailable");

    const mode = this.nativeChat ? "native-chat" : "disabled";
    const args = [
      scriptPath,
      `--user-data=${this.profile.agentData}`,
      `--provider-home=${this.profile.providerHome}`,
      `--media-root=${this.profile.mediaRoot}`,
      `--model-catalogue=${this.profile.catalogueDirectory}`,
      `--agent=${mode}`,
      ...(this.nativeChat && this.profile.nativeChat === "ordinary"
        ? ["--ordinary-native-chat-services=1"]
        : []),
      ...(this.workspaceCatalog
        ? [`--workspace-catalog=${this.workspaceCatalog}`]
        : []),
      ...this.protectedFileRoots.map((root) => `--protected-file-root=${root}`),
      // GRIDA-SEC-004 — host-injected managed root for the auto-create flow.
      // A visible, Finder-navigable location (files stay visible); the sidecar
      // may only mint project folders INSIDE this root.
      `--projects-root=${this.profile.projectsRoot}`,
      `--editor-base-url=${this.profile.editorBaseUrl}`,
      // GRIDA-SEC-004 — only native retained-service confinement supplies this fact.
      `--sandbox-enforced=${supportedSandbox ? "1" : "0"}`,
    ];
    const nativePlan = sandbox?.prepare(process.execPath, args, process, {
      state: this.profile.agentData,
      providerHome: this.profile.providerHome,
      media: this.profile.mediaRoot,
    });
    if (generation !== this.nextGeneration || this.isShuttingDown) {
      nativePlan?.release?.();
      throw new Error("services sidecar startup was cancelled");
    }
    return await new Promise<ServicesSidecarInfo>((resolve, reject) => {
      let resolved = false;
      let child: ChildProcess;
      // Per-spawn ownership: an old child's delayed `exit` must never close or
      // clear the network host belonging to a newer generation.
      let spawnNetworkHost: ProviderNetworkHost | null = null;
      let spawnDaemonSocketHost: ServicesSidecarSocketHost | null = null;
      const timeout = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        this.note("sup", "startup timed out; stopping child", "warn");
        this.retireGeneration(child, generation, true);
        reject(new Error("services sidecar startup timed out"));
      }, STARTUP_TIMEOUT_MS);

      // Main owns all provider HTTP. The service receives only its explicit
      // process facts, never ambient provider keys, shell startup or proxy state.
      const childEnv: NodeJS.ProcessEnv = {
        ELECTRON_RUN_AS_NODE: "1",
        HOME: this.profile.userHome,
        TMPDIR: this.profile.temp,
        TMP: this.profile.temp,
        TEMP: this.profile.temp,
        LANG: "C",
        LC_ALL: "C",
        ...(process.platform === "win32" &&
        (process.env.SystemRoot || process.env.SYSTEMROOT)
          ? { SystemRoot: process.env.SystemRoot || process.env.SYSTEMROOT }
          : {}),
        ...(process.env.GRIDA_AGENT_DISABLE_MODELS_FETCH === "1"
          ? { GRIDA_AGENT_DISABLE_MODELS_FETCH: "1" }
          : {}),
      };
      try {
        child = nativePlan
          ? RetainedServiceSandbox.start(nativePlan, childEnv)
          : spawn(process.execPath, args, {
              shell: false,
              env: childEnv,
              stdio: ["pipe", "pipe", "pipe", "ipc"],
            });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
        return;
      }
      this.child = child;
      this.activeGeneration = generation;
      this.note(
        "sup",
        `spawned pid=${child.pid ?? "?"} sandbox=${supportedSandbox ? process.platform : "none"}`
      );
      if (!child.stdin || !child.stdout || !child.send || !child.connected) {
        resolved = true;
        clearTimeout(timeout);
        this.retireGeneration(child, generation, true);
        reject(new Error("services sidecar stdio channel unavailable"));
        return;
      }

      // Stdout is protocol-only; stderr below is the sole log channel.
      // Set the ready waiter before bootstrap so a very fast sidecar cannot
      // race its structured ready frame past the listener.
      const failSpawnChannel = (label: string, error: Error) => {
        if (!this.isCurrentGeneration(child, generation)) return;
        this.note("sup", `${label} failed: ${error.message}`, "error");
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error(`services sidecar ${label} failed`));
        }
        this.retireGeneration(child, generation, true);
      };
      void (async () => {
        const daemonSocketHost = new ServicesSidecarSocketHost(child, (error) =>
          failSpawnChannel("daemon capability channel", error)
        );
        spawnDaemonSocketHost = daemonSocketHost;
        const daemonPort = await daemonSocketHost.listen();
        const capabilityReady = daemonSocketHost.waitForCapabilityReady();
        const host = await ProviderNetworkHost.create({
          input: child.stdout!,
          output: child.stdin!,
          authority: this.networkAuthority,
          onFatal: (error) => failSpawnChannel("capability channel", error),
        });
        spawnNetworkHost = host;
        if (!this.isCurrentGeneration(child, generation) || resolved) {
          daemonSocketHost.close();
          host.close();
          return;
        }
        this.daemonSocketHost = daemonSocketHost;
        this.networkHost = host;
        const ready = host.waitForReady();
        await host.bootstrap(password, daemonPort);
        const readyPort = await ready;
        await capabilityReady;
        if (!this.isCurrentGeneration(child, generation) || resolved) return;
        daemonSocketHost.markReady(readyPort);
        const connection = { port: daemonPort, password };
        const origin = this.editorOrigin;
        this.endpointTransport = new MediaTransport.Client({
          base_url: MediaTransport.baseUrl(daemonPort),
          password,
          origin,
          referer: `${origin}/desktop`,
        });
        await this.endpointConsent!.restore();
        if (!this.isCurrentGeneration(child, generation) || resolved) return;
        this.networkAuthority.discardSuspendedEndpoints();
        this.info = { connection, mode };
        this.restartBackoffMs = BACKOFF_INITIAL_MS;
        this.note("sup", `ready main-owned port=${daemonPort}`);
        resolved = true;
        clearTimeout(timeout);
        resolve(connection);
      })().catch((error) => {
        failSpawnChannel(
          "capability channel startup",
          error instanceof Error ? error : new Error(String(error))
        );
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        for (const line of text.split("\n")) {
          const trimmed = line.trim();
          if (trimmed.length > 0) this.note("err", trimmed, "error");
        }
      });

      child.on("exit", (code, signal) => {
        this.note(
          "sup",
          `exited code=${code}${signal ? ` signal=${signal}` : ""}`,
          "warn"
        );
        spawnDaemonSocketHost?.close();
        if (this.daemonSocketHost === spawnDaemonSocketHost) {
          this.daemonSocketHost = null;
        }
        spawnNetworkHost?.close();
        if (this.networkHost === spawnNetworkHost) this.networkHost = null;
        // `stop()` may already have started a replacement while this child was
        // taking its graceful-shutdown second. The old generation owns no
        // current supervisor state and must not clear or restart the new one.
        if (!this.isCurrentGeneration(child, generation)) return;
        this.info = null;
        this.child = null;
        this.activeGeneration = 0;
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(
            new Error(
              `services sidecar exited before readiness (code=${code} signal=${signal ?? "none"})`
            )
          );
          this.scheduleRestart();
          return;
        }
        if (this.isShuttingDown) return;
        this.scheduleRestart();
      });

      child.on("error", (err) => {
        // `error` fires for spawn failures (ENOENT etc.). Treat as
        // a startup failure if we haven't resolved yet; otherwise
        // log and let `exit` handle cleanup.
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          this.note("sup", `spawn failed: ${err.message}`, "error");
          this.retireGeneration(child, generation, true);
          reject(new Error(`services sidecar spawn failed: ${err.message}`));
        } else {
          this.note("sup", `spawn error: ${err.message}`, "error");
        }
      });
    });
  }

  private isCurrentGeneration(
    child: ChildProcess,
    generation: number
  ): boolean {
    return this.child === child && this.activeGeneration === generation;
  }

  private closeCurrentHosts(): void {
    this.endpointTransport = null;
    this.networkHost?.close();
    this.networkHost = null;
    this.daemonSocketHost?.close();
    this.daemonSocketHost = null;
  }

  private async initializeEndpointConsent(): Promise<void> {
    if (this.endpointConsent) return;
    const transport = () => {
      if (!this.endpointTransport)
        throw new Error("agent provider network is not ready");
      return this.endpointTransport.providers;
    };
    this.endpointConsent = await ProviderEndpointConsent.open({
      directory: ProviderEndpointConsent.directory(this.profile.userData),
      configuration: {
        list: () => transport().list_endpoints(),
        set: (config) => transport().set_endpoint(config),
        delete: (id) => transport().delete_endpoint(id),
        probe: (baseUrl) => transport().probe_endpoint(baseUrl),
      },
      describe: (baseUrl) => this.describeProviderEndpoint(baseUrl),
      approve: (id, baseUrl) => this.approveProviderEndpoint(id, baseUrl),
      revoke: (id) => this.revokeProviderEndpoint(id),
      approved: (id, baseUrl) =>
        this.networkAuthority.approvedEndpointGrant(id, baseUrl) !== null,
      generation: () => this.activeGeneration,
    });
  }

  private retireGeneration(
    child: ChildProcess,
    generation: number,
    restart: boolean
  ): void {
    if (!this.isCurrentGeneration(child, generation)) return;
    this.closeCurrentHosts();
    this.info = null;
    // Clear ownership before kill: a synchronous/mock exit and a delayed real
    // exit are both stale and cannot clear or restart a replacement.
    this.child = null;
    this.activeGeneration = 0;
    try {
      child.kill("SIGTERM");
    } catch {
      // already dead
    }
    if (restart && !this.isShuttingDown) this.scheduleRestart();
  }

  private handleRestartFailure(err: unknown): void {
    this.note(
      "sup",
      `restart failed: ${err instanceof Error ? err.message : String(err)}`,
      "error"
    );
    this.scheduleRestart();
  }

  /**
   * Schedule a single backoff restart. Idempotent: if a restart timer is
   * already pending (or we're shutting down) this is a no-op. That dedup is
   * load-bearing: startup rejection, transport retirement, and a real child
   * exit can converge on the same recovery edge.
   */
  private scheduleRestart(): void {
    if (this.isShuttingDown || this.restartTimer) return;
    const wait = this.restartBackoffMs;
    this.restartBackoffMs = Math.min(this.restartBackoffMs * 2, BACKOFF_MAX_MS);
    this.note("sup", `restart in ${wait}ms`, "warn");
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.isShuttingDown) return;
      if (this.child || this.info || this.spawning) return;
      this.spawn().catch((err) => this.handleRestartFailure(err));
    }, wait);
  }
}

let supervisor: ServicesSidecarSupervisor | undefined;

function sidecar(): ServicesSidecarSupervisor {
  if (!supervisor) throw new Error("services_sidecar_profile_unavailable");
  return supervisor;
}

export function configureServicesSidecar(profile: SidecarProfile): void {
  if (supervisor)
    throw new Error("services_sidecar_profile_already_configured");
  supervisor = new ServicesSidecarSupervisor(profile);
}

export function startServicesSidecar(
  workspaceCatalog?: string
): Promise<ServicesSidecarInfo> {
  return sidecar().start(workspaceCatalog);
}

export function selectNativeChat(ordinary = false): NativeChatPaths {
  return sidecar().selectNativeChat(ordinary);
}

export function getServicesSidecarInfo(): ServicesSidecarInfo | null {
  return supervisor?.getInfo() ?? null;
}

export function getServicesSidecarMode(): ServicesSidecarMode | null {
  return supervisor?.getMode() ?? null;
}

export function nativeAgentEndpointNetwork(id: string, baseUrl: string) {
  return sidecar().nativeEndpointNetwork(id, baseUrl);
}

export function nativeAgentByokSettings(openAiProject?: boolean) {
  return sidecar().nativeByokSettings(openAiProject);
}

export async function nativeAgentOpenAiOffer(
  waitForDiscovery = true
): Promise<NativeOpenAiModels.Offer> {
  return supervisor
    ? await supervisor.nativeOpenAiOffer(waitForDiscovery)
    : { status: "missing" };
}

export function nativeAgentSubscriptionSettings() {
  return sidecar().nativeSubscriptionSettings();
}

export function nativeAgentGatewayConnection(
  account: DesktopAccountSession,
  organizationId?: number,
  signal?: AbortSignal
) {
  return sidecar().nativeGatewayConnection(account, organizationId, signal);
}

export function stopServicesSidecar() {
  supervisor?.stop();
}

export function agentProviderEndpointSettings(): ProviderEndpointConsent {
  return sidecar().providerEndpointSettings();
}
