// GRIDA-SEC-014 — explicit shared provider custody and protected native roots.
// GRIDA-GG: desktop — pass the GG base URL to the daemon (docs/wg/platform/hosted-ai.md)
// GRIDA-SEC-006 — the selected composition receives the scoped GG custody owner.
// GRIDA-SEC-008 — retained services receive no subscription credential authority.
/**
 * Services sidecar entry point.
 *
 * Thin: argv parsing + daemon lifecycle + tidy shutdown. All HTTP
 * surface lives in packages. `sidecar/daemon.ts` starts retained services
 * without importing a chat runtime. It uses `@grida/daemon`'s
 * perimeter and the same package-owned media adapters.
 *
 * The Desktop supervisor uses Electron-as-Node under its native
 * retained-service profile on macOS and Linux, which scopes filesystem access
 * and direct networking.
 *
 * Electron-as-node means the runtime is Node, not the renderer
 * sandbox; no Electron APIs are available here, by design — the
 * product surface is authenticated daemon HTTP. Its two private host
 * channels are deliberately narrower: framed provider/control messages on
 * stdin/stdout, and already-connected daemon sockets on Node IPC.
 *
 * Argv contract:
 *   process.argv[0]    runtime (electron in --as-node mode)
 *   process.argv[1]    this script
 *   stdin              framed host→sidecar control and provider responses
 *   Node IPC           main-accepted connected daemon sockets only
 *   process.argv[2+]   optional `--key=value` flags. Currently:
 *                        --agent=disabled|native-chat
 *                          Host launch choice; disabled by default. Neither
 *                          composition loads chat scratch or skills.
 *                        --protected-file-root=<absolute path>
 *                          Main-owned file/workspace denials, one per root.
 *                        --user-data=<absolute path>
 *                          The host-owned agent data or retained settings root.
 *                        --media-root=<absolute path>
 *                          Platform-local app-managed durable media root.
 *                          Required and resolved by trusted Electron main.
 *
 * Stdout contract: framed sidecar→host control and provider requests only.
 * Human-readable logs always use stderr.
 *
 * Trust boundary: `GRIDA-SEC-004`. The composed Desktop boundary is recorded
 * in `SECURITY.md`: renderer scoping/CSP, the authenticated HTTP perimeter,
 * the native retained-service scope, secrets discipline, the main-owned loopback
 * listener/socket capability channel, and the main-owned provider transport.
 * This process creates no listener; it serves only sockets main already
 * accepted on exact loopback.
 */
import path from "node:path";
import { ServicesSidecarNetwork } from "./services-sidecar-network";
import { ServicesSidecarDaemonSockets } from "./services-sidecar-daemon-sockets";

// Stdout is the private framed channel. Package/runtime diagnostics use
// console.log in several places, so redirect every stdout-backed console method
// before dynamically importing the agent server. stderr remains observable by
// the supervisor and cannot corrupt protocol framing.
console.log = (...args: unknown[]) => console.error(...args);
console.info = (...args: unknown[]) => console.error(...args);
console.debug = (...args: unknown[]) => console.error(...args);

/**
 * Parse `--name=value` from argv[2..]. Returns undefined if not present.
 */
function getCliArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  }
  return undefined;
}

// The desktop supervisor owns the path fact (the `@grida/home` agent dir,
// `~/.grida/agent`) and must forward it. The CLI has its own fallback; this
// production sidecar should fail loud if the host adapter contract is broken.
const userDataPath = getCliArg("user-data");
if (!userDataPath) {
  console.error("[services-sidecar] fatal: missing --user-data");
  process.exit(1);
}
const requiredUserDataPath = userDataPath;
// GRIDA-SEC-014 — explicit host authority; direct test/embedded hosts stay isolated.
const providerHome = getCliArg("provider-home") ?? requiredUserDataPath;
const mediaRoot = getCliArg("media-root");
if (!mediaRoot) {
  console.error("[services-sidecar] fatal: missing --media-root");
  process.exit(1);
}
const requiredMediaRoot = mediaRoot;
const agentMode = getCliArg("agent") ?? "disabled";
const runtimeEditorBaseUrl = getCliArg("editor-base-url") ?? EDITOR_BASE_URL;
// GRIDA-SEC-004 — the supervisor tells us whether it wrapped this spawn with
// native confinement. Trusted: argv is set by the trusted main process, not the renderer.
// Native-chat service settings require this attestation. The service owns no
// commands.
const sandboxEnforced = getCliArg("sandbox-enforced") === "1";
const ordinaryNativeChatServices = getCliArg("ordinary-native-chat-services");
const workspaceCatalog = getCliArg("workspace-catalog");
if (
  workspaceCatalog !== undefined &&
  (!workspaceCatalog || agentMode !== "native-chat" || !sandboxEnforced)
) {
  console.error("[services-sidecar] fatal: invalid workspace catalog scope");
  process.exit(1);
}
if (
  ordinaryNativeChatServices !== undefined &&
  (ordinaryNativeChatServices !== "1" ||
    agentMode !== "native-chat" ||
    !sandboxEnforced ||
    workspaceCatalog !== undefined)
) {
  console.error(
    "[services-sidecar] fatal: invalid ordinary native chat services"
  );
  process.exit(1);
}
const protectedRootFlag = "--protected-file-root=";
const protectedFileRoots = process.argv
  .slice(2)
  .filter((argument) => argument.startsWith(protectedRootFlag))
  .map((argument) => argument.slice(protectedRootFlag.length));
