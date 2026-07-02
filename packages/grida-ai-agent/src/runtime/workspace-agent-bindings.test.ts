/**
 * GRIDA-SEC-004 — workspace agent fs path mapping.
 *
 * The agent reaches files two ways that must agree: the fs tools' logical
 * "/"-rooted path (where "/" is the workspace root) AND the REAL absolute path
 * it sees from the shell's cwd. Both must resolve to the same workspace file —
 * otherwise `write_file(<abs>)` followed by a shell `python3 <file>` reads from
 * a different place than it was written (the regression these pins guard: an
 * absolute path used to be treated as logical and land under a doubled
 * `<root>/<root>/…` path). Workspace containment is still enforced downstream.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WorkspaceRegistry } from "@grida/daemon/server";
import type { SecretsStore } from "@grida/daemon/server";
import {
  WorkspaceAgentFsBackend,
  createWorkspaceAgentBindings,
} from "./workspace-agent-bindings";

describe("WorkspaceAgentFsBackend — path mapping", () => {
  let baseDir: string;
  let workspaceRoot: string;
  let backend: WorkspaceAgentFsBackend;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-wsfs-"));
    const wsDir = path.join(baseDir, "ws");
    await fs.mkdir(wsDir);
    workspaceRoot = await fs.realpath(wsDir);
    const registry = new WorkspaceRegistry(path.join(baseDir, "ud"));
    const ws = await registry.open(workspaceRoot);
    backend = new WorkspaceAgentFsBackend(ws);
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it("maps a logical '/'-rooted path to the workspace root", async () => {
    await backend.write("/a.txt", "hello");
    expect(await fs.readFile(path.join(workspaceRoot, "a.txt"), "utf8")).toBe(
      "hello"
    );
    expect(await backend.read("/a.txt")).toBe("hello");
  });

  it("maps an absolute in-workspace path to the same file (no doubling)", async () => {
    const abs = path.join(workspaceRoot, "b.txt");
    await backend.write(abs, "world");
    // Lands at <root>/b.txt — not a doubled <root>/<root>/b.txt.
    expect(await fs.readFile(path.join(workspaceRoot, "b.txt"), "utf8")).toBe(
      "world"
    );
    // The doubled directory the old bug created must not exist.
    await expect(
      fs.access(path.join(workspaceRoot, workspaceRoot))
    ).rejects.toBeDefined();
    // Readable via the absolute path AND its logical form — one file.
    expect(await backend.read(abs)).toBe("world");
    expect(await backend.read("/b.txt")).toBe("world");
  });

  it("still rejects a path that escapes the workspace", async () => {
    await expect(backend.write("/../escape.txt", "x")).rejects.toBeDefined();
  });
});

/**
 * Issue #786 — the hydrate enumeration must be BOUNDED + FILTERED. An
 * unfiltered walk over a real project (`node_modules`, `.git`, build output)
 * returns the whole tree, which the downstream read fan-out then tries to
 * slurp at once → OOM / "Too many elements passed to Promise.all". These pin
 * that `list()` skips the heavy/generated subtrees while still surfacing the
 * real source files.
 */
