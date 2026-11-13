// GRIDA-SEC-014 — explicit shared provider custody and protected native roots.
// GRIDA-GG: desktop — pass the GG host into the sandbox policy (docs/wg/platform/hosted-ai.md)
/**
 * GRIDA-SEC-004 — retained-service supervision and private host channels.
 *
 * Native Seatbelt or bubblewrap confines the socketless service on macOS/Linux.
 * Main supplies connected daemon sockets and provider HTTP through inherited
 * channels. The retained process has no model command or direct network owner.
 * Windows keeps its explicitly unconfined non-agent compatibility services.
 */
import { app } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { home } from "@grida/home";
import { ProtectedRoots } from "@grida/daemon/server";
import { SidecarLogWriter } from "./sidecar-log";
import { EDITOR_BASE_URL } from "../env";
import { AgentNetworkAuthority } from "./agent-network-authority";
import { AgentNetworkHost } from "./agent-network-host";
import { AgentDaemonSocketHost } from "./agent-daemon-socket-host";
import { SidecarSandboxPolicy } from "./sidecar-sandbox-policy";
import { DesktopMediaRoot } from "./media-root";
import type { NativeProviderNetwork } from "./native-provider-egress";
import type { DesktopAccountSession } from "./account-session";
import { NativeGatewayConnection } from "./native-gateway-connection";
import { AgentNetworkPolicy } from "../agent-network-policy";
import { NativeDesktopProfile } from "./native-desktop-profile";
import { RetainedMediaLaunch } from "./retained-media-launch";
import { RetainedServiceSandbox } from "./retained-service-sandbox";
import { LegacyAgentPaths } from "./legacy-agent-paths";

export type AgentSidecarInfo = {
  /** Electron-main-owned TCP listener port (exact 127.0.0.1, ephemeral). */
  port: number;
  /** Per-spawn Basic-Auth password. Main process only; preload requests it over guarded IPC. */
  password: string;
};

type AgentSidecarMode = "disabled" | "native-chat";

const STARTUP_TIMEOUT_MS = 15_000;
const DRAIN_EXIT_TIMEOUT_MS = 10_000;
const BACKOFF_INITIAL_MS = 250;
const BACKOFF_MAX_MS = 10_000;

type LegacyChatSource = Readonly<{
  userDataPath: string;
  scratchBase: string;
  desktopUserDataPath: string;
  providerHome: string;
  mediaRoot: string;
}>;
type RetainedMediaScope = Readonly<{
  mediaOnly: boolean;
  source?: Promise<LegacyChatSource>;
}>;
export class LegacyChatHandoffRequired extends Error {
  constructor(cause?: unknown) {
    super("legacy_chat_handoff_required", { cause });
  }
}

export class AgentSidecarSupervisor {
  private servicesStarted = false;
  private coldStartSource?: Promise<LegacyChatSource>;
  private ordinaryNativeChat = false;
  private retainedMedia?: RetainedMediaScope;
  private completedMediaArchive?: Readonly<{ id: string; directory: string }>;
  private retiringMedia?: Promise<void>;
  private child: ChildProcess | null = null;
  private activeGeneration = 0;
  private nextGeneration = 0;
  private spawning: Promise<AgentSidecarInfo> | null = null;
  private networkHost: AgentNetworkHost | null = null;
  private daemonSocketHost: AgentDaemonSocketHost | null = null;
  private info: {
    connection: AgentSidecarInfo;
    mode: AgentSidecarMode;
  } | null = null;
  private restartBackoffMs = BACKOFF_INITIAL_MS;
  private isShuttingDown = false;
  private verifiedDrain: Promise<void> | undefined;
  private drainingChild: ChildProcess | null = null;
  private restartTimer: NodeJS.Timeout | null = null;
  // A null value reserves the compatibility role while its module loads.
  private nativeSandbox?: RetainedServiceSandbox;
  private sandboxReady = false;
  private workspaceCatalog?: string;
  private legacyStateRoots: readonly string[] = [];
  private protectedFileRoots: readonly string[] = [];
  private readonly networkAuthority = new AgentNetworkAuthority(
    new URL(EDITOR_BASE_URL).origin
  );

