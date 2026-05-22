/**
 * Public-API guard test. Pins the shape and presence of every symbol
 * `@grida/agent-tools` (and its subpaths) exports.
 *
 * This is intentionally separate from the behavioural tests in
 * `fs/fs.test.ts`, `fs/backends/node.test.ts`, `todos/todos.test.ts`.
 * Those exercise behaviour; this one exercises the **contract**. A
 * rename, signature change, or accidental drop here = a breaking change
 * for consumers — the test should fail until the README / CHANGELOG has
 * been updated to advertise it.
 *
 * The package exposes exactly two top-level symbols (`AgentFs`,
 * `AgentTodos`), each a class + same-named namespace. New public
 * additions go inside one of those namespaces. New top-level exports
 * are an explicit design decision — review carefully before adding.
 */
import { describe, expect, expectTypeOf, it } from "vitest";

import { AgentFs, AgentTodos } from "./index";
import * as Root from "./index";
import * as Fs from "./fs";
import * as Todos from "./todos";
import { OpfsBackend } from "./fs/backends/opfs";
import { NodeFsBackend } from "./fs/backends/node";

describe("@grida/agent-tools public API", () => {
  describe("root entry", () => {
    it("exposes exactly AgentFs and AgentTodos", () => {
      // Two named exports — that's the entire root surface. Adding a
      // third top-level symbol is a deliberate design break and should
      // fail this assertion until both the README and the CHANGELOG are
      // updated.
      expectTypeOf<keyof typeof Root>().toEqualTypeOf<
        "AgentFs" | "AgentTodos"
      >();
    });

    it("re-exports the subpath classes verbatim", () => {
      expectTypeOf(Root.AgentFs).toEqualTypeOf(Fs.AgentFs);
      expectTypeOf(Root.AgentTodos).toEqualTypeOf(Todos.AgentTodos);
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
    it("OpfsBackend implements AgentFs.Backend", () => {
      expectTypeOf(OpfsBackend).toBeConstructibleWith(["x"]);
      const b: AgentFs.Backend = new OpfsBackend(["x"]);
      void b;
    });

    it("NodeFsBackend implements AgentFs.Backend", () => {
      expectTypeOf(NodeFsBackend).toBeConstructibleWith("/");
      const b: AgentFs.Backend = new NodeFsBackend("/");
      void b;
    });
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
        activeForm: "x",
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