describe("WorkspaceAgentFsBackend — bounded/filtered hydrate scan", () => {
  let baseDir: string;
  let workspaceRoot: string;
  let backend: WorkspaceAgentFsBackend;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-wsfs-scan-"));
    const wsDir = path.join(baseDir, "ws");
    await fs.mkdir(wsDir);
    workspaceRoot = await fs.realpath(wsDir);
    const registry = new WorkspaceRegistry(path.join(baseDir, "ud"));
    const ws = await registry.open(workspaceRoot);
    backend = new WorkspaceAgentFsBackend(ws);
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  async function writeFile(rel: string, content = "x"): Promise<void> {
    const abs = path.join(workspaceRoot, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content);
  }

  it("walks real source but skips node_modules / .git / build output", async () => {
    // Real source — must appear.
    await writeFile("src/index.ts");
    await writeFile("src/lib/util.ts");
    await writeFile("README.md");
    // Heavy/generated subtrees — must NOT appear. Seed each with enough
    // entries that a regression (no filtering) is unmistakable.
    for (let i = 0; i < 50; i++) {
      await writeFile(`node_modules/pkg${i}/index.js`);
      await writeFile(`node_modules/pkg${i}/nested/deep/file${i}.js`);
    }
    await writeFile(".git/objects/ab/cdef");
    await writeFile(".git/HEAD", "ref: refs/heads/main");
    await writeFile("dist/bundle.js");
    await writeFile("target/debug/artifact.bin");
    await writeFile(".next/cache/x");

    const listed = await backend.list();

    expect(listed).toContain("/src/index.ts");
    expect(listed).toContain("/src/lib/util.ts");
    expect(listed).toContain("/README.md");
    // None of the ignored subtrees leak in.
    expect(listed.some((p) => p.startsWith("/node_modules/"))).toBe(false);
    expect(listed.some((p) => p.startsWith("/.git/"))).toBe(false);
    expect(listed.some((p) => p.startsWith("/dist/"))).toBe(false);
    expect(listed.some((p) => p.startsWith("/target/"))).toBe(false);
    expect(listed.some((p) => p.startsWith("/.next/"))).toBe(false);
    // The whole tree had 100+ node_modules files; the bounded list is tiny.
    expect(listed).toHaveLength(3);
  });

  it("skips an ignored dir even when nested under real source", async () => {
    await writeFile("packages/app/src/main.ts");
    await writeFile("packages/app/node_modules/dep/index.js");
    await writeFile("packages/app/dist/out.js");

    const listed = await backend.list();

    expect(listed).toContain("/packages/app/src/main.ts");
    expect(listed.some((p) => p.includes("/node_modules/"))).toBe(false);
    expect(listed.some((p) => p.includes("/dist/"))).toBe(false);
  });

  /**
   * #786 follow-up (Codex review): a binary-heavy subtree that sorts BEFORE the
   * source must not consume the file cap. `read()` returns null for binary
   * content, so those paths never hydrate — counting them toward SCAN_MAX_FILES
   * would let an `assets/` of images starve the real source that sorts after
   * it. The walk must drop known-binary files at enumeration time.
   */
  it("does not let a binary asset subtree crowd out source files", async () => {
    // `assets` sorts before `src`; seed it with images that read() can't serve.
    for (let i = 0; i < 60; i++) {
      await writeFile(`assets/img${i}.png`);
      await writeFile(`assets/icon${i}.webp`);
    }
    await writeFile("assets/logo.svg"); // svg is text — must survive
    await writeFile("src/index.ts");
    await writeFile("src/app.tsx");

    const listed = await backend.list();

    expect(listed).toContain("/src/index.ts");
    expect(listed).toContain("/src/app.tsx");
    expect(listed).toContain("/assets/logo.svg");
    // No binary asset leaks in — neither the .png nor the .webp.
    expect(listed.some((p) => p.endsWith(".png"))).toBe(false);
    expect(listed.some((p) => p.endsWith(".webp"))).toBe(false);
    // 120 binaries dropped; only the 3 text files remain.
    expect(listed).toHaveLength(3);
  });
});

/**
 * GRIDA-SEC-004 — the supervised approval gate (RFC `permission modes`, Phase
 * 2) is wired here: the command capability's `needs_approval` predicate is the
 * single source the run_command tool's `needsApproval` reads. `accept-edits`
 * pauses a non-read-only command for Allow/Deny but auto-runs inspection; `auto`
 * supplies NO predicate (every command runs without asking).
 */
describe("createWorkspaceAgentBindings — supervised approval wiring", () => {
  let baseDir: string;
  let workspaceRoot: string;
  let registry: WorkspaceRegistry;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-wsbind-"));
    const wsDir = path.join(baseDir, "ws");
    await fs.mkdir(wsDir);
    workspaceRoot = await fs.realpath(wsDir);
    registry = new WorkspaceRegistry(path.join(baseDir, "ud"));
    await registry.open(workspaceRoot);
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it("accept-edits: pauses a mutating command, auto-runs a read-only one", async () => {
    const bindings = await createWorkspaceAgentBindings(
      { workspace_root: workspaceRoot, mode: "accept-edits" },
      { workspace_registry: registry, shell_execution_allowed: true }
    );
    const needsApproval = bindings?.command?.needs_approval;
    expect(needsApproval).toBeDefined();
    // A mutating/executing command requires approval...
    expect(needsApproval!({ command: "python3", args: ["x.py"] })).toBe(true);
    // ...a read-only inspection command does not.
    expect(needsApproval!({ command: "ls", args: ["-la"] })).toBe(false);
  });

  it("auto: supplies no approval predicate (every command auto-runs)", async () => {
    const bindings = await createWorkspaceAgentBindings(
      { workspace_root: workspaceRoot, mode: "auto" },
      { workspace_registry: registry, shell_execution_allowed: true }
    );
    expect(bindings?.command).toBeDefined();
    expect(bindings?.command?.needs_approval).toBeUndefined();
  });

  it("no shell containment: no command capability at all", async () => {
    const bindings = await createWorkspaceAgentBindings(
      { workspace_root: workspaceRoot, mode: "accept-edits" },
      { workspace_registry: registry, shell_execution_allowed: false }
    );
    expect(bindings?.command).toBeUndefined();
  });
});