if (
  protectedFileRoots.length > 0 &&
  (protectedFileRoots.length > 64 ||
    protectedFileRoots.some(
      (root) =>
        !path.isAbsolute(root) ||
        root.includes("\0") ||
        Buffer.byteLength(root) > 4096
    ))
) {
  console.error("[services-sidecar] fatal: invalid protected file root");
  process.exit(1);
}
// GRIDA-SEC-004 — host-injected managed root for auto-created projects
// (`~/Documents/Grida Projects`). The supervisor owns the path fact and forwards it;
// absent (e.g. a future supervisor bug) means auto-create simply refuses.
const projectsRoot = getCliArg("projects-root");
async function main() {
  const network = new ServicesSidecarNetwork(process.stdin, process.stdout);
  let daemonSockets: ServicesSidecarDaemonSockets | null = null;
  network.onFatal((error) => {
    console.error(
      `[services-sidecar] provider channel failed: ${error.message}`
    );
    process.exit(1);
  });
  process.on("message", (message, handle) => {
    if (!daemonSockets) {
      if (handle && "destroy" in handle) {
        (handle as { destroy: () => void }).destroy();
      }
      console.error(
        "[services-sidecar] daemon socket arrived before capability setup"
      );
      process.exit(1);
      return;
    }
    daemonSockets.accept(message, handle);
  });
  process.once("disconnect", () => {
    console.error("[services-sidecar] capability channel disconnected");
    process.exit(1);
  });
  const { password, daemonPort } = await network.waitForBootstrap();
  if (!password || password.length < 16) {
    console.error(
      "[services-sidecar] fatal: missing or short bootstrap password"
    );
    process.exit(1);
  }
  // Dynamic by design: no package top-level console output may run before
  // stdout is reserved for the framed channel above.
  const { DesktopDaemon } = await import("./sidecar/daemon");
  const host = await DesktopDaemon.create({
    password,
    user_data_path: requiredUserDataPath,
    provider_home: providerHome,
    media_root: requiredMediaRoot,
    ordinary_native_chat_services: ordinaryNativeChatServices === "1",
    workspace_catalog: workspaceCatalog,
    protected_file_roots: protectedFileRoots.length
      ? protectedFileRoots
      : undefined,
    projects_root: projectsRoot,
    editor_base_url: runtimeEditorBaseUrl,
    agent: agentMode === "native-chat" ? "native-chat" : false,
    // Provider and asset traffic uses the private channel to Electron Main.
    provider_http: network.providerHttp,
  });

  try {
    // Main owns the loopback listener and transfers only accepted sockets over
    // the inherited IPC descriptor. The sidecar creates no network listener;
    // this keeps Linux's private netns reachable and lets macOS deny all raw
    // bind/connect operations.
    await host.start({ listen: false });
    daemonSockets = new ServicesSidecarDaemonSockets(
      (request) => host.fetch(request),
      (error) => {
        console.error(
          `[services-sidecar] daemon capability failed: ${error.message}`
        );
        process.exit(1);
      }
    );
    await announceDaemonCapabilityReady();
    await network.ready(daemonPort);
    console.log(
      `[services-sidecar] serving transferred loopback sockets on host port ${daemonPort}`
    );
  } catch (err) {
    console.error("[services-sidecar] server error:", err);
    process.exit(1);
  }

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[services-sidecar] shutdown (${signal})`);
    daemonSockets?.close();
    const deadline = setTimeout(() => process.exit(1), 1_000);
    void host.stop().then(
      () => {
        clearTimeout(deadline);
        process.exit(0);
      },
      () => {
        clearTimeout(deadline);
        console.warn("[services-sidecar] server close could not be verified");
        process.exit(1);
      }
    );
  };
  network.onShutdown(() => shutdown("host-shutdown"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

void main().catch((err) => {
  console.error("[services-sidecar] fatal:", err);
  process.exit(1);
});

async function announceDaemonCapabilityReady(): Promise<void> {
  if (!process.send || !process.connected) {
    throw new Error("daemon capability IPC was not inherited");
  }
  await new Promise<void>((resolve, reject) => {
    process.send!({ v: 1, type: "daemon.capability.ready" }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
