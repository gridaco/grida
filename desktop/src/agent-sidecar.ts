// GRIDA-GG: desktop — pass the GG base URL to the daemon (docs/wg/platform/hosted-ai.md)
// GRIDA-SEC-006 — the selected composition receives the scoped GG custody owner.
// GRIDA-SEC-008 — construct the native provider inside Grida's agent tenant.
/**
 * Agent sidecar entry point.
 *
 * Thin: argv parsing + daemon lifecycle + tidy shutdown. All HTTP
 * surface lives in packages. `sidecar/daemon.ts` chooses the media-only or
 * full agent composition before importing chat. Both use `@grida/daemon`'s
 * perimeter and the same package-owned media adapters.
 *
 * Spawned by `desktop/src/main/agent-sidecar-supervisor.ts` as
 * `child_process.spawn(electron, [this script], { env: {
 * ELECTRON_RUN_AS_NODE: '1' } })` **wrapped by srt**
 * (`@anthropic-ai/sandbox-runtime`). The wrap applies an OS-level
 * Seatbelt (macOS) or bubblewrap (Linux) profile that scopes
 * filesystem read/write and outbound network — any child process
 * the sidecar spawns inherits the same profile.
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
 *                        --agent=enabled|disabled
 *                          Host launch choice; enabled by default. Disabled
 *                          does not require scratch or discover skills.
 *                        --user-data=<absolute path>
 *                          the agent home dir (`~/.grida/agent`, resolved
 *                          via `@grida/home`). We can't import that (or
 *                          `electron`) here, so the supervisor forwards it.
 *                        --scratch-base=<absolute path>
 *                          Electron-main-resolved temp authority root. This is
 *                          intentionally resolved before SRT rewrites TMPDIR.
 *                        --media-root=<absolute path>
 *                          Platform-local app-managed durable media root.
 *                          Required and resolved by trusted Electron main.
 *
 * Stdout contract: framed sidecar→host control and provider requests only.
 * Human-readable logs always use stderr.
 *
 * Trust boundary: `GRIDA-SEC-004`. The composed Desktop boundary is recorded
 * in `SECURITY.md`: renderer scoping/CSP, the authenticated HTTP perimeter,
 * the OS-level srt scope, secrets discipline, the main-owned loopback
 * listener/socket capability channel, and the main-owned provider transport.
 * This process creates no listener; it serves only sockets main already
 * accepted on exact loopback.
 */
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { AgentSidecarNetwork } from "./agent-sidecar-network";
import { AgentSidecarDaemonSockets } from "./agent-sidecar-daemon-sockets";

// Route Node's built-in `fetch` (undici) through whatever proxy is in
// `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY`. Without this, undici v6+
// ignores those env vars and dials direct — which is wrong for us
// because srt (the outer sandbox wrap in
// `main/agent-sidecar-supervisor.ts`) sets those env vars to point at its
// own in-process HTTP/SOCKS proxies on `localhost`, and the
// allowlist in `@grida/agent/server` lives at that proxy. Bypass
// the proxy and Seatbelt's outbound-DNS deny surfaces as a
// misleading `getaddrinfo ENOTFOUND <host>` from inside the AI SDK's
// retry loop, with no obvious connection to the sandbox. Trusted in-process
// provider operations now use the explicit host transport below. This ambient
// dispatcher remains for separately-authorized non-provider sidecar traffic;
// Desktop supplies no direct external destinations to that policy.
//
// `EnvHttpProxyAgent` reads the env at construction time, so this
// must run before any top-level fetch — i.e. before any other
// import that might do work. Keep it directly under the imports.
setGlobalDispatcher(new EnvHttpProxyAgent());

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
  console.error("[agent-sidecar] fatal: missing --user-data");
  process.exit(1);
}
const requiredUserDataPath = userDataPath;
const mediaRoot = getCliArg("media-root");
if (!mediaRoot) {
  console.error("[agent-sidecar] fatal: missing --media-root");
  process.exit(1);
}
const requiredMediaRoot = mediaRoot;
const agentMode = getCliArg("agent") ?? "enabled";
if (agentMode !== "enabled" && agentMode !== "disabled") {
  console.error("[agent-sidecar] fatal: --agent must be enabled or disabled");
  process.exit(1);
}
const scratchBase = getCliArg("scratch-base");
if (agentMode === "enabled" && !scratchBase) {
  console.error("[agent-sidecar] fatal: missing --scratch-base");
  process.exit(1);
}
const requiredScratchBase = scratchBase;
const runtimeEditorBaseUrl = getCliArg("editor-base-url") ?? EDITOR_BASE_URL;
// GRIDA-SEC-004 — the supervisor tells us whether it wrapped this spawn with
// srt. Trusted: argv is set by the trusted main process, not the renderer.
// Default-off is fail-closed — a missing/`0` flag means the shell tool stays
// disabled, so a future supervisor bug that drops the flag can't silently
// expose an unsandboxed shell.
const sandboxEnforced = getCliArg("sandbox-enforced") === "1";
// GRIDA-SEC-004 — host-injected managed root for auto-created projects
// (`~/Documents/Grida Projects`). The supervisor owns the path fact and forwards it;
// absent (e.g. a future supervisor bug) means auto-create simply refuses.
const projectsRoot = getCliArg("projects-root");
// The host-bundled skills dir (repo-root `skills/`), resolved by the supervisor
// (dev = repo path; packaged = resources). Absent ⇒ no built-in skills.
const skillsRoot =
  agentMode === "enabled" ? getCliArg("skills-root") : undefined;