/**
 * WG `scratch.md` — the session scratch dir is reachable through the shell. This
 * drives the REAL command backend (actual `child_process.spawn`) against a real
 * scratch dir to prove the deliverable's chain without a model: a command runs
 * with cwd INSIDE scratch and writes there (the extract-into-scratch shape, S4),
 * and a produced file is PROMOTED out into the workspace (S2). The scratch dir
 * lives in its own temp dir, outside both the workspace and the secret root.
 */
describe("createWorkspaceAgentBindings — scratch reach", () => {
  let baseDir: string;
  let workspaceRoot: string;
  let secretsRoot: string;
  let scratchRoot: string;
  let registry: WorkspaceRegistry;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-scratch-reach-"));
    const wsDir = path.join(baseDir, "ws");
    const udDir = path.join(baseDir, "ud");
    const scDir = path.join(baseDir, "scratch");
    await fs.mkdir(wsDir);
    await fs.mkdir(udDir);
    await fs.mkdir(scDir);
    workspaceRoot = await fs.realpath(wsDir);
    secretsRoot = await fs.realpath(udDir);
    scratchRoot = await fs.realpath(scDir);
    registry = new WorkspaceRegistry(udDir);
    await registry.open(workspaceRoot);
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it("surfaces the scratch dir on the command binding; default_workdir stays the workspace (S5)", async () => {
    const bindings = await createWorkspaceAgentBindings(
      { workspace_root: workspaceRoot, mode: "auto" },
      {
        workspace_registry: registry,
        shell_execution_allowed: true,
        secrets_root: secretsRoot,
        scratch_dir: scratchRoot,
      }
    );
    expect(bindings?.command?.scratch_dir).toBe(scratchRoot);
    // Scratch is NOT the default cwd — producing goes to scratch by choice, but
    // the agent's default shell context is still the user's project.
    expect(bindings?.command?.default_workdir).toBe(workspaceRoot);
  });

  it("wires scratch into the vision byte-reader — bindings.fs.readBytes reaches a scratch image (not shell-only)", async () => {
    // The fundamental fix: the same scratch_dir reaches the fs layer, so
    // view_image (readBytes, on-demand) sees scratch images. This pins the
    // WIRING (scratch_dir → fs backend), the gap behind the real session that
    // couldn't view what it generated into scratch.
    //
    // Pass scratch via a SYMLINK whose realpath differs (reproducing macOS
    // `/var`→`/private/var` portably): without realpath-normalizing the wired
    // root, `workspaceFs`'s realpath containment rejects every scratch path as
    // an escape — the exact live failure. The bindings must normalize the root.
    const realScratch = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), "grida-realscratch-"))
    );
    const linkScratch = path.join(baseDir, "scratch-link");
    await fs.symlink(realScratch, linkScratch);
    const bindings = await createWorkspaceAgentBindings(
      { workspace_root: workspaceRoot, mode: "auto" },
      {
        workspace_registry: registry,
        shell_execution_allowed: true,
        secrets_root: secretsRoot,
        scratch_dir: linkScratch, // raw, symlinked — realpath ≠ this
      }
    );
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await fs.writeFile(path.join(realScratch, "produced.png"), png);
    // The wired command binding exposes the normalized (real) scratch path —
    // that's the path the agent is told and uses.
    expect(bindings?.command?.scratch_dir).toBe(realScratch);
    const bytes = await bindings!.fs.readBytes(
      path.join(realScratch, "produced.png")
    );
    expect(bytes).not.toBeNull();
    expect(Buffer.from(bytes!)).toEqual(png);
    await fs.rm(realScratch, { recursive: true, force: true });
  });

  it("runs a command with cwd inside scratch and writes there, then promotes it out (S4 + S2)", async () => {
    const bindings = await createWorkspaceAgentBindings(
      { workspace_root: workspaceRoot, mode: "auto" },
      {
        workspace_registry: registry,
        shell_execution_allowed: true,
        secrets_root: secretsRoot,
        scratch_dir: scratchRoot,
      }
    );
    const backend = bindings!.command!.backend;
    // A "produced" file in the workspace stands in for an archive's contents.
    await fs.writeFile(
      path.join(workspaceRoot, "archive-contents.txt"),
      "extracted payload"
    );

    // Extract-into-scratch shape: cwd is scratch (only reachable via the
    // additional-allowed-root), the output lands in scratch.
    const extract = await backend({
      command: "cp",
      description: "extract into scratch",
      args: [path.join(workspaceRoot, "archive-contents.txt"), "extracted.txt"],
      workdir: scratchRoot,
    });
    expect("exit_code" in extract && extract.exit_code).toBe(0);
    expect(
      await fs.readFile(path.join(scratchRoot, "extracted.txt"), "utf8")
    ).toBe("extracted payload");

    // Promotion: move the produced file out of scratch into the workspace.
    const promote = await backend({
      command: "cp",
      description: "promote out of scratch",
      args: ["extracted.txt", path.join(workspaceRoot, "kept.txt")],
      workdir: scratchRoot,
    });
    expect("exit_code" in promote && promote.exit_code).toBe(0);
    expect(
      await fs.readFile(path.join(workspaceRoot, "kept.txt"), "utf8")
    ).toBe("extracted payload");
  });

  it("rejects a cwd in scratch when no scratch is wired (scratch is not a workspace)", async () => {
    const bindings = await createWorkspaceAgentBindings(
      { workspace_root: workspaceRoot, mode: "auto" },
      {
        workspace_registry: registry,
        shell_execution_allowed: true,
        secrets_root: secretsRoot,
        // no scratch_dir
      }
    );
    expect(bindings?.command?.scratch_dir).toBeUndefined();
    const result = await bindings!.command!.backend({
      command: "pwd",
      description: "probe scratch cwd",
      args: [],
      workdir: scratchRoot,
    });
    // The backend returns a structured failure (not a spawn result) when the
    // cwd is out of bounds.
    expect(result).toMatchObject({ ok: false, code: "cwd-not-in-workspace" });
  });
});

