/**
 * Contract pins for the `Daemon` discovery primitive (WG spec:
 * docs/wg/ai/agent/daemon.md; issue #798).
 *
 *   - fs round-trips against a REAL tmpdir: atomic publish, owner-only
 *     modes, validation-refusing reads, owned-only unpublish.
 *   - probe/connect/connectOrSpawn against an injectable fetch/sleep —
 *     the convergence logic without sockets or timers.
 *   - one integration block against a REAL AgentHost socket: the
 *     authenticated probe through the production perimeter.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Daemon } from "./daemon";
import { AgentHost } from "./agent-host";
import { AgentTransport } from "./transport";
import { AGENT_SERVER_PROTOCOL } from "./protocol/handshake";

let stateDir: string;

beforeEach(async () => {
  stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-agent-daemon-"));
});

afterEach(async () => {
  await fs.rm(stateDir, { recursive: true, force: true });
});

const REG: Daemon.Registration = {
  id: "claim-1",
  version: "0.0.0",
  url: "http://127.0.0.1:43210",
  pid: 4242,
};

function handshakeResponse(protocol: number = AGENT_SERVER_PROTOCOL): Response {
  return new Response(
    JSON.stringify({ protocol, supports: [], capabilities: {} }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

describe("Daemon registration fs round-trip", () => {
  it("publishes and reads back the record", async () => {
    await Daemon.publish(stateDir, REG);
    expect(await Daemon.read(stateDir)).toEqual(REG);
  });

  it("writes the registration owner-only (0600)", async () => {
    await Daemon.publish(stateDir, REG);
    const stat = await fs.stat(Daemon.paths(stateDir).registration);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it("leaves no temp file behind (atomic publish)", async () => {
    await Daemon.publish(stateDir, REG);
    const entries = await fs.readdir(stateDir);
    expect(entries).toEqual([Daemon.REGISTRATION_FILENAME]);
  });

  it("creates the state directory on demand", async () => {
    const nested = path.join(stateDir, "deep", "agent");
    await Daemon.publish(nested, REG);
    expect(await Daemon.read(nested)).toEqual(REG);
  });

  it("last writer wins on publish", async () => {
    await Daemon.publish(stateDir, REG);
    const successor = { ...REG, id: "claim-2", pid: 4343 };
    await Daemon.publish(stateDir, successor);
    expect(await Daemon.read(stateDir)).toEqual(successor);
  });

  it("reads null when absent", async () => {
    expect(await Daemon.read(stateDir)).toBeNull();
  });

  it("reads null on malformed JSON", async () => {
    await fs.writeFile(Daemon.paths(stateDir).registration, "{not json");
    expect(await Daemon.read(stateDir)).toBeNull();
  });

  it("reads null on a structurally invalid record", async () => {
    await fs.writeFile(
      Daemon.paths(stateDir).registration,
      JSON.stringify({ id: "x", version: "0", url: REG.url, pid: -1 })
    );
    expect(await Daemon.read(stateDir)).toBeNull();
  });

  it("refuses a non-loopback registration URL", async () => {
    await fs.writeFile(
      Daemon.paths(stateDir).registration,
      JSON.stringify({ ...REG, url: "http://evil.example:80" })
    );
    expect(await Daemon.read(stateDir)).toBeNull();
  });

  it("mintRegistration mints a fresh claim id per call", () => {
    const facts = { version: "0.0.0", url: REG.url, pid: 1 };
    const a = Daemon.mintRegistration(facts);
    const b = Daemon.mintRegistration(facts);
    expect(a.id).not.toBe(b.id);
    expect(a).toMatchObject(facts);
  });
});

describe("Daemon unpublish + ownership", () => {
  it("unpublishes when owned", async () => {
    await Daemon.publish(stateDir, REG);
    expect(await Daemon.unpublish(stateDir, REG.id)).toBe(true);
    expect(await Daemon.read(stateDir)).toBeNull();
  });

  it("never deletes a successor's record", async () => {
    const successor = { ...REG, id: "claim-2" };
    await Daemon.publish(stateDir, successor);
    expect(await Daemon.unpublish(stateDir, REG.id)).toBe(false);
    expect(await Daemon.read(stateDir)).toEqual(successor);
  });

  it("unpublish on a missing record is a no-op", async () => {
    expect(await Daemon.unpublish(stateDir, REG.id)).toBe(false);
  });

  it("checkOwnership distinguishes owned / replaced / missing", async () => {
    expect(await Daemon.checkOwnership(stateDir, REG.id)).toBe("missing");
    await Daemon.publish(stateDir, REG);
    expect(await Daemon.checkOwnership(stateDir, REG.id)).toBe("owned");
    await Daemon.publish(stateDir, { ...REG, id: "claim-2" });
    expect(await Daemon.checkOwnership(stateDir, REG.id)).toBe("replaced");
  });
});

describe("Daemon credential", () => {
  it("creates a high-entropy credential on first read", async () => {
    const credential = await Daemon.readOrCreateCredential(stateDir);
    // 32 random bytes base64url-encoded, no padding.
    expect(credential).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("persists across calls (same credential back)", async () => {
    const first = await Daemon.readOrCreateCredential(stateDir);
    const second = await Daemon.readOrCreateCredential(stateDir);
    expect(second).toBe(first);
  });

  it("writes the credential owner-only (0600)", async () => {
    await Daemon.readOrCreateCredential(stateDir);
    const stat = await fs.stat(Daemon.paths(stateDir).credential);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it("readCredential is null when absent", async () => {
    expect(await Daemon.readCredential(stateDir)).toBeNull();
  });
});

describe("Daemon.probe", () => {
  it("accepts a matching-protocol handshake and sends auth + referer", async () => {
    const calls: Array<[string, RequestInit]> = [];
    const fetchSpy = (async (input: unknown, init?: RequestInit) => {
      calls.push([String(input), init ?? {}]);
      return handshakeResponse();
    }) as typeof fetch;
    const result = await Daemon.probe(REG, "secret", { fetch: fetchSpy });
    expect(result.ok).toBe(true);
    const [url, init] = calls[0];
    expect(url).toBe(`${REG.url}/handshake`);
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe(
      AgentTransport.buildBasicAuthHeader("secret")
    );
    expect(headers.referer).toBe(
      `${Daemon.LOCAL_CLIENT_ORIGIN}${Daemon.LOCAL_CLIENT_REFERER_PATH}`
    );
  });

  it("reports unauthorized on 401", async () => {
    const result = await Daemon.probe(REG, "wrong", {
      fetch: async () => new Response(null, { status: 401 }),
    });
    expect(result).toEqual({ ok: false, reason: "unauthorized" });
  });

  it("gates on the wire protocol, not the version string", async () => {
    const result = await Daemon.probe(REG, "secret", {
      fetch: async () => handshakeResponse(AGENT_SERVER_PROTOCOL + 1),
    });
    expect(result).toEqual({ ok: false, reason: "protocol-mismatch" });
  });

  it("reports malformed on a non-JSON body", async () => {
    const result = await Daemon.probe(REG, "secret", {
      fetch: async () => new Response("not json", { status: 200 }),
    });
    expect(result).toEqual({ ok: false, reason: "malformed" });
  });

  it("reports unreachable when fetch rejects", async () => {
    const result = await Daemon.probe(REG, "secret", {
      fetch: async () => {
        throw new TypeError("ECONNREFUSED");
      },
    });
    expect(result).toEqual({ ok: false, reason: "unreachable" });
  });

  it("bounds a hung socket with the timeout", async () => {
    const hang: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError"))
        );
      });
    const result = await Daemon.probe(REG, "secret", {
      fetch: hang,
      timeout_ms: 10,
    });
    expect(result).toEqual({ ok: false, reason: "unreachable" });
  });
});

describe("Daemon.connect", () => {
  it("returns a connection for a healthy registered daemon", async () => {
    await Daemon.publish(stateDir, REG);
    const credential = await Daemon.readOrCreateCredential(stateDir);
    const connection = await Daemon.connect(stateDir, {
      fetch: async () => handshakeResponse(),
    });
    expect(connection).not.toBeNull();
    expect(connection!.url).toBe(REG.url);
    expect(connection!.credential).toBe(credential);
    expect(connection!.handshake.protocol).toBe(AGENT_SERVER_PROTOCOL);
  });

  it("is null when no registration exists", async () => {
    expect(
      await Daemon.connect(stateDir, { fetch: async () => handshakeResponse() })
    ).toBeNull();
  });

  it("is null when the credential is missing", async () => {
    await Daemon.publish(stateDir, REG);
    expect(
      await Daemon.connect(stateDir, { fetch: async () => handshakeResponse() })
    ).toBeNull();
  });

  it("is null when the probe fails (stale registration)", async () => {
    await Daemon.publish(stateDir, REG);
    await Daemon.readOrCreateCredential(stateDir);
    expect(
      await Daemon.connect(stateDir, {
        fetch: async () => {
          throw new TypeError("ECONNREFUSED");
        },
      })
    ).toBeNull();
  });
});

describe("Daemon.connectOrSpawn", () => {
  it("reuses a healthy daemon without spawning", async () => {
    await Daemon.publish(stateDir, REG);
    await Daemon.readOrCreateCredential(stateDir);
    let spawns = 0;
    const connection = await Daemon.connectOrSpawn(stateDir, {
      spawn: () => {
        spawns += 1;
      },
      fetch: async () => handshakeResponse(),
    });
    expect(connection.url).toBe(REG.url);
    expect(spawns).toBe(0);
  });

  it("spawns, then converges once the daemon publishes", async () => {
    // The fake daemon: publishing happens on the second poll tick.
    let ticks = 0;
    let spawns = 0;
    const connection = await Daemon.connectOrSpawn(stateDir, {
      spawn: () => {
        spawns += 1;
      },
      fetch: async () => handshakeResponse(),
      poll_interval_ms: 1,
      sleep: async () => {
        ticks += 1;
        if (ticks === 2) {
          await Daemon.publish(stateDir, REG);
          await Daemon.readOrCreateCredential(stateDir);
        }
      },
    });
    expect(spawns).toBe(1);
    expect(connection.registration.id).toBe(REG.id);
    expect(ticks).toBe(2);
  });

  it("throws after the attempt budget when the daemon never appears", async () => {
    let sleeps = 0;
    await expect(
      Daemon.connectOrSpawn(stateDir, {
        spawn: () => {},
        fetch: async () => handshakeResponse(),
        poll_interval_ms: 1,
        poll_attempts: 3,
        sleep: async () => {
          sleeps += 1;
        },
      })
    ).rejects.toThrow(/did not become reachable/);
    expect(sleeps).toBe(3);
  });
});

describe("Daemon probe against a real AgentHost", () => {
  let host: AgentHost;
  let userData: string;

  beforeEach(async () => {
    userData = await fs.mkdtemp(path.join(os.tmpdir(), "grida-agent-host-"));
  });

  afterEach(async () => {
    await host?.stop();
    await fs.rm(userData, { recursive: true, force: true });
  });

  it("connects through the production perimeter end-to-end", async () => {
    const credential = await Daemon.readOrCreateCredential(stateDir);
    host = new AgentHost({
      password: credential,
      user_data_path: userData,
      http_access: {
        allowed_origins: [Daemon.LOCAL_CLIENT_ORIGIN],
        allowed_referer_paths: [Daemon.LOCAL_CLIENT_REFERER_PATH],
      },
    });
    await host.start();
    await Daemon.publish(
      stateDir,
      Daemon.mintRegistration({
        version: "0.0.0",
        url: AgentTransport.baseUrl(host.port),
        pid: process.pid,
      })
    );

    const connection = await Daemon.connect(stateDir);
    expect(connection).not.toBeNull();
    expect(connection!.handshake.protocol).toBe(AGENT_SERVER_PROTOCOL);

    // The connection facts are sufficient to build a working transport.
    const client = new AgentTransport.Client({
      base_url: connection!.url,
      password: connection!.credential,
      origin: Daemon.LOCAL_CLIENT_ORIGIN,
      referer: `${Daemon.LOCAL_CLIENT_ORIGIN}${Daemon.LOCAL_CLIENT_REFERER_PATH}`,
    });
    const handshake = await client.handshake();
    expect(handshake.protocol).toBe(AGENT_SERVER_PROTOCOL);
  });

  it("fails the probe at identity when the credential is wrong", async () => {
    host = new AgentHost({
      password: "the-real-secret",
      user_data_path: userData,
      http_access: {
        allowed_origins: [Daemon.LOCAL_CLIENT_ORIGIN],
        allowed_referer_paths: [Daemon.LOCAL_CLIENT_REFERER_PATH],
      },
    });
    await host.start();
    const result = await Daemon.probe(
      { url: AgentTransport.baseUrl(host.port) },
      "an-imposter-credential"
    );
    expect(result).toEqual({ ok: false, reason: "unauthorized" });
  });
});
