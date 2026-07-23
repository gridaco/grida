/**
 * Public-API guard test. Pins the shape and presence of every symbol
 * the root plus server, sandbox, transport, fs, and todos subpaths export.
 *
 * This is intentionally separate from the behavioural tests in
 * `fs/fs.test.ts`, `fs/backends/node.test.ts`, `todos/todos.test.ts`.
 * Those exercise behaviour; this one exercises the **contract**. A
 * rename, signature change, or accidental drop here = a breaking change
 * for consumers — the test should fail until the README / CHANGELOG has
 * been updated to advertise it.
 *
 * `AgentFs` and `AgentTodos` are each a class + same-named namespace.
 * New public additions go inside one of those namespaces.
 */
import { describe, expect, expectTypeOf, it } from "vitest";

import * as root from ".";
import {
  AGENT_DEFAULT_TIER,
  AGENT_SESSION_AGENT,
  AGENT_TIERS,
  BYOK_PROVIDER_METADATA,
  BYOK_PROVIDER_IDS,
  createAgent,
  createToolset,
  GRIDA_STATUS_SSE_EVENT,
  SURFACE_LIST_OPEN_TOOL_NAME,
  SURFACE_OPEN_TOOL_NAME,
  type AgentModelId,
  type AgentRunMessage,
  type AgentRunMessagePart,
  type AgentRunOptions,
  type AgentUIMessageChunk,
  type ByokProviderMetadata,
  type ByokProviderId,
  type ChatMessageRow,
  type ChatMessageWithParts,
  type ChatModel,
  type ChatPartRow,
  type ChatSessionRow,
  type CreateSessionOptions,
  type ModelTier,
  type PatchSessionOptions,
  type SessionListFilter,
  type SessionListPage,
  type SessionRunState,
  type SessionStatus,
} from ".";
import {
  AGENT_DAEMON_DEFAULT_CAPABILITIES,
  createAgentDaemon,
  createAgentTenant,
  Daemon,
  DaemonServer,
  DAEMON_PROTOCOL,
  type AgentDaemonOptions,
  type AgentTenantOptions,
  type ProviderHttpTransport,
  type DaemonCapabilities,
  type DaemonHandshakeResponse,
  type DaemonHttpAccess,
  type DaemonTenant,
} from "./server";
import {
  AcpAgentAdapter,
  promptText,
  runAcpStdio,
  toolKind,
  translateChunk,
  type AcpCoreClient,
  type AcpUpdateSink,
} from "./acp";
import {
  buildAgentDaemonSandboxPolicy,
  hostFromUrl,
  type AgentDaemonSandboxPolicy,
} from "./sandbox";
import { AgentTransport } from "./transport";
import { AgentFs } from "./fs";
import { AgentTodos } from "./todos";
import { AgentSurface } from "./surface";
import { OpfsBackend } from "./fs/backends/opfs";