/**
 * WG `scratch.md` S3 — `generate_image` binding gating. The generator is wired
 * only when ALL of: the host enabled image gen, a scratch sink exists, and the
 * user actually holds a provider key (the vision-style "don't advertise an
 * unanswerable capability" gate). Generation itself is exercised by the live
 * test; here we pin the presence/absence of the binding, no provider call.
 */
describe("createWorkspaceAgentBindings — image_gen gating", () => {
  let baseDir: string;
  let workspaceRoot: string;
  let scratchRoot: string;
  let registry: WorkspaceRegistry;

  /** Fake SecretsStore exposing only the `_getKey` the gate reads. */
  function fakeSecrets(keys: Record<string, string>): SecretsStore {
    return {
      _getKey: async (id: string) => keys[id] ?? null,
    } as unknown as SecretsStore;
  }

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-imggen-gate-"));
    const wsDir = path.join(baseDir, "ws");
    const scDir = path.join(baseDir, "scratch");
    await fs.mkdir(wsDir);
    await fs.mkdir(scDir);
    workspaceRoot = await fs.realpath(wsDir);
    scratchRoot = await fs.realpath(scDir);
    registry = new WorkspaceRegistry(path.join(baseDir, "ud"));
    await registry.open(workspaceRoot);
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  async function build(deps: {
    secrets?: SecretsStore;
    image_gen_enabled?: boolean;
    scratch_dir?: string;
  }) {
    return createWorkspaceAgentBindings(
      { workspace_root: workspaceRoot, mode: "auto" },
      {
        workspace_registry: registry,
        shell_execution_allowed: true,
        ...deps,
      }
    );
  }

  it("wires generate_image when enabled, a scratch sink exists, and a key is present", async () => {
    const bindings = await build({
      secrets: fakeSecrets({ fal: "sk-fal" }),
      image_gen_enabled: true,
      scratch_dir: scratchRoot,
    });
    expect(bindings?.image_gen).toBeDefined();
  });

  it("no provider key ⇒ no image_gen binding", async () => {
    const bindings = await build({
      secrets: fakeSecrets({}),
      image_gen_enabled: true,
      scratch_dir: scratchRoot,
    });
    expect(bindings?.image_gen).toBeUndefined();
  });

  it("image gen disabled by the host ⇒ no binding even with a key", async () => {
    const bindings = await build({
      secrets: fakeSecrets({ fal: "sk-fal" }),
      image_gen_enabled: false,
      scratch_dir: scratchRoot,
    });
    expect(bindings?.image_gen).toBeUndefined();
  });

  it("no scratch sink ⇒ no binding (produced bytes have nowhere to land)", async () => {
    const bindings = await build({
      secrets: fakeSecrets({ fal: "sk-fal" }),
      image_gen_enabled: true,
      // no scratch_dir
    });
    expect(bindings?.image_gen).toBeUndefined();
  });
});

