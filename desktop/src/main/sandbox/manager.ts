/**
 * GRIDA-SEC-004 — supervisor-side `SandboxManager` lifecycle.
 *
 * srt exports `SandboxManager` as a process-global singleton; this
 * module wraps its lifetime so the supervisor doesn't import the
 * raw API directly. Responsibilities:
 *
 *   1. `ensureInitialized(config)` — calls `SandboxManager.initialize`
 *      once. Subsequent calls are no-ops because srt's proxies are
 *      already running. If the policy needs to change (workspace
 *      added/removed in a future iteration), call `updateConfig`.
 *   2. `wrap(cmd)` — `SandboxManager.wrapWithSandbox(cmd)`. Returns
 *      the wrapped shell-string the supervisor `spawn`s with
 *      `shell: true`.
 *   3. `dispose()` — `SandboxManager.reset()` on `before-quit` so
 *      the proxy servers and any mtimes get cleaned up.
 *   4. macOS violation pump — taps `SandboxViolationStore` and
 *      forwards events to `console.error` with an `[agent-sidecar:srt]`
 *      prefix. On Linux the store is empty (no system-log tap);
 *      violations only surface via the child's `EPERM`-induced
 *      crash + restart-loop stderr, as documented in
 *      `docs/wg/desktop/agent-sandbox-wrap.md`.
 *
 * Why a wrapper and not direct calls in the supervisor: tests can
 * stub this surface while the policy intent lives in `@grida/daemon` (+ the AI hosts in `@grida/agent/sandbox`).
 */
import {
  SandboxManager,
  type SandboxRuntimeConfig,
  type SandboxViolationEvent,
} from "@anthropic-ai/sandbox-runtime";

let initialized = false;
let violationListenerAttached = false;
let violationUnsubscribe: (() => void) | null = null;

/**
 * Initialize srt's proxies on first call; update the config on
 * subsequent calls. Idempotent in terms of the proxy infrastructure
 * — `initialize` is only called once.
 */
export async function ensureInitialized(
  config: SandboxRuntimeConfig
): Promise<void> {
  if (!initialized) {
    // `enableLogMonitor: true` turns on macOS's system-log tap so
    // `SandboxViolationStore` gets populated. Linux is a no-op.
    await SandboxManager.initialize(config, undefined, true);
    initialized = true;
    attachViolationListener();
    return;
  }
  SandboxManager.updateConfig(config);
}

/**
 * Hand a command to srt and get back the sandbox-wrapped shell
 * string. The supervisor `spawn`s the returned string with
 * `shell: true`. The wrapped command runs under Seatbelt (macOS)
 * or bubblewrap (Linux); any process it spawns inherits the same
 * profile.
 */
export async function wrap(command: string): Promise<string> {
  if (!initialized) {
    // Caller bug — refuse rather than running the command unwrapped.
    throw new Error(
      "[agent-sidecar:srt] wrap() called before ensureInitialized() - refusing to run an unwrapped command"
    );
  }
  return await SandboxManager.wrapWithSandbox(command);
}

/**
 * `before-quit` cleanup. Tears down srt's proxy servers; safe to
 * call even if `ensureInitialized` was never called (no-ops).
 */
export async function dispose(): Promise<void> {
  if (!initialized) return;
  try {
    await SandboxManager.reset();
  } catch (err) {
    console.warn(
      `[agent-sidecar:srt] reset() failed: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
  if (violationUnsubscribe) {
    // Detach the violation listener so a later ensureInitialized() doesn't
    // stack a second subscription (which would re-log already-reported
    // violations through the stale closure and leak the old listener).
    try {
      violationUnsubscribe();
    } catch {
      // never let teardown of a logging listener break dispose()
    }
    violationUnsubscribe = null;
  }
  initialized = false;
  violationListenerAttached = false;
}

/**
 * Whether the host platform is supported by srt. On Windows this
 * returns false; callers should fall back to running the agent sidecar
 * unwrapped (with a documented warning) until the Windows backend
 * lands upstream.
 */
export function isSupportedPlatform(): boolean {
  return SandboxManager.isSupportedPlatform();
}

/**
 * Check that the host has the runtime tools srt needs (bubblewrap,
 * socat, ripgrep on Linux; nothing on macOS). Surface to the
 * supervisor so it can log a meaningful error before initialize()
 * would fail.
 */
export function checkDependencies() {
  return SandboxManager.checkDependencies();
}

/**
 * Subscribe to violation events on macOS. Each violation is logged
 * to `console.error` with enough structure for a developer to find
 * the offending path/host without leaking secrets. Linux has no
 * userland tap — see the file header.
 *
 * srt's `subscribe` callback receives the entire current violation
 * array (not just the new ones). We track the previous length so
 * we only log the newly-arrived events.
 */
function attachViolationListener(): void {
  if (violationListenerAttached) return;
  const store = SandboxManager.getSandboxViolationStore();
  let reportedCount = 0;
  violationUnsubscribe = store.subscribe(
    (violations: SandboxViolationEvent[]) => {
      if (violations.length <= reportedCount) return;
      for (let i = reportedCount; i < violations.length; i++) {
        reportViolation(violations[i]);
      }
      reportedCount = violations.length;
    }
  );
  violationListenerAttached = true;
}

function reportViolation(event: SandboxViolationEvent): void {
  // Keep the line one-shot + structured so it's grep-friendly. The
  // `line` field is srt's raw extracted kernel log entry, which
  // already contains everything useful (path, syscall, command).
  const payload = {
    command: event.command,
    line: event.line,
    timestamp:
      event.timestamp instanceof Date
        ? event.timestamp.toISOString()
        : String(event.timestamp),
  };
  try {
    console.error(`[agent-sidecar:srt:violation] ${JSON.stringify(payload)}`);
  } catch {
    console.error(
      `[agent-sidecar:srt:violation] ${event.line ?? "(no detail)"}`
    );
  }
}