  // The agent's data dir: the canonical Grida home + the "agent" component
  // (~/.grida/agent). Resolved ONCE so the sandbox write-allowlist and the
  // sidecar's `--user-data` argv cannot diverge (GRIDA-SEC-004). Uses
  // os.homedir() (== app.getPath("home")) so it is safe to compute at module
  // construction, before Electron is ready. This secret-state path stays
  // separate from Electron's app.getPath("userData") browser profile; the
  // app-managed media root below is resolved and sandboxed independently.
  private readonly user_data_path =
    NativeDesktopProfile.agentData() ?? home.join("agent");
  // GRIDA-SEC-014 — one path fact for custody, sidecar argv and command denies.
  private readonly provider_home =
    NativeDesktopProfile.agentData() ?? home.dir();
  private readonly media_root = DesktopMediaRoot.current();

  // Durable sidecar log (~/.grida/agent/logs/sidecar.log) — the on-disk
  // trace a packaged-app incident needs (the console is gone by the time
  // anyone looks).
  private readonly log = new SidecarLogWriter(
    path.join(this.user_data_path, "logs")
  );

  /** One statement per event: mirror to the console AND the durable log so
   * a lifecycle line can never land console-only. */
  private note(
    stream: "out" | "err" | "sup",
    line: string,
    level: "log" | "warn" | "error" = "log"
  ): void {
    const prefix = stream === "err" ? "[agent-sidecar:err]" : "[agent-sidecar]";
    // eslint-disable-next-line no-console
    console[level](`${prefix} ${line}`);
    this.log.write(stream, line);
  }

  constructor() {
    app.once("will-quit", () => {
      // Main awaits the exact writer drain for these launch roles.
      if (this.retainedMedia) return;
      this.isShuttingDown = true;
      if (this.restartTimer) {
        clearTimeout(this.restartTimer);
        this.restartTimer = null;
      }
      this.stop();
    });
  }

  async start(workspaceCatalog?: string): Promise<AgentSidecarInfo> {
    if (this.isShuttingDown) throw new Error("agent_sidecar_shutting_down");
    if (this.retainedMedia) throw new Error("retained_media_already_selected");
    if (
      (workspaceCatalog &&
        (!this.coldStartSource ||
          !RetainedServiceSandbox.isSupportedPlatform())) ||
      (this.sandboxReady && workspaceCatalog !== this.workspaceCatalog)
    )
      throw new Error("workspace_catalog_scope_invalid");
    this.workspaceCatalog = workspaceCatalog;
    this.servicesStarted = true;
    await this.assertCompatibilitySourceAvailable();
    if (this.isShuttingDown) throw new Error("agent_sidecar_shutting_down");
    if (this.info) return this.info.connection;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (!this.sandboxReady) {
      await this.initSandbox();
    }
    return await this.spawn();
  }

