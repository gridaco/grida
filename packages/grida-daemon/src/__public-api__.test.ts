/**
 * Public-API guard test. Pins the shape and presence of every symbol the
 * root plus server, sandbox, and transport subpaths export.
 *
 * This is intentionally separate from the behavioural tests — those
 * exercise behaviour; this one exercises the **contract**. A rename,
 * signature change, or accidental drop here = a breaking change for
 * consumers (`@grida/agent` the tenant, the desktop sidecar/preload,
 * `@grida/desktop-bridge`) — the test should fail until the README /
 * CHANGELOG has been updated to advertise it.
 */
import { describe, expect, expectTypeOf, it } from "vitest";

import * as root from ".";
import {
  DAEMON_DEFAULT_CAPABILITIES,
  DAEMON_PROTOCOL,
  type DaemonCapabilities,
  type DaemonHandshakeResponse,
} from ".";
import type {
  FileReadResult,
  RecentEntry,
  Workspace,
  WorkspaceCreateInput,
  WorkspaceFsEntry,
} from ".";
import {
  buildServer,
  containsPath,
  Daemon,
  DaemonServer,
  SecretsStore,
  WorkspaceRegistry,
  workspaceFs,
  type BuiltServer,
  type DaemonHttpAccess,
  type DaemonServerOptions,
  type DaemonServices,
  type DaemonTenant,
  type DaemonTenantHandle,
} from "./server";
import {
  buildDaemonSandboxPolicy,
  hostFromUrl,
  type DaemonSandboxPolicy,
} from "./sandbox";
import { DaemonTransport } from "./transport";

