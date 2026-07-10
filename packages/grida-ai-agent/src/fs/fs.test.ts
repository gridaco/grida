import { describe, expect, it, vi } from "vitest";
import { AgentFs } from "./index";
import { applyReplacements, findMatches } from "./internal/match";

/**
 * Tiny synthetic `LiveBinding` for tests — no editor, just a string +
 * counter + manual subscribers. Lets us exercise the bound-file path
 * without dragging `@grida/svg-editor` in.
 */
function makeBinding(initial = ""): AgentFs.LiveBinding & {
  externalEdit(next: string): void;
  emit(): void;
  current(): string;
} {
  let content = initial;
  let version = 0;
  const subs = new Set<() => void>();
  const emit = () => {
    for (const cb of subs) cb();
  };
  return {
    serialize: () => content,
    load: (next: string) => {
      if (next === "PARSE_FAIL") throw new Error("synthetic parse failure");
      content = next;
      version += 1;
    },
    getVersion: () => version,
    subscribe: (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    // Test helpers.
    externalEdit(next: string) {
      content = next;
      version += 1;
      emit();
    },
    emit,
    current() {
      return content;
    },
  };
}

const tick = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Match primitives
// ---------------------------------------------------------------------------

describe("findMatches", () => {
  it("returns disjoint literal ranges in order", () => {
    expect(findMatches("aaa-aaa", "aaa")).toEqual([
      [0, 3],
      [4, 7],
    ]);
  });

  it("returns one range when needle matches once", () => {
    const ranges = findMatches("hello world", "world");
    expect(ranges).toEqual([[6, 11]]);
  });

  it("returns no ranges for an empty needle", () => {
    expect(findMatches("anything", "")).toEqual([]);
  });

  it("returns no ranges when the needle is absent", () => {
    expect(findMatches("hello", "xyz")).toEqual([]);
  });

  it("falls back to whitespace-normalized match when literal misses", () => {
    const hay = `<rect x="10" y="10" fill="red"/>`;
    // Doubled space — literal misses, normalized catches.
    const ranges = findMatches(hay, `x="10"  y="10"`);
    expect(ranges.length).toBe(1);
    expect(hay.slice(ranges[0][0], ranges[0][1])).toBe(`x="10" y="10"`);
  });

  it("ignores leading / trailing whitespace in the needle when falling back", () => {
    const hay = "alpha beta gamma";
    const ranges = findMatches(hay, "  beta  ");
    expect(ranges.length).toBe(1);
    expect(hay.slice(ranges[0][0], ranges[0][1])).toBe("beta");
  });
});

describe("applyReplacements", () => {
  it("splices a single range", () => {
    const out = applyReplacements("hello world", [[6, 11]], "there");
    expect(out).toBe("hello there");
  });

  it("splices multiple ranges, preserving order", () => {
    const out = applyReplacements(
      "aXa-aXa-aXa",
      [
        [0, 3],
        [4, 7],
        [8, 11],
      ],
      "bYb"
    );
    expect(out).toBe("bYb-bYb-bYb");
  });

  it("is a no-op when ranges is empty", () => {
    expect(applyReplacements("hello", [], "X")).toBe("hello");
  });
});

// ---------------------------------------------------------------------------
// MemoryBackend
// ---------------------------------------------------------------------------

describe("MemoryBackend", () => {
  it("starts empty", async () => {
    const b = new AgentFs.MemoryBackend();
    expect(await b.list()).toEqual([]);
    expect(await b.read("/canvas.svg")).toBeNull();
  });

  it("round-trips write / read", async () => {
    const b = new AgentFs.MemoryBackend();
    await b.write("/canvas.svg", "<svg/>");
    expect(await b.read("/canvas.svg")).toBe("<svg/>");
  });

  it("lists every persisted path", async () => {
    const b = new AgentFs.MemoryBackend();
    await b.write("/canvas.svg", "A");
    await b.write("/notes/idea.md", "B");
    expect(new Set(await b.list())).toEqual(
      new Set(["/canvas.svg", "/notes/idea.md"])
    );
  });

  it("delete removes the file; read returns null after", async () => {
    const b = new AgentFs.MemoryBackend();
    await b.write("/canvas.svg", "<svg/>");
    await b.delete("/canvas.svg");
    expect(await b.read("/canvas.svg")).toBeNull();
  });

  it("delete on a missing path is a no-op", async () => {
    const b = new AgentFs.MemoryBackend();
    await expect(b.delete("/never-existed")).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// AgentFs
// ---------------------------------------------------------------------------

describe("AgentFs — basics", () => {
  it("starts empty and lists nothing", () => {
    const fs = new AgentFs(new AgentFs.MemoryBackend());
    expect(fs.list()).toEqual([]);
    expect(fs.exists("/canvas.svg")).toBe(false);
    expect(fs.read("/canvas.svg")).toBeNull();
  });

  it("permissive write creates a pure file with version 1", () => {
    const fs = new AgentFs(new AgentFs.MemoryBackend());
    const r = fs.write("/notes/draft.md", {
      content: "hello",
      expected_version: null,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.version).toBe(1);
    expect(fs.read("/notes/draft.md")).toEqual({
      content: "hello",
      version: 1,
    });
    expect(fs.list()).toEqual(["/notes/draft.md"]);
  });

  it("write with a version on a missing path returns not_found", () => {
    const fs = new AgentFs(new AgentFs.MemoryBackend());
    const r = fs.write("/notes/draft.md", {
      content: "hello",
      expected_version: 0,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("not_found");
  });

  it("write with stale version is rejected", () => {
    const fs = new AgentFs(new AgentFs.MemoryBackend());
    fs.write("/x.md", { content: "v1", expected_version: null });
    fs.write("/x.md", { content: "v2", expected_version: 1 });
    const r = fs.write("/x.md", { content: "v3", expected_version: 1 }); // stale (current is 2)
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("stale");
    expect(r.current_version).toBe(2);
  });
});

describe("AgentFs.list_directory", () => {
  function seed(): AgentFs {
    const fs = new AgentFs(new AgentFs.MemoryBackend());
    fs.write("/canvas.svg", { content: "<svg/>", expected_version: null });
    fs.write("/notes/brief.md", { content: "brief", expected_version: null });
    fs.write("/notes/drafts/a.md", { content: "a", expected_version: null });
    fs.write("/public/slides/index.md", {
      content: "slides",
      expected_version: null,
    });
    return fs;
  }

  it("lists root direct children as folders and files", () => {
    expect(seed().list_directory()).toEqual({
      path: "/",
      folders: ["/notes", "/public"],
      files: ["/canvas.svg"],
      truncated: false,
    });
  });

  it("lists a nested directory without returning descendants as files", () => {
    expect(seed().list_directory({ path: "/notes" })).toEqual({
      path: "/notes",
      folders: ["/notes/drafts"],
      files: ["/notes/brief.md"],
      truncated: false,
    });
  });

  it("normalizes relative paths from the agent fs root", () => {
    expect(seed().list_directory({ path: "public/slides/" })).toEqual({
      path: "/public/slides",
      folders: [],
      files: ["/public/slides/index.md"],
      truncated: false,
    });
  });

  it("paginates over sorted folders first, then files", () => {
    expect(seed().list_directory({ path: "/", limit: 2 })).toEqual({
      path: "/",
      folders: ["/notes", "/public"],
      files: [],
      truncated: true,
      next_offset: 2,
    });
    expect(seed().list_directory({ path: "/", offset: 2, limit: 2 })).toEqual({
      path: "/",
      folders: [],
      files: ["/canvas.svg"],
      truncated: false,
    });
  });

  it("resolveToolCallAsync falls back to the in-memory directory listing", async () => {
    const out = await AgentFs.resolveToolCallAsync(seed(), {
      tool_name: AgentFs.TOOL_NAMES.list_files,
      input: { path: "/public", limit: 1 },
    });
    expect(out).toEqual({
      path: "/public",
      folders: ["/public/slides"],
      files: [],
      truncated: false,
    });
  });
});

describe("AgentFs — mounted (live binding)", () => {
  it("reads through the binding and tracks its version", () => {
    const fs = new AgentFs(new AgentFs.MemoryBackend());
    const b = makeBinding("<svg/>");
    fs.mount("/canvas.svg", b);
    expect(fs.read("/canvas.svg")).toEqual({
      content: "<svg/>",
      version: 0,
    });
  });

  it("write goes through binding.load and the new version is reported", () => {
    const fs = new AgentFs(new AgentFs.MemoryBackend());
    const b = makeBinding("<svg/>");
    fs.mount("/canvas.svg", b);
    const r = fs.write("/canvas.svg", {
      content: "<svg><rect/></svg>",
      expected_version: 0,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.version).toBe(1);
    expect(b.current()).toBe("<svg><rect/></svg>");
  });

  it("binding.load throw → parse_error, baseline unchanged", () => {
    const fs = new AgentFs(new AgentFs.MemoryBackend());
    const b = makeBinding("<svg/>");
    fs.mount("/canvas.svg", b);
    const r = fs.write("/canvas.svg", {
      content: "PARSE_FAIL",
      expected_version: 0,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("parse_error");
    // Next write at the same version still works.
    const r2 = fs.write("/canvas.svg", {
      content: "<svg/>",
      expected_version: 0,
    });
    expect(r2.ok).toBe(true);
  });

  it("external (human) edit on the binding makes the next AI write stale", () => {
    const fs = new AgentFs(new AgentFs.MemoryBackend());
    const b = makeBinding("<svg/>");
    fs.mount("/canvas.svg", b);
    const { version } = fs.read("/canvas.svg")!;
    b.externalEdit("<svg/><!--human-->");
    const r = fs.write("/canvas.svg", {
      content: "<svg/>",
      expected_version: version,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("stale");
  });
});

describe("AgentFs.edit", () => {
  it("requires a prior read on the path (not_read)", async () => {
    // Seed the backend so hydrate brings in a file without any agent read.
    // A direct `fs.write()` would count as a read, so we use hydrate here.
    const backend = new AgentFs.MemoryBackend();
    await backend.write("/notes.md", "alpha beta");
    const fs = new AgentFs(backend);
    await fs.hydrate();
    const r = fs.edit("/notes.md", {
      old_string: "alpha",
      new_string: "ALPHA",
      expected_version: 0,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("not_read");
  });

  it("applies a unique match and advances the version", () => {
    const fs = new AgentFs(new AgentFs.MemoryBackend());
    fs.write("/notes.md", { content: "alpha beta", expected_version: null });
    const { version } = fs.read("/notes.md")!;
    const r = fs.edit("/notes.md", {
      old_string: "alpha",
      new_string: "ALPHA",
      expected_version: version,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.occurrences).toBe(1);
    expect(fs.read("/notes.md")?.content).toBe("ALPHA beta");
  });

  it("refuses an ambiguous match without replace_all", () => {
    const fs = new AgentFs(new AgentFs.MemoryBackend());
    fs.write("/notes.md", { content: "x x x", expected_version: null });
    const { version } = fs.read("/notes.md")!;
    const r = fs.edit("/notes.md", {
      old_string: "x",
      new_string: "Y",
      expected_version: version,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("ambiguous");
    expect(r.occurrences).toBe(3);
  });

  it("applies all matches when replace_all is true", () => {
    const fs = new AgentFs(new AgentFs.MemoryBackend());
    fs.write("/notes.md", { content: "x x x", expected_version: null });
    const { version } = fs.read("/notes.md")!;
    const r = fs.edit("/notes.md", {
      old_string: "x",
      new_string: "Y",
      replace_all: true,
      expected_version: version,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.occurrences).toBe(3);
    expect(fs.read("/notes.md")?.content).toBe("Y Y Y");
  });

  it("rejects no-op edits", () => {
    const fs = new AgentFs(new AgentFs.MemoryBackend());
    fs.write("/notes.md", { content: "alpha", expected_version: null });
    const { version } = fs.read("/notes.md")!;
    const r = fs.edit("/notes.md", {
      old_string: "alpha",
      new_string: "alpha",
      expected_version: version,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("no_op");
  });

  it("returns not_found when snippet is absent", () => {
    const fs = new AgentFs(new AgentFs.MemoryBackend());
    fs.write("/notes.md", { content: "alpha", expected_version: null });
    const { version } = fs.read("/notes.md")!;
    const r = fs.edit("/notes.md", {
      old_string: "gamma",
      new_string: "GAMMA",
      expected_version: version,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("not_found");
  });

  it("works on bound files", () => {
    const fs = new AgentFs(new AgentFs.MemoryBackend());
    const b = makeBinding('<svg><rect fill="red"/></svg>');
    fs.mount("/canvas.svg", b);
    const { version } = fs.read("/canvas.svg")!;
    const r = fs.edit("/canvas.svg", {
      old_string: 'fill="red"',
      new_string: 'fill="blue"',
      expected_version: version,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(b.current()).toContain('fill="blue"');
  });
});

describe("AgentFs.grep", () => {
  function seed(): AgentFs {
    const fs = new AgentFs(new AgentFs.MemoryBackend());
    fs.write("/notes/a.md", {
      content: "alpha\nBETA\ngamma alpha\n",
      expected_version: null,
    });
    fs.write("/notes/b.md", {
      content: "beta beta\ndelta\n",
      expected_version: null,
    });
    fs.write("/canvas.svg", {
      content: "<svg/>\n<rect/>\n",
      expected_version: null,
    });
    return fs;
  }

  it("empty pattern returns no matches and scans nothing", () => {
    const r = seed().grep({ pattern: "" });
    expect(r.matches).toEqual([]);
    expect(r.files_scanned).toBe(0);
  });

  it("returns one entry per matching line with 1-indexed line numbers", () => {
    const r = seed().grep({ pattern: "alpha" });
    expect(r.files_scanned).toBe(3);
    expect(r.matches).toEqual([
      { path: "/notes/a.md", line: 1, text: "alpha" },
      { path: "/notes/a.md", line: 3, text: "gamma alpha" },
    ]);
  });

  it("is case-sensitive by default (matches one entry per matching line)", () => {
    const r = seed().grep({ pattern: "beta" });
    // "/notes/a.md" has BETA (uppercase) → no match
    // "/notes/b.md" line 1 "beta beta" → one entry (one line)
    expect(r.matches).toEqual([
      { path: "/notes/b.md", line: 1, text: "beta beta" },
    ]);
  });

  it("case_sensitive: false catches both cases (mirrors grep -i)", () => {
    const r = seed().grep({ pattern: "beta", case_sensitive: false });
    // a.md line 2 "BETA" + b.md line 1 "beta beta" → 2 matching lines.
    expect(r.matches).toEqual([
      { path: "/notes/a.md", line: 2, text: "BETA" },
      { path: "/notes/b.md", line: 1, text: "beta beta" },
    ]);
  });

  it("path_prefix narrows the scope", () => {
    const r = seed().grep({ pattern: "a", path_prefix: "/notes/" });
    expect(r.files_scanned).toBe(2);
    expect(r.matches.every((m) => m.path.startsWith("/notes/"))).toBe(true);
  });

  it("searches bound files via the binding (sees formatted output)", () => {
    const fs = new AgentFs(new AgentFs.MemoryBackend());
    const b = makeBinding('<svg>\n  <rect fill="red"/>\n</svg>');
    fs.mount("/canvas.svg", b);
    const r = fs.grep({ pattern: 'fill="red"' });
    expect(r.matches.length).toBe(1);
    expect(r.matches[0].path).toBe("/canvas.svg");
    expect(r.matches[0].line).toBe(2);
  });

  it("does NOT count as a read — subsequent edit still requires read_file", () => {
    const fs = new AgentFs(new AgentFs.MemoryBackend());
    const backend = new AgentFs.MemoryBackend();
    void backend; // unused
    fs.write("/notes.md", { content: "hello", expected_version: null });
    // simulate fresh session by hand: a write counts as a read, so use a fresh fs hydrated from backend.
    // Easier: assert via a second fs that loaded without a read.
    const b2Backend = new AgentFs.MemoryBackend();
    return (async () => {
      await b2Backend.write("/notes.md", "hello");
      const fs2 = new AgentFs(b2Backend);
      await fs2.hydrate();
      const r = fs2.grep({ pattern: "hello" });
      expect(r.matches.length).toBe(1);
      // Now editing should still fail with not_read because grep didn't set last_read.
      const e = fs2.edit("/notes.md", {
        old_string: "hello",
        new_string: "hi",
        expected_version: 0,
      });
      expect(e.ok).toBe(false);
      if (e.ok) return;
      expect(e.reason).toBe("not_read");
    })();
  });
});

describe("AgentFs.delete", () => {
  it("removes pure files", () => {
    const fs = new AgentFs(new AgentFs.MemoryBackend());
    fs.write("/notes.md", { content: "x", expected_version: null });
    expect(fs.delete("/notes.md").ok).toBe(true);
    expect(fs.exists("/notes.md")).toBe(false);
  });

  it("refuses mounted paths", () => {
    const fs = new AgentFs(new AgentFs.MemoryBackend());
    fs.mount("/canvas.svg", makeBinding());
    const r = fs.delete("/canvas.svg");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("mounted");
  });

  it("returns not_found for unknown paths", () => {
    const fs = new AgentFs(new AgentFs.MemoryBackend());
    const r = fs.delete("/missing");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("not_found");
  });
});

describe("AgentFs.hydrate", () => {
  it("loads pure files from backend into the fs", async () => {
    const backend = new AgentFs.MemoryBackend();
    await backend.write("/notes.md", "persisted!");
    const fs = new AgentFs(backend);
    await fs.hydrate();
    expect(fs.read("/notes.md")?.content).toBe("persisted!");
  });

  it("feeds persisted bytes into mounted bindings via binding.load", async () => {
    const backend = new AgentFs.MemoryBackend();
    await backend.write("/canvas.svg", "<svg/>");
    const fs = new AgentFs(backend);
    const b = makeBinding("");
    fs.mount("/canvas.svg", b);
    await fs.hydrate();
    expect(b.current()).toBe("<svg/>");
  });

  it("is idempotent — concurrent calls share one promise", async () => {
    const backend = new AgentFs.MemoryBackend();
    const spy = vi.spyOn(backend, "list");
    const fs = new AgentFs(backend);
    await Promise.all([fs.hydrate(), fs.hydrate(), fs.hydrate()]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  /**
   * Issue #786 — the read fan-out must be BOUNDED. The old
   * `Promise.allSettled(paths.map(read))` issued one concurrent read per path;
   * on a large backend that overflows V8's promise-combinator element cap and
   * exhausts file descriptors. A backend that reports many paths must hydrate
   * with a constant number of reads in flight.
   */
  it("reads with bounded concurrency over a large path list", async () => {
    const N = 5_000;
    let inFlight = 0;
    let maxInFlight = 0;
    // Backend that lists N synthetic paths and tracks peak read concurrency.
    const backend: AgentFs.Backend = {
      async list() {
        return Array.from({ length: N }, (_, i) => `/f${i}.txt`);
      },
      async read(path) {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        // Yield so concurrent reads actually overlap before resolving.
        await Promise.resolve();
        inFlight--;
        return `content:${path}`;
      },
      async write() {},
      async delete() {},
    };
    const fs = new AgentFs(backend);
    await fs.hydrate();

    // Every path materialized...
    expect(fs.list()).toHaveLength(N);
    expect(fs.read("/f0.txt")?.content).toBe("content:/f0.txt");
    expect(fs.read(`/f${N - 1}.txt`)?.content).toBe(`content:/f${N - 1}.txt`);
    // ...but never more than the fixed worker width at once. (24 is the
    // module constant; assert a small constant rather than ~N.)
    expect(maxInFlight).toBeLessThanOrEqual(24);
  });

  it("survives a per-read rejection without aborting the hydrate", async () => {
    const backend: AgentFs.Backend = {
      async list() {
        return ["/ok-a.txt", "/boom.txt", "/ok-b.txt"];
      },
      async read(path) {
        if (path === "/boom.txt") throw new Error("synthetic read failure");
        return `content:${path}`;
      },
      async write() {},
      async delete() {},
    };
    const fs = new AgentFs(backend);
    await fs.hydrate();
    // The good paths still load; the failed one is simply absent.
    expect(fs.read("/ok-a.txt")?.content).toBe("content:/ok-a.txt");
    expect(fs.read("/ok-b.txt")?.content).toBe("content:/ok-b.txt");
    expect(fs.read("/boom.txt")).toBeNull();
  });
});

describe("AgentFs — auto-flush (debounced)", () => {
  it("flushes pure-file writes to the backend after the debounce window", async () => {
    const backend = new AgentFs.MemoryBackend();
    const fs = new AgentFs(backend, { flush_debounce_ms: 10 });
    fs.write("/notes.md", { content: "hello", expected_version: null });
    expect(await backend.read("/notes.md")).toBeNull(); // not yet
    await tick(30);
    expect(await backend.read("/notes.md")).toBe("hello");
    fs.dispose();
  });

  it("flushes external binding edits via subscribe", async () => {
    const backend = new AgentFs.MemoryBackend();
    const fs = new AgentFs(backend, { flush_debounce_ms: 10 });
    const b = makeBinding("<svg/>");
    fs.mount("/canvas.svg", b);
    b.externalEdit("<svg><rect/></svg>");
    await tick(30);
    expect(await backend.read("/canvas.svg")).toBe("<svg><rect/></svg>");
    fs.dispose();
  });

  it("dispose() cancels pending flushes", async () => {
    const backend = new AgentFs.MemoryBackend();
    const fs = new AgentFs(backend, { flush_debounce_ms: 50 });
    fs.write("/notes.md", { content: "hello", expected_version: null });
    fs.dispose();
    await tick(80);
    expect(await backend.read("/notes.md")).toBeNull();
  });
});

describe("AgentFs.watch", () => {
  it("emits write events for pure-file writes", () => {
    const fs = new AgentFs(new AgentFs.MemoryBackend());
    const listener = vi.fn<AgentFs.Listener>();
    fs.watch(listener);
    fs.write("/notes.md", { content: "hello", expected_version: null });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      type: "write",
      path: "/notes.md",
      version: 1,
    });
  });

  it("emits write events for bound writes (binding-routed)", () => {
    const fs = new AgentFs(new AgentFs.MemoryBackend());
    const binding = makeBinding("initial");
    fs.mount("/doc.svg", binding);
    const listener = vi.fn<AgentFs.Listener>();
    fs.watch(listener);
    fs.write("/doc.svg", { content: "updated", expected_version: null });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      type: "write",
      path: "/doc.svg",
      version: 1,
    });
    expect(binding.current()).toBe("updated");
  });

  it("does not emit when a bound write throws parse_error", () => {
    const fs = new AgentFs(new AgentFs.MemoryBackend());
    fs.mount("/doc.svg", makeBinding("initial"));
    const listener = vi.fn<AgentFs.Listener>();
    fs.watch(listener);
    const r = fs.write("/doc.svg", {
      content: "PARSE_FAIL",
      expected_version: null,
    });
    expect(r.ok).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it("emits delete events", () => {
    const fs = new AgentFs(new AgentFs.MemoryBackend());
    fs.write("/notes.md", { content: "hello", expected_version: null });
    const listener = vi.fn<AgentFs.Listener>();
    fs.watch(listener);
    const r = fs.delete("/notes.md");
    expect(r.ok).toBe(true);
    expect(listener).toHaveBeenCalledWith({
      type: "delete",
      path: "/notes.md",
    });
  });

  it("does not emit delete for missing or mounted paths", () => {
    const fs = new AgentFs(new AgentFs.MemoryBackend());
    fs.mount("/doc.svg", makeBinding(""));
    const listener = vi.fn<AgentFs.Listener>();
    fs.watch(listener);
    expect(fs.delete("/missing.md").ok).toBe(false);
    expect(fs.delete("/doc.svg").ok).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it("emits on edit() commits", () => {
    const fs = new AgentFs(new AgentFs.MemoryBackend());
    fs.write("/notes.md", { content: "hello world", expected_version: null });
    const start = fs.read("/notes.md");
    expect(start).not.toBeNull();
    const listener = vi.fn<AgentFs.Listener>();
    fs.watch(listener);
    const r = fs.edit("/notes.md", {
      old_string: "world",
      new_string: "there",
      expected_version: start!.version,
    });
    expect(r.ok).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toMatchObject({
      type: "write",
      path: "/notes.md",
    });
  });

  it("unsubscribe stops further events", () => {
    const fs = new AgentFs(new AgentFs.MemoryBackend());
    const listener = vi.fn<AgentFs.Listener>();
    const unsub = fs.watch(listener);
    fs.write("/a.md", { content: "1", expected_version: null });
    unsub();
    fs.write("/b.md", { content: "2", expected_version: null });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("dispose() clears watchers", () => {
    const fs = new AgentFs(new AgentFs.MemoryBackend());
    const listener = vi.fn<AgentFs.Listener>();
    fs.watch(listener);
    fs.dispose();
    // After dispose, writes are no-ops anyway, but watchers should also be cleared.
    fs.write("/a.md", { content: "1", expected_version: null });
    expect(listener).not.toHaveBeenCalled();
  });

  it("a throwing listener doesn't break later listeners", () => {
    const fs = new AgentFs(new AgentFs.MemoryBackend());
    const bad = vi.fn<AgentFs.Listener>(() => {
      throw new Error("boom");
    });
    const good = vi.fn<AgentFs.Listener>();
    fs.watch(bad);
    fs.watch(good);
    // Suppress the console.warn from the catch in emit().
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fs.write("/notes.md", { content: "hello", expected_version: null });
    warn.mockRestore();
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
  });
});