  /** Existing custody also covers an interrupted retirement with no receipt. */
  async assertCompatibilitySourceAvailable(): Promise<void> {
    if (process.platform !== "darwin" && process.platform !== "linux") return;
    const { LegacyChatSourceLease } =
      await import("./legacy-chat-source-lease");
    try {
      await fs.promises.lstat(
        LegacyChatSourceLease.controlRoot(this.user_data_path)
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw new LegacyChatHandoffRequired(error);
    }
    // A native Linux mask is not a historical writer claim. It remains bound
    // to this live generation's exact owned inode and is removed only on close.
    if (
      RetainedServiceSandbox.ownsMountpoint(
        LegacyChatSourceLease.controlRoot(this.user_data_path)
      )
    )
      return;
    throw new LegacyChatHandoffRequired();
  }

  async startRetainedMedia(): Promise<AgentSidecarInfo> {
    const mediaOnly = NativeDesktopProfile.mediaOnly();
    const source = this.coldStartSource;
    if (
      (!source && !mediaOnly) ||
      !app.hasSingleInstanceLock() ||
      !app.isPackaged ||
      !NativeDesktopProfile.selected() ||
      this.servicesStarted ||
      this.nativeSandbox !== undefined ||
      this.isShuttingDown
    )
      throw new Error("retained_media_profile_unavailable");
    this.retainedMedia ??= Object.freeze({ mediaOnly, source });
    if (this.retiringMedia) await this.retiringMedia;
    if (this.isShuttingDown) throw new Error("agent_sidecar_shutting_down");
    return await this.spawn();
  }

  private async prepareRetainedMedia({
    mediaOnly,
    source,
  }: RetainedMediaScope): Promise<RetainedMediaLaunch.Options> {
    await source;
    if (mediaOnly && NativeDesktopProfile.managedCutover()) {
      try {
        const archive = await this.verifyCompletedMediaArchive();
        this.completedMediaArchive ??= archive;
      } catch (error) {
        throw new LegacyChatHandoffRequired(error);
      }
    }
    if (this.isShuttingDown) throw new Error("agent_sidecar_shutting_down");
    await RetainedMediaLaunch.prepareSettings(this.user_data_path);
    await RetainedMediaLaunch.prepareProviderHome(this.provider_home);
    const temporary = path.join(app.getPath("temp"), "retained-media");
    await fs.promises
      .mkdir(temporary, { mode: 0o700 })
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error;
      });
    return Object.freeze({
      executable: process.execPath,
      agentData: this.user_data_path,
      providerHome: this.provider_home,
      media: this.media_root,
      temporary,
      editorBaseUrl: EDITOR_BASE_URL,
      mediaOnly,
    });
  }

  get hasCompletedMediaArchive(): boolean {
    return !this.isShuttingDown && this.completedMediaArchive !== undefined;
  }

  async revealCompletedMediaArchive(
    reveal: (directory: string) => void
  ): Promise<void> {
    if (!this.hasCompletedMediaArchive)
      throw new Error("legacy_chat_archive_unavailable");
    const archive = await this.verifyCompletedMediaArchive();
    if (this.hasCompletedMediaArchive) reveal(archive.directory);
  }

  private async verifyCompletedMediaArchive() {
    const { NativeAgentCutover } = await import("./native-agent-cutover");
    const { id, directory } = await NativeAgentCutover.verifyCompletedMediaOnly(
      await this.captureCutoverSource(),
      async (identity, claimId) => {
        if (!claimId) return false;
        NativeDesktopProfile.verifyPromotion({ ...identity, claimId });
        return true;
      }
    );
    const accepted = this.completedMediaArchive;
    if (accepted && (accepted.id !== id || accepted.directory !== directory))
      throw new Error("legacy_chat_archive_unavailable");
    return Object.freeze({ id, directory });
  }

  closeRetainedMedia(): Promise<void> {
    if (!this.retainedMedia) return Promise.resolve();
    if (this.info) return this.drain();
    return (this.verifiedDrain ??= this.closeStartingMedia());
  }

  private async closeStartingMedia(): Promise<void> {
    this.isShuttingDown = true;
    this.stop();
    const retired = this.retiringMedia;
    if (!retired) return;
    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        retired,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("agent_sidecar_drain_unverified")),
            DRAIN_EXIT_TIMEOUT_MS
          );
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Select the media-only composition before the old writer can be started. */
  async sealLegacyChatForColdStart(
    ordinary = false
  ): Promise<LegacyChatSource> {
    if (
      !app.hasSingleInstanceLock() ||
      NativeDesktopProfile.mediaOnly() ||
      (this.coldStartSource && ordinary !== this.ordinaryNativeChat) ||
      this.servicesStarted ||
      this.isShuttingDown
    ) {
      throw new Error("legacy_chat_cold_start_required");
    }
    this.ordinaryNativeChat = ordinary;
    return (this.coldStartSource ??= this.captureCutoverSource());
  }

  private async captureCutoverSource(): Promise<LegacyChatSource> {
    const temp = app.getPath("temp");
    const desktopUserDataPath = app.getPath("userData");
    return Object.freeze({
      userDataPath: this.user_data_path,
      scratchBase: LegacyAgentPaths.scratchBase(this.user_data_path, temp),
      desktopUserDataPath,
      providerHome: this.provider_home,
      mediaRoot: this.media_root,
    });
  }

  getInfo(): AgentSidecarInfo | null {
    return this.info?.connection ?? null;
  }

  getMode(): AgentSidecarMode | null {
    return this.info?.mode ?? null;
  }

  /** Permanently retire this ready generation and verify its exact cleanup. */
  drain(): Promise<void> {
    return (this.verifiedDrain ??= this.drainCurrent());
  }

  private async drainCurrent(): Promise<void> {
    const {
      child,
      activeGeneration: generation,
      networkHost,
      daemonSocketHost,
    } = this;
    if (
      !app.hasSingleInstanceLock() ||
      this.isShuttingDown ||
      !this.info ||
      !child ||
      !networkHost ||
      !daemonSocketHost
    )
      throw new Error("agent_sidecar_drain_unverified");

    this.isShuttingDown = true;
    this.drainingChild = child;
    this.info = null;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    daemonSocketHost.close();
    const exited = Promise.withResolvers<void>();
    const onClose = (code: number | null, signal: NodeJS.Signals | null) => {
      if (code === 0 && signal === null) exited.resolve();
      else exited.reject(new Error("agent_sidecar_drain_unverified"));
    };
    const timer = setTimeout(
      () => exited.reject(new Error("agent_sidecar_drain_unverified")),
      DRAIN_EXIT_TIMEOUT_MS
    );
    child.once("close", onClose);
    try {
      await Promise.all([networkHost.requestDrain(), exited.promise]);
    } catch (error) {
      this.retireGeneration(child, generation, false);
      throw error;
    } finally {
      clearTimeout(timer);
      child.off("close", onClose);
      this.drainingChild = null;
      if (this.isCurrentGeneration(child, generation)) {
        this.closeCurrentHosts();
        this.child = null;
        this.activeGeneration = 0;
      }
    }
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
    return await AgentNetworkHost.nativeProviderNetwork(
      this.networkAuthority,
      grantId
    );
  }

  nativeByokSettings() {
    return {
      credentialHome: this.provider_home,
      network: () =>
        AgentNetworkHost.nativeProviderNetwork(
          this.networkAuthority,
          AgentNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID
        ),
    };
  }

  // GRIDA-SEC-008 — the sealed Desktop source is the sole OAuth home.
  async nativeSubscriptionSettings() {
    if (!this.coldStartSource || this.isShuttingDown)
      throw new Error("native_chatgpt_source_unavailable");
    const [source, network] = await Promise.all([
      this.coldStartSource,
      AgentNetworkHost.nativeProviderNetwork(
        this.networkAuthority,
        AgentNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID
      ),
    ]);
    if (this.isShuttingDown)
      throw new Error("native_chatgpt_source_unavailable");
    return { userDataPath: source.userDataPath, network };
  }

  async nativeGatewayConnection(
    account: DesktopAccountSession,
    organizationId?: number,
    signal?: AbortSignal
  ): Promise<NativeGatewayConnection> {
    const origin = new URL(EDITOR_BASE_URL).origin;
    const [network, jobNetwork] = await Promise.all([
      AgentNetworkHost.nativeProviderNetwork(
        this.networkAuthority,
        AgentNetworkPolicy.BUILTIN_PROVIDER_GRANT_ID
      ),
      AgentNetworkHost.nativeGatewayJobNetwork(this.networkAuthority, origin),
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

  async withTemporaryProviderEndpoint<T>(
    baseUrl: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const endpointId = `probe_${crypto.randomUUID().replaceAll("-", "")}`;
    let approved = false;
    let published = false;
    try {
      this.networkAuthority.approveCustomEndpoint(endpointId, baseUrl);
      approved = true;
      await this.publishGrants();
      published = true;
      return await operation();
    } finally {
      if (approved) {
        this.networkAuthority.revokeCustomEndpoint(endpointId);
        // If initial publication or the operation retired the generation, its
        // replacement bootstraps the already-rolled-back snapshot. When the
        // same generation is alive, explicitly revoke and await its ACK.
        if (published && this.networkHost) await this.publishGrants();
      }
    }
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
    if (!RetainedServiceSandbox.isSupportedPlatform()) {
      if (this.coldStartSource)
        throw new Error("native_retained_sidecar_sandbox_unavailable");
      this.protectedFileRoots = [
        path.join(
          app.getPath("userData"),
          NativeDesktopProfile.chatStateDirectory
        ),
      ];
      // Existing Windows file/media services have no native confinement claim.
      if (process.platform !== "win32")
        throw new Error("retained_service_platform_unsupported");
      console.warn(
        "[agent-sidecar] Windows retained services have no kernel confinement"
      );
      this.sandboxReady = true;
      return;
    }
    const coldSource = await this.coldStartSource;
    let legacyPolicyRoots: readonly string[] = [];
    if (coldSource && NativeDesktopProfile.selected()) {
      const legacy = NativeDesktopProfile.legacyRoots(app);
      if (legacy.overlaps(path.dirname(app.getPath("userData"))))
        throw new Error("native_desktop_profile_invalid");
      // The sidecar cannot stat the denied lexical symlink. Main resolves it
      // before confinement, while the file registry rechecks target aliases.
      this.legacyStateRoots = legacy.canonicalPaths();
      legacyPolicyRoots = [...legacy.metadataPaths(), ...this.legacyStateRoots];
    }
    const controls = NativeDesktopProfile.managedCutoverControls();
    if (controls.length) {
      const { LegacyChatSourceLease } =
        await import("./legacy-chat-source-lease");
      const custody = [
        ...controls,
        LegacyChatSourceLease.controlRoot(this.user_data_path),
        ...(coldSource
          ? [
              coldSource.scratchBase,
              ...[
                "chat-archive",
                "sessions.db",
                "sessions.db-wal",
                "sessions.db-shm",
                "sessions.db-journal",
              ].map((name) => path.join(this.user_data_path, name)),
            ]
          : []),
      ];
      this.legacyStateRoots = [...this.legacyStateRoots, ...custody];
      legacyPolicyRoots = [...legacyPolicyRoots, ...custody];
    }
    if (this.ordinaryNativeChat && coldSource) {
      const protectedChat = new ProtectedRoots([
        coldSource.scratchBase,
        ...[
          "sessions.db",
          "sessions.db-wal",
          "sessions.db-shm",
          "sessions.db-journal",
          "chat-archive",
          "legacy-chat-ownership",
        ].map((name) => path.join(coldSource.userDataPath, name)),
      ]);
      this.legacyStateRoots = protectedChat.canonicalPaths();
      legacyPolicyRoots = [
        ...protectedChat.metadataPaths(),
        ...this.legacyStateRoots,
      ];
    }
    const nativeStateRoot =
      this.ordinaryNativeChat && coldSource
        ? path.join(
            coldSource.desktopUserDataPath,
            NativeDesktopProfile.chatStateDirectory
          )
        : (coldSource?.desktopUserDataPath ??
          path.join(
            app.getPath("userData"),
            NativeDesktopProfile.chatStateDirectory
          ));
    this.protectedFileRoots = [
      ...new Set([
        ...this.legacyStateRoots,
        nativeStateRoot,
        ...(this.workspaceCatalog ? [path.dirname(this.workspaceCatalog)] : []),
      ]),
    ];
    const policy = SidecarSandboxPolicy.build({
      userData: this.user_data_path,
      providerRoot: path.join(this.provider_home, "providers"),
      mediaRoot: this.media_root,
      desktopStateRoot: nativeStateRoot,
      legacyStateRoots: legacyPolicyRoots,
      workspaceCatalogRoot: this.workspaceCatalog
        ? path.dirname(this.workspaceCatalog)
        : undefined,
      home: app.getPath("home"),
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
   * `.vite/build/agent-sidecar.js` next to `main.js`. In packaged builds
   * `__dirname` is inside the asar; the bundled sidecar script lives
   * alongside, and Electron's asar transparent-read serves it when
   * we `spawn` Electron-as-node with that path.
   */
  private sidecarScriptPath(): string {
    return path.join(__dirname, "agent-sidecar.js");
  }

  private spawn(): Promise<AgentSidecarInfo> {
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

  private async spawnOne(): Promise<AgentSidecarInfo> {
    const generation = ++this.nextGeneration;
    const retained =
      this.retainedMedia &&
      (await this.prepareRetainedMedia(this.retainedMedia));
    const scriptPath = this.sidecarScriptPath();
    const password = crypto.randomBytes(32).toString("base64url");

    const sandbox = retained ? undefined : this.nativeSandbox;
    const supportedSandbox = sandbox !== undefined;
    if (!retained && !supportedSandbox && process.platform !== "win32")
      throw new Error("agent_sidecar_sandbox_unavailable");

    const mode =
      this.coldStartSource && !retained?.mediaOnly ? "native-chat" : "disabled";
    const args = [
      scriptPath,
      `--user-data=${this.user_data_path}`,
      `--provider-home=${this.provider_home}`,
      `--media-root=${this.media_root}`,
      `--agent=${mode}`,
      ...(this.ordinaryNativeChat ? ["--ordinary-native-chat-services=1"] : []),
      ...(this.workspaceCatalog
        ? [`--workspace-catalog=${this.workspaceCatalog}`]
        : []),
      ...this.protectedFileRoots.map((root) => `--protected-file-root=${root}`),
      // GRIDA-SEC-004 — host-injected managed root for the auto-create flow.
      // A visible, Finder-navigable location (files stay visible); the sidecar
      // may only mint project folders INSIDE this root. `documents` needs a
      // ready app, which holds at spawn time (post `app.whenReady`).
      `--projects-root=${path.join(app.getPath("documents"), "Grida Projects")}`,
      `--editor-base-url=${EDITOR_BASE_URL}`,
      // GRIDA-SEC-004 — only native retained-service confinement supplies this fact.
      `--sandbox-enforced=${supportedSandbox ? "1" : "0"}`,
    ];
    if (!retained) await this.assertCompatibilitySourceAvailable();
    const nativePlan = sandbox?.prepare(process.execPath, args, process, {
      state: this.user_data_path,
      providerHome: this.provider_home,
      media: this.media_root,
    });
    try {
      if (!retained) await this.assertCompatibilitySourceAvailable();
      if (generation !== this.nextGeneration || this.isShuttingDown)
        throw new Error("agent sidecar startup was cancelled");
    } catch (error) {
      nativePlan?.release?.();
      throw error;
    }
    return await new Promise<AgentSidecarInfo>((resolve, reject) => {
      let resolved = false;
      let child: ChildProcess;
      const retainedLaunch = retained && RetainedMediaLaunch.start(retained);
      // Per-spawn ownership: an old child's delayed `exit` must never close or
      // clear the network host belonging to a newer generation.
      let spawnNetworkHost: AgentNetworkHost | null = null;
      let spawnDaemonSocketHost: AgentDaemonSocketHost | null = null;
      const timeout = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        this.note("sup", "startup timed out; stopping child", "warn");
        this.retireGeneration(child, generation, true);
        reject(new Error("agent sidecar startup timed out"));
      }, STARTUP_TIMEOUT_MS);

      // Main owns all provider HTTP. The service receives only its explicit
      // process facts, never ambient provider keys, shell startup or proxy state.
      const childEnv: NodeJS.ProcessEnv = {
        ELECTRON_RUN_AS_NODE: "1",
        HOME: app.getPath("home"),
        TMPDIR: app.getPath("temp"),
        TMP: app.getPath("temp"),
        TEMP: app.getPath("temp"),
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
        child =
          retainedLaunch?.child ??
          (nativePlan
            ? RetainedServiceSandbox.start(nativePlan, childEnv)
            : spawn(process.execPath, args, {
                shell: false,
                env: childEnv,
                stdio: ["pipe", "pipe", "pipe", "ipc"],
              }));
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
        return;
      }
      this.child = child;
      this.activeGeneration = generation;
      this.note(
        "sup",
        `spawned pid=${child.pid ?? "?"} sandbox=${retained ? "retained-media" : supportedSandbox ? process.platform : "none"}`
      );
      if (!child.stdin || !child.stdout || !child.send || !child.connected) {
        resolved = true;
        clearTimeout(timeout);
        this.retireGeneration(child, generation, true);
        reject(new Error("agent sidecar stdio channel unavailable"));
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
          reject(new Error(`agent sidecar ${label} failed`));
        }
        this.retireGeneration(child, generation, true);
      };
      void (async () => {
        const daemonSocketHost = new AgentDaemonSocketHost(child, (error) =>
          failSpawnChannel("daemon capability channel", error)
        );
        spawnDaemonSocketHost = daemonSocketHost;
        const daemonPort = await daemonSocketHost.listen();
        const capabilityReady = daemonSocketHost.waitForCapabilityReady();
        const host = await AgentNetworkHost.create({
          input: child.stdout!,
          output: child.stdin!,
          authority: this.networkAuthority,
          onFatal: (error) => failSpawnChannel("capability channel", error),
          prepareProviderCustody: retainedLaunch?.prepareProviderCustody,
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

      child.on(retained ? "close" : "exit", (code, signal) => {
        this.note(
          "sup",
          `exited code=${code}${signal ? ` signal=${signal}` : ""}`,
          "warn"
        );
        // Node may emit exit with a cleanup acknowledgment still buffered in
        // stdout. The verified drain owns these hosts until pipe close.
        if (this.drainingChild === child) return;
        if (retained && this.isCurrentGeneration(child, generation)) {
          this.joinRetiringMedia(child, true, true);
        }
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
              `agent sidecar exited before readiness (code=${code} signal=${signal ?? "none"})`
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
          reject(new Error(`agent sidecar spawn failed: ${err.message}`));
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
    this.networkHost?.close();
    this.networkHost = null;
    this.daemonSocketHost?.close();
    this.daemonSocketHost = null;
  }

  private retireGeneration(
    child: ChildProcess,
    generation: number,
    restart: boolean
  ): void {
    if (!this.isCurrentGeneration(child, generation)) return;
    if (this.retainedMedia) this.joinRetiringMedia(child, false, restart);
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

  private joinRetiringMedia(
    child: ChildProcess,
    closed: boolean,
    restart: boolean
  ): void {
    const exited = closed
      ? Promise.resolve()
      : new Promise<void>((resolve) => child.once("close", () => resolve()));
    const custody = this.networkHost?.joinCustody();
    const retiring = Promise.all([exited, custody]).then(() => undefined);
    this.retiringMedia = retiring;
    void retiring.then(() => {
      if (this.retiringMedia !== retiring) return;
      this.retiringMedia = undefined;
      if (restart) this.scheduleRestart();
    });
  }

  private handleRestartFailure(err: unknown): void {
    this.note(
      "sup",
      `restart failed: ${err instanceof Error ? err.message : String(err)}`,
      "error"
    );
    if (!(err instanceof LegacyChatHandoffRequired)) this.scheduleRestart();
  }

  /**
   * Schedule a single backoff restart. Idempotent: if a restart timer is
   * already pending (or we're shutting down) this is a no-op. That dedup is
   * load-bearing: startup rejection, transport retirement, and a real child
   * exit can converge on the same recovery edge.
   */
  private scheduleRestart(): void {
    if (this.isShuttingDown || this.restartTimer || this.retiringMedia) return;
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

let supervisor: AgentSidecarSupervisor | undefined;

function sidecar(): AgentSidecarSupervisor {
  return (supervisor ??= new AgentSidecarSupervisor());
}

export function startAgentSidecar(
  workspaceCatalog?: string
): Promise<AgentSidecarInfo> {
  return sidecar().start(workspaceCatalog);
}

export function assertCompatibilityChatSourceAvailable(): Promise<void> {
  return sidecar().assertCompatibilitySourceAvailable();
}

export function startRetainedMediaSidecar(): Promise<AgentSidecarInfo> {
  return sidecar().startRetainedMedia();
}

export function closeRetainedMediaSidecar(): Promise<void> {
  return supervisor?.closeRetainedMedia() ?? Promise.resolve();
}

export function hasCompletedMediaArchive(): boolean {
  return supervisor?.hasCompletedMediaArchive ?? false;
}

export async function revealCompletedMediaArchive(
  reveal: (directory: string) => void
): Promise<void> {
  if (!supervisor) throw new Error("legacy_chat_archive_unavailable");
  await supervisor.revealCompletedMediaArchive(reveal);
}

export function sealLegacyChatForColdStart(ordinary = false) {
  return sidecar().sealLegacyChatForColdStart(ordinary);
}

export function getAgentSidecarInfo(): AgentSidecarInfo | null {
  return supervisor?.getInfo() ?? null;
}

export function getAgentSidecarMode(): AgentSidecarMode | null {
  return supervisor?.getMode() ?? null;
}

export function nativeAgentEndpointNetwork(id: string, baseUrl: string) {
  return sidecar().nativeEndpointNetwork(id, baseUrl);
}

export function nativeAgentByokSettings() {
  return sidecar().nativeByokSettings();
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

export function stopAgentSidecar() {
  supervisor?.stop();
}

export async function approveAgentProviderEndpoint(
  id: string,
  baseUrl: string
): Promise<void> {
  await sidecar().approveProviderEndpoint(id, baseUrl);
}

export async function revokeAgentProviderEndpoint(id: string): Promise<void> {
  await sidecar().revokeProviderEndpoint(id);
}

export async function withTemporaryAgentProviderEndpoint<T>(
  baseUrl: string,
  operation: () => Promise<T>
): Promise<T> {
  return await sidecar().withTemporaryProviderEndpoint(baseUrl, operation);
}

export async function describeAgentProviderEndpoint(
  baseUrl: string
): Promise<{ origin: string; route: string }> {
  return await sidecar().describeProviderEndpoint(baseUrl);
}
