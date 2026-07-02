/**
 * Daemon — the discovery contract that turns an `DaemonServer` into a
 * long-lived, discoverable local process (WG spec:
 * docs/wg/ai/agent/daemon.md; issue #798).
 *
 * This module owns the on-disk facts only:
 *
 *   - the registration record (`daemon.json`) — where a live daemon
 *     listens and which launch claims it,
 *   - the persistent credential (`daemon.credential`) — the secret every
 *     local-process client presents,
 *   - the authenticated probe — one `/handshake` round-trip proving
 *     liveness, credential identity, and wire-protocol compatibility,
 *   - connect-or-spawn — the client-side convergence algorithm.
 *
 * It deliberately does NOT own policy: whether to spawn, when to stand
 * down, which origins a daemon allowlists — those are caller decisions
 * (the CLI's `serve --register`, a desktop supervisor, an ACP adapter).
 * Filesystem layout is the only shared fact, so it lives in exactly one
 * place: here.
 *
 * Everything I/O-shaped is injectable (`fetch`, `sleep`) so the
 * convergence logic is unit-testable without sockets or timers; the fs
 * functions are simple enough to test against a real tmpdir.
 *
 * GRIDA-SEC-004 — both files are written owner-only (0600) and atomically
 * (temp + rename): a concurrent reader can never observe a partial
 * record, and no other OS user can read the credential. The probe is
 * authenticated — there is no unauthenticated health route; a foreign
 * process squatting a reused port fails the probe at identity, not just
 * at liveness. `read` additionally refuses non-loopback registration
 * URLs so a tampered record cannot redirect a credential-bearing client
 * off-machine.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { atomicWrite } from "./storage/atomic-write";
import { DaemonTransport } from "./transport";
import {
  DAEMON_PROTOCOL,
  type DaemonHandshakeResponse,
} from "./protocol/handshake";

export namespace Daemon {
  /** Registration record filename inside the state directory. */
  export const REGISTRATION_FILENAME = "daemon.json";
  /** Persistent credential filename inside the state directory. */
  export const CREDENTIAL_FILENAME = "daemon.credential";

  /**
   * The canonical origin + referer root a registered daemon MUST
   * allowlist so that any local-process client (CLI, ACP adapter,
   * supervisor probe) can clear the perimeter. Browser clients have
   * their own origins — see the WG spec's browser exception.
   */
  export const LOCAL_CLIENT_ORIGIN = "http://127.0.0.1";
  export const LOCAL_CLIENT_REFERER_PATH = "/cli";

  export const DEFAULT_PROBE_TIMEOUT_MS = 2_000;
  export const DEFAULT_SPAWN_POLL_INTERVAL_MS = 50;
  export const DEFAULT_SPAWN_POLL_ATTEMPTS = 100;
  /** How often a registered daemon SHOULD re-assert ownership. */
  export const OWNERSHIP_INTERVAL_MS = 10_000;

  /** The on-disk registration record. See WG spec §discovery-contract. */
  export type Registration = {
    /** Random per-launch claim token — the ownership fact. */
    id: string;
    /** Implementation version, informational. NOT the compat gate. */
    version: string;
    /** Loopback base URL the daemon listens on. */
    url: string;
    /** Daemon OS pid. Diagnostics only; liveness is the probe's job. */
    pid: number;
  };

  export type Paths = { registration: string; credential: string };

  export function paths(state_dir: string): Paths {
    return {
      registration: path.join(state_dir, REGISTRATION_FILENAME),
      credential: path.join(state_dir, CREDENTIAL_FILENAME),
    };
  }

  /** Mint a registration with a fresh claim token. */
  export function mintRegistration(facts: {
    version: string;
    url: string;
    pid: number;
  }): Registration {
    return { id: crypto.randomUUID(), ...facts };
  }

  /**
   * Atomically publish `registration`, unconditionally overwriting any
   * existing record (last writer wins — see WG spec §convergence).
   */
  export async function publish(
    state_dir: string,
    registration: Registration
  ): Promise<void> {
    const file = paths(state_dir).registration;
    await atomicWrite(file, JSON.stringify(registration));
  }

  /**
   * Read and validate the registration. `null` when absent, malformed,
   * or pointing at a non-loopback URL — callers treat all three as
   * "no daemon registered".
   */
  export async function read(state_dir: string): Promise<Registration | null> {
    let raw: string;
    try {
      raw = await fs.readFile(paths(state_dir).registration, "utf8");
    } catch {
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    if (typeof parsed !== "object" || parsed === null) return null;
    const rec = parsed as Partial<Registration>;
    if (
      typeof rec.id !== "string" ||
      rec.id.length === 0 ||
      typeof rec.version !== "string" ||
      typeof rec.url !== "string" ||
      typeof rec.pid !== "number" ||
      !Number.isInteger(rec.pid) ||
      rec.pid <= 0 ||
      !isLoopbackHttpUrl(rec.url)
    ) {
      return null;
    }
    return {
      id: rec.id,
      version: rec.version,
      url: rec.url.replace(/\/$/, ""),
      pid: rec.pid,
    };
  }

  /**
   * Remove the registration iff `id` still owns it. Returns whether the
   * record was removed. Never deletes a successor's record.
   *
   * A read-then-rm here would be a TOCTOU hole: a successor can publish
   * between the read and the rm, and the rm would destroy the new
   * record (whose owner's next ownership tick would then see `missing`
   * and stand down). Instead the CURRENT record is atomically claimed
   * via rename, inspected, and either discarded (ours) or renamed back
   * untouched (anyone else's — including malformed content, which is
   * not ours to delete either). The claim window shows a concurrent
   * reader a missing record for microseconds; the convergence ticks
   * run on a 10s interval, so that blip is harmless.
   */
  export async function unpublish(
    state_dir: string,
    id: string
  ): Promise<boolean> {
    const file = paths(state_dir).registration;
    const claim = `${file}.${id}.unpublish`;
    try {
      await fs.rename(file, claim);
    } catch {
      return false; // nothing registered
    }
    let owned = false;
    try {
      const parsed = JSON.parse(await fs.readFile(claim, "utf8")) as {
        id?: unknown;
      };
      owned = parsed?.id === id;
    } catch {
      owned = false;
    }
    if (owned) {
      await fs.rm(claim, { force: true });
      return true;
    }
    try {
      await fs.rename(claim, file);
    } catch {
      // Restore failed (e.g. the dir vanished) — the claim file is
      // ignored by `read`, so leaving it is strictly less destructive
      // than deleting a record that is not ours.
    }
    return false;
  }

  export type OwnershipStatus = "owned" | "replaced" | "missing";

  /**
   * The re-assertion check a registered daemon runs on an interval: a
   * `replaced` or `missing` result means stand down (a newer claimant
   * won, or an operator unregistered us).
   */
  export async function checkOwnership(
    state_dir: string,
    id: string
  ): Promise<OwnershipStatus> {
    const current = await read(state_dir);
    if (!current) return "missing";
    return current.id === id ? "owned" : "replaced";
  }

  /** Read the persistent credential; `null` when absent or empty. */
  export async function readCredential(
    state_dir: string
  ): Promise<string | null> {
    try {
      const raw = await fs.readFile(paths(state_dir).credential, "utf8");
      const trimmed = raw.trim();
      return trimmed.length > 0 ? trimmed : null;
    } catch {
      return null;
    }
  }

  /**
   * Read the persistent credential, generating it on first use.
   * High-entropy (32 random bytes, base64url), owner-only, atomic.
   */
  export async function readOrCreateCredential(
    state_dir: string
  ): Promise<string> {
    const existing = await readCredential(state_dir);
    if (existing) return existing;
    const generated = crypto.randomBytes(32).toString("base64url");
    await atomicWrite(paths(state_dir).credential, generated);
    return generated;
  }

  export type ProbeOptions = {
    /** Injectable fetch (tests). Defaults to global `fetch`. */
    fetch?: typeof fetch;
    timeout_ms?: number;
    /** Expected wire protocol. Defaults to `DAEMON_PROTOCOL`. */
    protocol?: number;
  };

  export type ProbeResult =
    | { ok: true; handshake: DaemonHandshakeResponse }
    | {
        ok: false;
        reason:
          | "unreachable"
          | "unauthorized"
          | "protocol-mismatch"
          | "malformed";
      };

  /**
   * One authenticated `/handshake` round-trip against a registration.
   * Proves liveness + credential identity + protocol compatibility —
   * see WG spec §probe-and-protocol-gate.
   */
  export async function probe(
    registration: Pick<Registration, "url">,
    credential: string,
    options: ProbeOptions = {}
  ): Promise<ProbeResult> {
    const fetchImpl = options.fetch ?? fetch;
    const timeout = options.timeout_ms ?? DEFAULT_PROBE_TIMEOUT_MS;
    const expected = options.protocol ?? DAEMON_PROTOCOL;
    let res: Response;
    try {
      res = await fetchImpl(`${registration.url}/handshake`, {
        method: "POST",
        headers: {
          authorization: DaemonTransport.buildBasicAuthHeader(credential),
          origin: LOCAL_CLIENT_ORIGIN,
          referer: `${LOCAL_CLIENT_ORIGIN}${LOCAL_CLIENT_REFERER_PATH}`,
        },
        signal: AbortSignal.timeout(timeout),
      });
    } catch {
      return { ok: false, reason: "unreachable" };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: "unauthorized" };
    }
    if (!res.ok) return { ok: false, reason: "malformed" };
    let handshake: DaemonHandshakeResponse;
    try {
      handshake = (await res.json()) as DaemonHandshakeResponse;
    } catch {
      return { ok: false, reason: "malformed" };
    }
    if (typeof handshake?.protocol !== "number") {
      return { ok: false, reason: "malformed" };
    }
    if (handshake.protocol !== expected) {
      return { ok: false, reason: "protocol-mismatch" };
    }
    return { ok: true, handshake };
  }

  /** A proven connection: everything a client needs to build a transport. */
  export type Connection = {
    registration: Registration;
    credential: string;
    url: string;
    handshake: DaemonHandshakeResponse;
  };

  /**
   * Read → probe → connect. `null` when no healthy, compatible,
   * credential-holding daemon is registered (absent record, absent
   * credential, or failed probe all collapse to "not connectable").
   */
  export async function connect(
    state_dir: string,
    options: ProbeOptions = {}
  ): Promise<Connection | null> {
    const registration = await read(state_dir);
    if (!registration) return null;
    const credential = await readCredential(state_dir);
    if (!credential) return null;
    const result = await probe(registration, credential, options);
    if (!result.ok) return null;
    return {
      registration,
      credential,
      url: registration.url,
      handshake: result.handshake,
    };
  }

  export type ConnectOrSpawnOptions = ProbeOptions & {
    /**
     * Start a daemon process, detached from the caller, that publishes
     * its registration on start (e.g. `grida-agent serve --register`).
     * Called at most once.
     */
    spawn: () => void | Promise<void>;
    poll_interval_ms?: number;
    poll_attempts?: number;
    /** Injectable sleep (tests). Defaults to a real timer. */
    sleep?: (ms: number) => Promise<void>;
  };

  /**
   * The convergence algorithm (WG spec §connect-or-spawn): connect to a
   * registered daemon, or spawn one and poll until it publishes and
   * passes the probe. Attempt-bounded, clock-free. Throws when the
   * spawned daemon never becomes reachable.
   */
  export async function connectOrSpawn(
    state_dir: string,
    options: ConnectOrSpawnOptions
  ): Promise<Connection> {
    const existing = await connect(state_dir, options);
    if (existing) return existing;
    const interval = options.poll_interval_ms ?? DEFAULT_SPAWN_POLL_INTERVAL_MS;
    const attempts = options.poll_attempts ?? DEFAULT_SPAWN_POLL_ATTEMPTS;
    const sleep = options.sleep ?? defaultSleep;
    await options.spawn();
    for (let i = 0; i < attempts; i += 1) {
      await sleep(interval);
      const connection = await connect(state_dir, options);
      if (connection) return connection;
    }
    throw new Error(
      `[grida-agent] daemon did not become reachable within ` +
        `${attempts} x ${interval}ms after spawn`
    );
  }

  // ── internals ──────────────────────────────────────────────────────

  function isLoopbackHttpUrl(value: string): boolean {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return false;
    }
    if (url.protocol !== "http:") return false;
    return (
      url.hostname === "127.0.0.1" ||
      url.hostname === "localhost" ||
      url.hostname === "[::1]" ||
      url.hostname === "::1"
    );
  }

  function defaultSleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
