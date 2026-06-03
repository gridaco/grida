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
  AGENT_SKILL_IDS,
  AGENT_DEFAULT_TIER,
  AGENT_SERVER_DEFAULT_CAPABILITIES,
  AGENT_SERVER_PROTOCOL,
  AGENT_SESSION_AGENT,
  AGENT_TIERS,
  BYOK_PROVIDER_METADATA,
  BYOK_PROVIDER_IDS,
  createAgent,
  createToolset,
  GRIDA_STATUS_SSE_EVENT,
  type AgentModelId,
  type AgentRunMessage,
  type AgentRunMessagePart,
  type AgentRunOptions,
  type AgentServerCapabilities,
  type AgentServerHandshakeResponse,
  type AgentUIMessageChunk,
  type ByokProviderMetadata,
  type ByokProviderId,
  type ChatMessageRow,
  type ChatMessageWithParts,
  type ChatModel,
  type ChatPartRow,
  type ChatSessionRow,
  type CreateSessionOptions,
  type FileReadResult,
  type ModelTier,
  type PatchSessionOptions,
  type RecentEntry,
  type SessionListFilter,
  type SessionListPage,
  type SessionRunState,
  type SessionStatus,
  type SkillId,
  type Workspace,
  type WorkspaceFsEntry,
} from ".";
import {
  AgentHost,
  type AgentHostHttpAccess,
  type AgentHostOptions,
} from "./server";
import {
  buildAgentHostSandboxPolicy,
  hostFromUrl,
  type AgentHostSandboxPolicy,
} from "./sandbox";
import { AgentTransport } from "./transport";
import { AgentFs } from "./fs";
import { AgentTodos } from "./todos";
import { OpfsBackend } from "./fs/backends/opfs";

describe("@grida/agent public API", () => {
  describe("root protocol + runtime exports", () => {
    it("exposes client-safe protocol constants and types", () => {
      const caps: AgentServerCapabilities = AGENT_SERVER_DEFAULT_CAPABILITIES;
      const handshake: AgentServerHandshakeResponse = {
        protocol: AGENT_SERVER_PROTOCOL,
        supports: ["agent@1"],
        capabilities: caps,
      };
      const run: AgentRunOptions = {
        messages: [],
        feature: AGENT_SESSION_AGENT,
      };

      expect(AGENT_SERVER_PROTOCOL).toBe(1);
      expect(handshake.capabilities.sessions).toBe(true);
      expect(run.feature).toBe("grida");

      // Session status back-channel (RFC `session` / `queue`).
      expect(GRIDA_STATUS_SSE_EVENT).toBe("grida-status");
      const idle: SessionStatus = { state: "idle" };
      const state: SessionRunState = idle.state;
      expect(state).toBe("idle");
    });

    it("exposes the runtime-agnostic agent factory and toolset factory", () => {
      expect(typeof createAgent).toBe("function");
      expect(typeof createToolset).toBe("function");
    });

    it("exposes BYOK provider identity, wire vocab, tiers, and session-row types", () => {
      expect(BYOK_PROVIDER_IDS).toEqual(["openrouter", "ai-gateway"]);
      expect(BYOK_PROVIDER_METADATA.map((provider) => provider.label)).toEqual([
        "OpenRouter",
        "AI Gateway",
      ]);
      const byok: ByokProviderId = "ai-gateway";
      const metadata: ByokProviderMetadata = BYOK_PROVIDER_METADATA[0];
      expect(byok).toBe("ai-gateway");
      expect(metadata.id).toBe("openrouter");

      // Tier constants.
      expect(AGENT_TIERS).toContain(AGENT_DEFAULT_TIER);
      const tier: ModelTier = AGENT_DEFAULT_TIER;
      const modelId: AgentModelId = "anthropic/claude-sonnet-4.6";
      const skill: SkillId = AGENT_SKILL_IDS[0];
      expect(typeof tier).toBe("string");
      expect(modelId).toContain("/");
      expect(skill).toBe("svg");

      // Wire vocab — the shipped stream contract is the AI-SDK frame alias.
      type _U = AgentUIMessageChunk;
      const part: AgentRunMessagePart = { type: "text", text: "hello" };
      const message: AgentRunMessage = { role: "user", parts: [part] };
      const run: AgentRunOptions = {
        messages: [message],
        tier: "pro",
        provider_id: "openrouter",
        model_id: modelId,
        skills: [skill],
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
      type _FR = FileReadResult;
      type _RE = RecentEntry;
      type _W = Workspace;
      type _WE = WorkspaceFsEntry;
      const row: ChatSessionRow = {
        id: "s",
        title: "t",
        agent: "grida",
        workspace_id: null,
        model: null,
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

    it("does not expose internal runtime/provider/server modules from the root", () => {
      expect("AgentRuntime" in root).toBe(false);
      expect("StreamRegistry" in root).toBe(false);
      expect("buildServer" in root).toBe(false);
      expect("resolveProvider" in root).toBe(false);
      expect(`${"Agent"}${"Chunk"}` in root).toBe(false);
    });
  });

  describe("server subpath", () => {
    it("exposes AgentHost and package-owned sandbox policy intent", () => {
      const HostCtor: new (opts: AgentHostOptions) => AgentHost = AgentHost;
      const httpAccess: AgentHostHttpAccess = {
        allowed_origins: ["https://client.example"],
        allowed_referer_paths: ["/client"],
      };
      expect(httpAccess.allowed_referer_paths[0]).toBe("/client");
      expect(typeof HostCtor).toBe("function");
      expect(hostFromUrl("https://example.com/path")).toBe("example.com");

      const policy: AgentHostSandboxPolicy = buildAgentHostSandboxPolicy({
        user_data: "/tmp/grida",
        home: "/Users/example",
      });
      expect(policy.network.allowed_domains).toContain("openrouter.ai");
      expect(policy.filesystem.deny_read.some((p) => p.includes(".ssh"))).toBe(
        true
      );
    });
  });

  describe("transport subpath", () => {
    it("exposes the AgentClient transport helpers", async () => {
      expect(AgentTransport.USERNAME).toBe("agent");
      expect(AgentTransport.baseUrl(49152)).toBe("http://127.0.0.1:49152");
      expect(AgentTransport.buildBasicAuthHeader("pw")).toBe(
        "Basic YWdlbnQ6cHc="
      );
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
});