/**
 * Fundamental reach model (gridaco/grida#921 etiology): the agent's filesystem
 * reach is ONE notion shared by the fs tools and the shell — an absolute path
 * inside any sanctioned root (the workspace OR an additional root like scratch)
 * resolves within that root. Before this, scratch was reachable by the shell
 * but invisible to read_file/write_file/view_image (the bug a real session hit:
 * the agent couldn't view what it generated into scratch). These pin that the
 * structured fs backend reaches an additional root, while the logical "/" space
 * still defaults to the workspace.
 */
describe("WorkspaceAgentFsBackend — additional reachable roots (scratch)", () => {
  let baseDir: string;
  let workspaceRoot: string;
  let scratchRoot: string;
  let backend: WorkspaceAgentFsBackend;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-reach-"));
    const wsDir = path.join(baseDir, "ws");
    const scDir = path.join(baseDir, "scratch"); // sibling, OUTSIDE the workspace
    await fs.mkdir(wsDir);
    await fs.mkdir(scDir);
    workspaceRoot = await fs.realpath(wsDir);
    scratchRoot = await fs.realpath(scDir);
    const registry = new WorkspaceRegistry(path.join(baseDir, "ud"));
    const ws = await registry.open(workspaceRoot);
    backend = new WorkspaceAgentFsBackend(ws, [
      { id: "scratch", root: scratchRoot },
    ]);
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it("reads + writes an absolute path inside the scratch root (not the workspace)", async () => {
    const p = path.join(scratchRoot, "note.txt");
    await backend.write(p, "from scratch");
    // The file lands in scratch, NOT under the workspace.
    expect(await fs.readFile(path.join(scratchRoot, "note.txt"), "utf8")).toBe(
      "from scratch"
    );
    await expect(
      fs.access(path.join(workspaceRoot, "note.txt"))
    ).rejects.toBeDefined();
    // And reads back through the same scope.
    expect(await backend.read(p)).toBe("from scratch");
  });

  it("view_image (readBytes) can perceive an image sitting in scratch", async () => {
    // 1x1 PNG.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64"
    );
    await fs.writeFile(path.join(scratchRoot, "pixel.png"), png);
    const bytes = await backend.readBytes(path.join(scratchRoot, "pixel.png"));
    expect(bytes).not.toBeNull();
    expect(Buffer.from(bytes!)).toEqual(png);
  });

  it("a logical '/'-rooted path still maps to the WORKSPACE, not scratch", async () => {
    await backend.write("/in-ws.txt", "logical");
    expect(
      await fs.readFile(path.join(workspaceRoot, "in-ws.txt"), "utf8")
    ).toBe("logical");
    await expect(
      fs.access(path.join(scratchRoot, "in-ws.txt"))
    ).rejects.toBeDefined();
  });

  it("an absolute path under NO reachable root does not escape (reinterpreted workspace-relative)", async () => {
    // A path outside every reachable root is treated as workspace-relative — it
    // lands at <workspace>/etc/passwd, NOT the real system file. Safe (contained
    // to the workspace), and the same fallback the workspace-only mapping had.
    await backend.write("/etc/passwd", "x");
    expect(
      await fs.readFile(path.join(workspaceRoot, "etc/passwd"), "utf8")
    ).toBe("x");
    // The real system file is untouched.
    const realPasswd = await fs.readFile("/etc/passwd", "utf8");
    expect(realPasswd).not.toBe("x");
  });
});