describe("@grida/agent public API", () => {
  describe("root protocol + runtime exports", () => {
    it("exposes client-safe protocol constants and types", () => {
      const run: AgentRunOptions = {
        messages: [],
        feature: AGENT_SESSION_AGENT,
        surface: { active: "/canvas.canvas", open: ["/canvas.canvas"] },
      };
      expect(run.feature).toBe("grida");
      expect(run.surface?.active).toBe("/canvas.canvas");

      // Session status back-channel (RFC `session` / `queue`).
      expect(GRIDA_STATUS_SSE_EVENT).toBe("grida-status");
      const idle: SessionStatus = { state: "idle" };
      const state: SessionRunState = idle.state;
      expect(state).toBe("idle");
    });

    it("exposes the runtime-agnostic agent factory and toolset factory", () => {
      expect(typeof createAgent).toBe("function");
      expect(typeof createToolset).toBe("function");
      expect(SURFACE_OPEN_TOOL_NAME).toBe("surface_open");
      expect(SURFACE_LIST_OPEN_TOOL_NAME).toBe("surface_list_open");
    });

    it("exposes BYOK provider identity, wire vocab, tiers, and session-row types", () => {
      // fal is image-only BYOK (#908) — present for key storage + image
      // routing, excluded from the text resolver via its `modalities` marker.
      expect(BYOK_PROVIDER_IDS).toEqual(["openrouter", "vercel", "fal"]);
      expect(BYOK_PROVIDER_METADATA.map((provider) => provider.label)).toEqual([
        "OpenRouter",
        "Vercel",
        "fal",
      ]);
      // The modality matrix drives image/video resolver routing (via
      // byokProvidersFor) — pin it so a bad metadata edit can't silently
      // re-route provider selection.
      expect(
        BYOK_PROVIDER_METADATA.map(({ id, modalities }) => ({ id, modalities }))
      ).toEqual([
        { id: "openrouter", modalities: ["text", "image", "video"] },
        { id: "vercel", modalities: ["text", "image", "video"] },
        { id: "fal", modalities: ["image", "video"] },
      ]);
      const byok: ByokProviderId = "vercel";
      const metadata: ByokProviderMetadata = BYOK_PROVIDER_METADATA[0];
      expect(byok).toBe("vercel");
      expect(metadata.id).toBe("openrouter");

      // Tier constants.
      expect(AGENT_TIERS).toContain(AGENT_DEFAULT_TIER);
      const tier: ModelTier = AGENT_DEFAULT_TIER;
      const modelId: AgentModelId = "anthropic/claude-sonnet-4.6";
      expect(typeof tier).toBe("string");
      expect(modelId).toContain("/");

      // Wire vocab — the shipped stream contract is the AI-SDK frame alias.
      type _U = AgentUIMessageChunk;
      const part: AgentRunMessagePart = { type: "text", text: "hello" };
      const message: AgentRunMessage = { role: "user", parts: [part] };
      const run: AgentRunOptions = {
        messages: [message],
        tier: "pro",
        provider_id: "openrouter",
        model_id: modelId,
      };
      expect(run.messages[0]?.role).toBe("user");

      // Session-layer row contract (the persisted chat-history shapes).
      type _M = ChatModel;
      type _Msg = ChatMessageRow;
      type _P = ChatPartRow;
      type _MW = ChatMessageWithParts;
      type _LF = SessionListFilter;
      type _LP = SessionListPage;
      type _CS = CreateSessionOptions;
      type _PS = PatchSessionOptions;
      const row: ChatSessionRow = {
        id: "s",
        title: "t",
        agent: "grida",
        workspace_id: null,
        model: null,
        mode: null,
        parent_id: null,
        parent_message_id: null,
        permissions: [],
        metadata: {},
        prompt_tokens: 0,
        completion_tokens: 0,
        reasoning_tokens: 0,
        cache_read: 0,
        cache_write: 0,
        total_tokens: 0,
        cost_usd: 0,
        created_at: 0,
        updated_at: 0,
        archived_at: null,
      };
      expect(row.agent).toBe("grida");
    });

    it("exposes the endpoint-provider contract (issue #806)", () => {
      expect(root.OLLAMA_ENDPOINT_PRESET).toEqual({
        id: "ollama",
        label: "Ollama",
        base_url: "http://localhost:11434/v1",
      });
      expect(typeof root.isValidEndpointProviderId).toBe("function");
      expect(typeof root.validateEndpointProviderConfig).toBe("function");
      expect(typeof root.mergeProbedModels).toBe("function");
      expect(root.isByokProviderId("openrouter")).toBe(true);
      expect(root.isByokProviderId("ollama")).toBe(false);
      const config: root.EndpointProviderConfig = {
        ...root.OLLAMA_ENDPOINT_PRESET,
        models: [{ id: "llama3.1:8b", tool_call: true }],
      };
      const model: root.EndpointModelSpec = config.models[0];
      expect(model.id).toBe("llama3.1:8b");
      // The model-id and provider-id wire types are open: a registered
      // local id type-checks (the runtime gate still validates it).
      const localModel: AgentModelId = "llama3.1:8b";
      const localRun: AgentRunOptions = {
        messages: [],
        provider_id: "ollama",
        model_id: localModel,
      };
      expect(localRun.provider_id).toBe("ollama");
    });

    it("does not expose internal runtime/provider/server modules from the root", () => {
      expect("AgentRuntime" in root).toBe(false);
      expect("StreamRegistry" in root).toBe(false);
      expect("buildServer" in root).toBe(false);
      expect("resolveProvider" in root).toBe(false);
      expect(`${"Agent"}${"Chunk"}` in root).toBe(false);
      // Daemon-owned DTOs (handshake, workspace/file resources) moved to
      // `@grida/daemon` (#927) — the agent root must not re-grow them.
      expect(`${"AGENT_SERVER"}_PROTOCOL` in root).toBe(false);
      expect(`${"AGENT_SERVER"}_DEFAULT_CAPABILITIES` in root).toBe(false);
    });
  });

  describe("server subpath (the agent tenant of @grida/daemon, #927)", () => {
    it("exposes the composed agent-daemon factory and the tenant", () => {
      // The composed default: every capability group on.
      const caps: DaemonCapabilities = AGENT_DAEMON_DEFAULT_CAPABILITIES;
      expect(caps.agent).toBe(true);
      expect(caps.files).toBe(true);
      expect(caps.shell).toBe(false);
      const handshake: DaemonHandshakeResponse = {
        protocol: DAEMON_PROTOCOL,
        supports: ["agent@1"],
        capabilities: caps,
      };
      expect(handshake.protocol).toBe(1);

      const httpAccess: DaemonHttpAccess = {
        allowed_origins: ["https://client.example"],
        allowed_referer_paths: ["/client"],
      };
      const opts: AgentDaemonOptions = {
        password: "pw",
        user_data_path: "/tmp/grida",
        http_access: httpAccess,
      };
      // Type-level: the factory returns the daemon's lifecycle class; the
      // tenant conforms to the daemon's seam contract.
      expectTypeOf(createAgentDaemon).returns.toEqualTypeOf<DaemonServer>();
      const providerHttp: ProviderHttpTransport = {
        request: globalThis.fetch,
        download: globalThis.fetch,
      };
      const tenantOpts: AgentTenantOptions = {
        interactive: true,
        provider_http: providerHttp,
      };
      const tenant: DaemonTenant = createAgentTenant(tenantOpts);
      expect(typeof tenant.register).toBe("function");
      expect(tenant.sse_query_token_paths?.length).toBe(2);
      expect(typeof createAgentDaemon).toBe("function");
      // Host HTTP stays behind the Node-only server entry. Neither the raw
      // operations nor the internal URL-part adapter join the neutral root.
      expect("ProviderHttp" in root).toBe(false);
      expect("createAgentWithUrlPartDownload" in root).toBe(false);
      void opts;
    });

    it("exposes the package-owned sandbox policy intent", () => {
      expect(hostFromUrl("https://example.com/path")).toBe("example.com");

      const policy: AgentDaemonSandboxPolicy = buildAgentDaemonSandboxPolicy({
        user_data: "/tmp/grida",
        home: "/Users/example",
        gg_host: "grida.co",
      });
      expect(policy.network.allowed_domains).toContain("openrouter.ai");
      expect(policy.network.allowed_domains).toEqual(
        expect.arrayContaining(["grida.co", "*.grida.co"])
      );
      // BYOK image provider fal (#908): queue API + media CDN must be reachable.
      expect(policy.network.allowed_domains).toEqual(
        expect.arrayContaining(["*.fal.run", "fal.media", "*.fal.media"])
      );
      // Agent-provider class (issue #813): the external agent's vendor backend
      // must be reachable through the srt allowlist. Pin the full host set so a
      // dropped domain fails here, not at runtime egress.
      expect(policy.network.allowed_domains).toEqual(
        expect.arrayContaining([
          "api.anthropic.com",
          "anthropic.com",
          "*.anthropic.com",
          "claude.ai",
          "*.claude.ai",
        ])
      );
      expect(policy.filesystem.deny_read.some((p) => p.includes(".ssh"))).toBe(
        true
      );
    });

    it("removes direct provider egress in host-routed HTTP mode", () => {
      const policy = buildAgentDaemonSandboxPolicy({
        user_data: "/tmp/grida",
        home: "/Users/example",
        gg_host: "grida.co",
        host_routed_provider_http: true,
      });

      // BYOK + hosted GG must leave through the host callback. Pin every
      // provider family, not only one representative host.
      for (const host of [
        "openrouter.ai",
        "ai-gateway.vercel.sh",
        "*.vercel-ai.com",
        "fal.run",
        "*.fal.run",
        "fal.media",
        "*.fal.media",
        "grida.co",
        "*.grida.co",
      ]) {
        expect(policy.network.allowed_domains).not.toContain(host);
      }
      // ACP owns a separate network stack inside the same outer sandbox; the
      // daemon frame's baseline hosts also remain available to sandboxed work.
      expect(policy.network.allowed_domains).toEqual(
        expect.arrayContaining([
          "api.anthropic.com",
          "*.anthropic.com",
          "registry.npmjs.org",
          "github.com",
        ])
      );
    });

    it("can deny all direct outbound network to shell and child processes", () => {
      const policy = buildAgentDaemonSandboxPolicy({
        user_data: "/tmp/grida",
        home: "/Users/example",
        gg_host: "grida.co",
        direct_network_access: "none",
      });

      // This suppresses all three sources: daemon development hosts,
      // in-process provider/GG hosts, and external ACP vendor hosts.
      expect(policy.network.allowed_domains).toEqual([]);
      // The daemon still needs to listen on its loopback HTTP perimeter. This
      // option governs outbound destinations, not local server binding.
      expect(policy.network.allow_local_binding).toBe(true);
    });

    it("can independently deny local socket binding", () => {
      const policy = buildAgentDaemonSandboxPolicy({
        user_data: "/tmp/grida",
        home: "/Users/example",
        allow_local_binding: false,
      });

      // Binding authority is independent of outbound allowlisted domains. A
      // socketless host can remove it without changing provider egress policy.
      expect(policy.network.allow_local_binding).toBe(false);
      expect(policy.network.allowed_domains).toContain("openrouter.ai");
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
  });

  describe("acp subpath", () => {
    it("exposes the ACP adapter surface (acp.md)", () => {
      const sink: AcpUpdateSink = { sessionUpdate: async () => {} };
      const client = {} as AcpCoreClient;
      expectTypeOf(AcpAgentAdapter).toBeConstructibleWith(sink, { client });
      expect(typeof runAcpStdio).toBe("function");
      expect(toolKind("read_file")).toBe("read");
      expect(promptText([{ type: "text", text: "x" }])).toBe("x");
      expect(
        translateChunk({
          type: "text-delta",
          id: "t",
          delta: "x",
        } as Parameters<typeof translateChunk>[0])
      ).toMatchObject({ sessionUpdate: "agent_message_chunk" });
    });
  });

  describe("transport subpath", () => {
    it("exposes the AgentClient transport helpers", async () => {
      expect(AgentTransport.USERNAME).toBe("agent");
      expect(AgentTransport.baseUrl(49152)).toBe("http://127.0.0.1:49152");
      expect(AgentTransport.buildBasicAuthHeader("pw")).toBe(
        "Basic YWdlbnQ6cHc="
      );
      // The auth_token SSE query value is the SAME credential payload.
      expect(AgentTransport.buildAuthToken("pw")).toBe("YWdlbnQ6cHc=");
      const fetcher: AgentTransport.Fetcher = AgentTransport.makeFetcher({
        port: 49152,
        password: "pw",
      });
      expect(typeof fetcher).toBe("function");
      const opts: AgentTransport.ClientOptions = {
        base_url: "http://127.0.0.1:49152",
        password: "pw",
      };
      expectTypeOf(AgentTransport.Client).toBeConstructibleWith(opts);
      expect(typeof AgentTransport.HttpError).toBe("function");

      const res = new Response(JSON.stringify({ ok: true }), { status: 200 });
      await expect(
        AgentTransport.parseJson<{ ok: true }>(res, "/x")
      ).resolves.toEqual({ ok: true });
    });
  });

  describe("AgentFs (class + namespace)", () => {
    it("is constructible with a Backend", () => {
      expectTypeOf(AgentFs).toBeConstructibleWith(new AgentFs.MemoryBackend());
    });

    it("exposes Backend, LiveBinding, Event, Listener", () => {
      const backend: AgentFs.Backend = new AgentFs.MemoryBackend();
      const binding: AgentFs.LiveBinding = {
        serialize: () => "",
        load: () => {},
        getVersion: () => 0,
      };
      const ev: AgentFs.Event = { type: "write", path: "/x", version: 0 };
      const listener: AgentFs.Listener = () => {};

      // Runtime check anchors the type-only assertions above.
      expect(backend).toBeInstanceOf(AgentFs.MemoryBackend);
      expect(typeof binding.serialize).toBe("function");
      expect(ev.type).toBe("write");
      expect(typeof listener).toBe("function");
    });

    it("exposes result + arg types", () => {
      // Pure-type guard: the file must compile against every public
      // result/arg alias. A drop or rename trips the build.
      type _R = AgentFs.ReadResult;
      type _WA = AgentFs.WriteArgs;
      type _W = AgentFs.WriteResult;
      type _WS = AgentFs.WriteSuccess;
      type _WF = AgentFs.WriteFailure;
      type _EA = AgentFs.EditArgs;
      type _E = AgentFs.EditResult;
      type _ES = AgentFs.EditSuccess;
      type _EF = AgentFs.EditFailure;
      type _D = AgentFs.DeleteResult;
      type _GA = AgentFs.GrepArgs;
      type _GM = AgentFs.GrepMatch;
      type _GR = AgentFs.GrepResult;
      type _O = AgentFs.Options;

      // Sample value lives on the result-success union — runtime
      // anchor for the otherwise type-only block.
      const ok: AgentFs.WriteSuccess = { ok: true, version: 1 };
      expect(ok.ok).toBe(true);
    });

    it("exposes failure-reason vocabularies (zod + TS share a source)", () => {
      // The const tuples that back the zod enums on `AgentFs.tools` are
      // also the source of the `*FailureReason` TS unions. Catching a
      // drop here = catching it before zod and TS get out of sync.
      // Const tuples — readonly arrays of literal-typed strings.
      expect(Array.isArray(AgentFs.WRITE_FAILURE_REASONS)).toBe(true);
      expect(Array.isArray(AgentFs.EDIT_FAILURE_REASONS)).toBe(true);
      expect(Array.isArray(AgentFs.DELETE_FAILURE_REASONS)).toBe(true);
      expectTypeOf<AgentFs.WriteFailureReason>().toEqualTypeOf<
        (typeof AgentFs.WRITE_FAILURE_REASONS)[number]
      >();
      expectTypeOf<AgentFs.EditFailureReason>().toEqualTypeOf<
        (typeof AgentFs.EDIT_FAILURE_REASONS)[number]
      >();
      expectTypeOf<AgentFs.DeleteFailureReason>().toEqualTypeOf<
        (typeof AgentFs.DELETE_FAILURE_REASONS)[number]
      >();

      // Spot-check membership so a typo in the const ARRAY (not the
      // type alias) is caught at runtime.
      expect(AgentFs.WRITE_FAILURE_REASONS).toContain("stale");
      expect(AgentFs.EDIT_FAILURE_REASONS).toContain("ambiguous");
      expect(AgentFs.DELETE_FAILURE_REASONS).toContain("mounted");
    });

    it("exposes the AI-SDK tool table + dispatcher", () => {
      expectTypeOf(AgentFs.tools).toBeObject();
      expectTypeOf(AgentFs.TOOL_NAMES).toBeObject();
      expectTypeOf<AgentFs.ToolName>().toEqualTypeOf<
        "read_file" | "edit_file" | "write_file" | "list_files" | "grep_files"
      >();
      expectTypeOf<AgentFs.Tools>().toEqualTypeOf<typeof AgentFs.tools>();
      expectTypeOf(AgentFs.resolveToolCall).toBeFunction();
    });

    it("exposes MemoryBackend as the default in-process backend", () => {
      expectTypeOf(AgentFs.MemoryBackend).toBeConstructibleWith();
      const b: AgentFs.Backend = new AgentFs.MemoryBackend();
      void b;
    });

    it("does NOT re-export internal match helpers under the namespace", () => {
      // `findMatches` etc. live in `./internal/match` and are NOT
      // public-facing. Catching a leak here = catching it before it
      // turns into accidental contract.
      //
      // We assert that the *intersection* of public keys with the
      // internal names is `never`, so any single leaked name trips
      // the guard (a `not.toEqualTypeOf<A | B | C>` check would only
      // fail if all three leaked simultaneously).
      type LeakedInternalKeys = Extract<
        keyof typeof AgentFs,
        "findMatches" | "collapseWhitespace" | "applyReplacements"
      >;
      expectTypeOf<LeakedInternalKeys>().toEqualTypeOf<never>();
    });
  });

  describe("AgentFs subpath backends", () => {
    it("OpfsBackend (./fs/backends/opfs) implements AgentFs.Backend", () => {
      expectTypeOf(OpfsBackend).toBeConstructibleWith(["x"]);
      const b: AgentFs.Backend = new OpfsBackend(["x"]);
      void b;
    });
    // NodeFsBackend is intentionally NOT pinned: it's no longer a public
    // subpath (internal + test-only, see fs/backends/node.test.ts).
  });

  describe("AgentTodos (class + namespace)", () => {
    it("is constructible with no args", () => {
      expectTypeOf(AgentTodos).toBeConstructibleWith();
    });

    it("exposes Todo, Status, WriteSuccess", () => {
      type _S = AgentTodos.Status;
      type _T = AgentTodos.Todo;
      type _W = AgentTodos.WriteSuccess;

      // Runtime anchor — the types above must compose into a real value.
      const sample: AgentTodos.Todo = {
        content: "x",
        active_form: "x",
        status: "pending",
      };
      expect(sample.status).toBe("pending");
    });

    it("exposes the AI-SDK tool table + dispatcher", () => {
      expectTypeOf(AgentTodos.tools).toBeObject();
      expectTypeOf(AgentTodos.TOOL_NAMES).toBeObject();
      expectTypeOf<AgentTodos.ToolName>().toEqualTypeOf<"todo_write">();
      expectTypeOf<AgentTodos.Tools>().toEqualTypeOf<typeof AgentTodos.tools>();
      expectTypeOf(AgentTodos.resolveToolCall).toBeFunction();
    });
  });

  describe("AgentSurface namespace", () => {
    it("exposes the tool family and browser observer", () => {
      expect(AgentSurface.TOOL_NAMES).toEqual({
        surface_open: "surface_open",
        surface_list_open: "surface_list_open",
      });
      expectTypeOf<AgentSurface.ToolName>().toEqualTypeOf<
        "surface_open" | "surface_list_open"
      >();
      expectTypeOf(AgentSurface.createTools).toBeFunction();
      expectTypeOf(AgentSurface.observeToolCall).toBeFunction();
      expectTypeOf(AgentSurface.parseSnapshot).toBeFunction();
      expectTypeOf<AgentSurface.Tools>().toEqualTypeOf<
        ReturnType<typeof AgentSurface.createTools>
      >();
    });

    it("exposes the snapshot and acknowledgement contracts", () => {
      const host: AgentSurface.Host = {
        open: () => undefined,
        listOpen: () => ({
          active: "/canvas.canvas",
          open: ["/canvas.canvas"],
        }),
      };
      const snapshot: AgentSurface.Snapshot = host.listOpen();
      const opened: AgentSurface.OpenOutput = {
        path: "/canvas.canvas",
        requested: true,
        reason: "requested",
      };
      const listed: AgentSurface.ListOpenOutput = {
        interactive: true,
        active: "/canvas.canvas",
        open: ["/canvas.canvas"],
      };

      expect(typeof host.open).toBe("function");
      expect(snapshot.active).toBe("/canvas.canvas");
      expect(opened.reason).toBe("requested");
      expect(listed.active).toBe("/canvas.canvas");
    });
  });
});