describe("@grida/daemon public API", () => {
  describe("root protocol exports", () => {
    it("exposes the handshake vocabulary", () => {
      const caps: DaemonCapabilities = DAEMON_DEFAULT_CAPABILITIES;
      const handshake: DaemonHandshakeResponse = {
        protocol: DAEMON_PROTOCOL,
        supports: ["files@1"],
        capabilities: caps,
      };
      expect(DAEMON_PROTOCOL).toBe(1);
      // The daemon's OWN defaults: host groups on, tenant groups off.
      expect(caps.files).toBe(true);
      expect(caps.recent).toBe(true);
      expect(caps.workspaces).toBe(true);
      expect(caps.agent).toBe(false);
      expect(caps.sessions).toBe(false);
      expect(caps.secrets).toBe(false);
      expect(handshake.protocol).toBe(1);
    });

    it("exposes the local-resource DTOs", () => {
      type _FR = FileReadResult;
      type _RE = RecentEntry;
      type _W = Workspace;
      type _WCI = WorkspaceCreateInput;
      type _WE = WorkspaceFsEntry;
      const entry: WorkspaceFsEntry = {
        name: "x",
        rel_path: "x",
        kind: "file",
      };
      expect(entry.name).toBe("x");
    });
  });

  describe("server subpath", () => {
    it("exposes DaemonServer and the tenant seam (#927)", () => {
      const httpAccess: DaemonHttpAccess = {
        allowed_origins: ["https://client.example"],
        allowed_referer_paths: ["/client"],
      };
      const opts: DaemonServerOptions = {
        password: "pw",
        user_data_path: "/tmp/grida",
        http_access: httpAccess,
      };
      expectTypeOf(DaemonServer).toBeConstructibleWith(opts);
      const start: (options?: { listen?: boolean }) => Promise<void> =
        DaemonServer.prototype.start;
      const fetch: (request: Request) => Promise<Response> =
        DaemonServer.prototype.fetch;
      expect(typeof start).toBe("function");
      expect(typeof fetch).toBe("function");
      expect(typeof buildServer).toBe("function");

      // The seam contract: a tenant registers routes against the daemon's
      // services and reports capabilities/drain/cleanup back.
      const tenant: DaemonTenant = {
        register: (_app, services: DaemonServices) => {
          const handle: DaemonTenantHandle = {
            capabilities: { sessions: true },
            drain: () => void services,
            cleanup: () => {},
          };
          return handle;
        },
      };
      expect(typeof tenant.register).toBe("function");
      type _B = BuiltServer;
    });

    it("exposes the Daemon discovery contract (WG daemon.md, #798)", () => {
      expect(Daemon.REGISTRATION_FILENAME).toBe("daemon.json");
      expect(Daemon.CREDENTIAL_FILENAME).toBe("daemon.credential");
      expect(Daemon.LOCAL_CLIENT_ORIGIN).toBe("http://127.0.0.1");
      const p: Daemon.Paths = Daemon.paths("/tmp/state");
      expect(p.registration.endsWith("daemon.json")).toBe(true);
      const reg: Daemon.Registration = Daemon.mintRegistration({
        version: "0.0.0",
        url: "http://127.0.0.1:1",
        pid: 1,
      });
      expect(reg.id.length).toBeGreaterThan(0);
      expect(typeof Daemon.publish).toBe("function");
      expect(typeof Daemon.read).toBe("function");
      expect(typeof Daemon.unpublish).toBe("function");
      expect(typeof Daemon.checkOwnership).toBe("function");
      expect(typeof Daemon.readCredential).toBe("function");
      expect(typeof Daemon.readOrCreateCredential).toBe("function");
      expect(typeof Daemon.probe).toBe("function");
      expect(typeof Daemon.connect).toBe("function");
      expect(typeof Daemon.connectOrSpawn).toBe("function");
    });

    it("exposes the tenant toolkit", () => {
      expect(typeof WorkspaceRegistry).toBe("function");
      expect(typeof SecretsStore).toBe("function");
      expect(typeof workspaceFs.readDir).toBe("function");
      expect(typeof workspaceFs.iterateDir).toBe("function");
      expect(containsPath("/a", "/a/b")).toBe(true);
    });
  });

  describe("sandbox subpath", () => {
    it("exposes the AI-free policy frame with tenant host injection", () => {
      expect(hostFromUrl("https://example.com/path")).toBe("example.com");
      const policy: DaemonSandboxPolicy = buildDaemonSandboxPolicy({
        user_data: "/tmp/grida",
        home: "/Users/example",
        allowed_network_hosts: ["tenant.example"],
      });
      // Baseline dev-network hosts + the injected tenant hosts.
      expect(policy.network.allowed_domains).toContain("registry.npmjs.org");
      expect(policy.network.allowed_domains).toContain("github.com");
      expect(policy.network.allowed_domains).toContain("tenant.example");
      expect(policy.filesystem.deny_read.some((p) => p.includes(".ssh"))).toBe(
        true
      );
      // Boundary (#927): the daemon frame knows NO AI vendor — those hosts
      // are the agent tenant's contribution (`@grida/agent/sandbox`).
      expect(policy.network.allowed_domains).not.toContain("openrouter.ai");
      expect(policy.network.allowed_domains).not.toContain("api.anthropic.com");
    });

    // GRIDA-SEC-004 — the public policy can remove both direct external and
    // local-bind authority without reaching into producer internals.
    it("exposes a tenant-only network policy without changing the default", () => {
      const policy: DaemonSandboxPolicy = buildDaemonSandboxPolicy({
        user_data: "/tmp/grida",
        home: "/Users/example",
        allow_local_binding: false,
        include_dev_network_hosts: false,
        allowed_network_hosts: ["tenant.example"],
      });
      expect(policy.network.allowed_domains).toEqual(["tenant.example"]);
      expect(policy.network.allow_local_binding).toBe(false);
    });
  });

  describe("transport subpath", () => {
    it("exposes the daemon client + seam primitives", async () => {
      expect(DaemonTransport.USERNAME).toBe("agent");
      expect(DaemonTransport.baseUrl(49152)).toBe("http://127.0.0.1:49152");
      expect(DaemonTransport.buildBasicAuthHeader("pw")).toBe(
        "Basic YWdlbnQ6cHc="
      );
      // The auth_token SSE query value is the SAME credential payload.
      expect(DaemonTransport.buildAuthToken("pw")).toBe("YWdlbnQ6cHc=");
      const fetcher: DaemonTransport.Fetcher = DaemonTransport.makeFetcher({
        port: 49152,
        password: "pw",
      });
      expect(typeof fetcher).toBe("function");
      const opts: DaemonTransport.ClientOptions = {
        base_url: "http://127.0.0.1:49152",
        password: "pw",
      };
      expectTypeOf(DaemonTransport.Client).toBeConstructibleWith(opts);
      expect(typeof DaemonTransport.HttpError).toBe("function");
      expect(typeof DaemonTransport.readFrames).toBe("function");
      expect(DaemonTransport.MAX_FRAME_BYTES).toBe(16 * 1024 * 1024);

      const res = new Response(JSON.stringify({ ok: true }), { status: 200 });
      await expect(
        DaemonTransport.parseJson<{ ok: true }>(res, "/x")
      ).resolves.toEqual({ ok: true });
    });
  });

  describe("boundary", () => {
    it("does not expose tenant concepts from the root", () => {
      expect(`${"Agent"}Runtime` in root).toBe(false);
      expect(`${"create"}Agent` in root).toBe(false);
      expect(`${"AGENT"}_TIERS` in root).toBe(false);
    });
  });
});