if (agentMode === "enabled" && !skillsRoot) {
  // A silent undefined here is exactly how the built-ins first shipped dormant
  // (see the `agentTenantOptionsFromDaemon` regression). Warn so a repeat —
  // a dropped/misnamed flag from the supervisor — is visible at startup
  // instead of only surfacing as "the agent knows no skills" in a live run.
  console.warn(
    "[agent-sidecar] --skills-root not provided; built-in skills (svg/dotcanvas/slides) will not be discovered."
  );
}

async function main() {
  const network = new AgentSidecarNetwork(process.stdin, process.stdout);
  let daemonSockets: AgentSidecarDaemonSockets | null = null;
  network.onFatal((error) => {
    console.error(`[agent-sidecar] provider channel failed: ${error.message}`);
    process.exit(1);
  });
  process.on("message", (message, handle) => {
    if (!daemonSockets) {
      if (handle && "destroy" in handle) {
        (handle as { destroy: () => void }).destroy();
      }
      console.error(
        "[agent-sidecar] daemon socket arrived before capability setup"
      );
      process.exit(1);
      return;
    }
    daemonSockets.accept(message, handle);
  });
  process.once("disconnect", () => {
    console.error("[agent-sidecar] capability channel disconnected");
    process.exit(1);
  });
  const { password, daemonPort } = await network.waitForBootstrap();
  if (!password || password.length < 16) {
    console.error("[agent-sidecar] fatal: missing or short bootstrap password");
    process.exit(1);
  }

  // Dynamic by design: no package top-level console output may run before
  // stdout is reserved for the framed channel above.
  const { DesktopDaemon } = await import("./sidecar/daemon");
  const host = await DesktopDaemon.create({
    password,
    user_data_path: requiredUserDataPath,
    media_root: requiredMediaRoot,
    projects_root: projectsRoot,
    editor_base_url: runtimeEditorBaseUrl,
    agent:
      agentMode === "disabled"
        ? false
        : {
            // The enabled-mode argv guard above requires this host authority.
            scratch_base: requiredScratchBase!,
            skills_root: skillsRoot,
            sandbox_enforced: sandboxEnforced,
            shell_executor: sandboxEnforced ? network.shellExecutor : undefined,
          },
    // issue #974 — provider traffic follows Electron/Chromium's system network
    // route while the sidecar and its raw children remain under the SRT wrap.
    provider_http: network.providerHttp,
  });

  try {
    // Main owns the loopback listener and transfers only accepted sockets over
    // the inherited IPC descriptor. The sidecar creates no network listener;
    // this keeps Linux's private netns reachable and lets macOS deny all raw
    // bind/connect operations.
    await host.start({ listen: false });
    daemonSockets = new AgentSidecarDaemonSockets(
      (request) => host.fetch(request),
      (error) => {
        console.error(
          `[agent-sidecar] daemon capability failed: ${error.message}`
        );
        process.exit(1);
      }
    );
    await announceDaemonCapabilityReady();
    await network.ready(daemonPort);
    console.log(
      `[agent-sidecar] serving transferred loopback sockets on host port ${daemonPort}`
    );
  } catch (err) {
    console.error("[agent-sidecar] server error:", err);
    process.exit(1);
  }

  const shutdown = (signal: string) => {
    console.log(`[agent-sidecar] shutdown (${signal})`);
    daemonSockets?.close();
    void host
      .stop()
      .catch((err) => {
        console.warn("[agent-sidecar] server close error:", err);
      })
      .finally(() => {
        process.exit(0);
      });
    setTimeout(() => process.exit(0), 1_000).unref();
  };
  network.onShutdown(() => shutdown("host-shutdown"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

void main().catch((err) => {
  console.error("[agent-sidecar] fatal:", err);
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
