/**
 * Agent sidecar entry point.
 *
 * Thin: argv parsing + AgentHost lifecycle + tidy shutdown. All HTTP
 * surface (files / secrets / agent / workspaces / shell)
 * lives in `@grida/agent/server`.
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
 * sidecar surface is HTTP, not IPC.
 *
 * Argv contract:
 *   process.argv[0]    runtime (electron in --as-node mode)
 *   process.argv[1]    this script
 *   stdin line         Basic-Auth password (per-launch, 256-bit base64url)
 *   process.argv[2+]   optional `--key=value` flags. Currently:
 *                        --user-data=<absolute path>
 *                          the agent home dir (`~/.grida/agent`, resolved
 *                          via `@grida/home`). We can't import that (or
 *                          `electron`) here, so the supervisor forwards it.
 *
 * Stdout contract:
 *   `PORT=<n>\n` once listening — supervisor parses this exact prefix.
 *
 * Trust boundary: `GRIDA-SEC-004`. Defense in depth at four levels:
 * preload path-scoping; CSP on the renderer; per-spawn Basic Auth
 * + Origin/Referer guards on the HTTP server; OS-level srt scope
 * on the process tree. The server binds 127.0.0.1 only.
 */
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { AgentHost } from "@grida/agent/server";

// Route Node's built-in `fetch` (undici) through whatever proxy is in
// `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY`. Without this, undici v6+
// ignores those env vars and dials direct — which is wrong for us
// because srt (the outer sandbox wrap in
// `main/agent-sidecar-supervisor.ts`) sets those env vars to point at its
// own in-process HTTP/SOCKS proxies on `localhost`, and the
// allowlist in `@grida/agent/server` lives at that proxy. Bypass
// the proxy and Seatbelt's outbound-DNS deny surfaces as a
// misleading `getaddrinfo ENOTFOUND <host>` from inside the AI SDK's
// retry loop, with no obvious connection to the sandbox.
//
// `EnvHttpProxyAgent` reads the env at construction time, so this
// must run before any top-level fetch — i.e. before any other
// import that might do work. Keep it directly under the imports.
setGlobalDispatcher(new EnvHttpProxyAgent());

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
const runtimeEditorBaseUrl = getCliArg("editor-base-url") ?? EDITOR_BASE_URL;
// GRIDA-SEC-004 — the supervisor tells us whether it wrapped this spawn with
// srt. Trusted: argv is set by the trusted main process, not the renderer.
// Default-off is fail-closed — a missing/`0` flag means the shell tool stays
// disabled, so a future supervisor bug that drops the flag can't silently
// expose an unsandboxed shell.
const sandboxEnforced = getCliArg("sandbox-enforced") === "1";

async function main() {
  const password = await readPasswordFromStdin();
  if (!password || password.length < 16) {
    console.error("[agent-sidecar] fatal: missing or short password on stdin");
    process.exit(1);
  }

  const editorOrigin = new URL(runtimeEditorBaseUrl).origin;
  const host = new AgentHost({
    password,
    user_data_path: requiredUserDataPath,
    http_access: {
      allowed_origins: [editorOrigin],
      allowed_referer_paths: ["/desktop"],
    },
    // GRIDA-SEC-004 — fail-closed shell: `run_command` is exposed only when
    // srt actually confines this process tree. On platforms srt can't wrap
    // (Windows), this is false and the agent gets fs/todos/skills but no shell.
    sandbox_enforced: sandboxEnforced,
  });

  try {
    await host.start();
    process.stdout.write(`PORT=${host.port}\n`);
    console.log(`[agent-sidecar] listening on 127.0.0.1:${host.port}`);
  } catch (err) {
    console.error("[agent-sidecar] server error:", err);
    process.exit(1);
  }

  const shutdown = (signal: string) => {
    console.log(`[agent-sidecar] shutdown (${signal})`);
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
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

function readPasswordFromStdin(): Promise<string> {
  process.stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("agent sidecar password read timed out"));
    }, 5_000);
    const cleanup = () => {
      clearTimeout(timeout);
      process.stdin.off("data", onData);
      process.stdin.off("end", onEnd);
      process.stdin.off("error", onError);
    };
    const finish = (value: string) => {
      cleanup();
      resolve(value.trim());
    };
    const onData = (chunk: string) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline >= 0) finish(buffer.slice(0, newline));
    };
    const onEnd = () => finish(buffer);
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    process.stdin.on("data", onData);
    process.stdin.on("end", onEnd);
    process.stdin.on("error", onError);
    process.stdin.resume();
  });
}

void main().catch((err) => {
  console.error("[agent-sidecar] fatal:", err);
  process.exit(1);
});
