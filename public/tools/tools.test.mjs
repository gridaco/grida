// Contract pins for the `public/` origin-tree tooling (see ../README.md).
//
// Synthetic units run in tmp dirs (outside git → the clean-tree snapshot is
// skipped there); the git guards get their own throwaway repos; determinism
// and the zip→dotcanvas roundtrip pin the REAL slides-templates unit.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import { dotcanvas } from "dotcanvas";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { materialize } from "./materialize.mjs";
import { resolve } from "./resolve.mjs";

const PUBLIC_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

async function makeRoot(units) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "grida-public-"));
  for (const [unit, files] of Object.entries(units)) {
    for (const [rel, content] of Object.entries(files)) {
      const file = path.join(root, unit, rel);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, content);
    }
  }
  return root;
}
const map = (publish) => JSON.stringify({ publish });

describe("resolve", () => {
  let root;
  afterEach(async () => {
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it("static unit: dir/ → prefix publishes a committed tree as-is", async () => {
    root = await makeRoot({
      schemas: {
        "publish.json": map({ "json/": "/schema/" }),
        "json/dotcanvas/v1.json": "{}",
        "json/other.json": "{}",
        "json/.DS_Store": "junk",
      },
    });
    const entries = await resolve(root);
    expect(entries.map((e) => e.url)).toEqual([
      "/schema/dotcanvas/v1.json",
      "/schema/other.json",
    ]);
  });

  it("file → exact URL, and file → prefix/ appends the basename", async () => {
    root = await makeRoot({
      u: {
        "publish.json": map({ "a.txt": "/x/renamed.txt", "b.txt": "/y/" }),
        "a.txt": "a",
        "b.txt": "b",
      },
    });
    const urls = (await resolve(root)).map((e) => e.url);
    expect(urls).toEqual(["/x/renamed.txt", "/y/b.txt"]);
  });

  it("glob → prefix flattens matches; glob needs a '/'-terminated URL", async () => {
    root = await makeRoot({
      u: {
        "publish.json": map({ "out/*.zip": "/dl/" }),
        "out/a.zip": "a",
        "out/b.zip": "b",
        "out/skip.txt": "s",
      },
    });
    expect((await resolve(root)).map((e) => e.url)).toEqual([
      "/dl/a.zip",
      "/dl/b.zip",
    ]);

    await fs.writeFile(
      path.join(root, "u", "publish.json"),
      map({ "out/*.zip": "/dl/exact" })
    );
    await expect(resolve(root)).rejects.toThrow(/"\/"-terminated/);
  });

  it("rejects cross-unit URL collisions", async () => {
    root = await makeRoot({
      one: { "publish.json": map({ "f.txt": "/same" }), "f.txt": "1" },
      two: { "publish.json": map({ "g.txt": "/same" }), "g.txt": "2" },
    });
    await expect(resolve(root)).rejects.toThrow(/URL collision: "\/same"/);
  });

  it("rejects mapped-but-missing sources and hostile URLs/keys", async () => {
    root = await makeRoot({ u: { "publish.json": map({ "gone.txt": "/g" }) } });
    await expect(resolve(root)).rejects.toThrow(/mapped file missing/);

    await fs.writeFile(
      path.join(root, "u", "publish.json"),
      map({ "f.txt": "/a/../b" })
    );
    await fs.writeFile(path.join(root, "u", "f.txt"), "x");
    await expect(resolve(root)).rejects.toThrow(/".." segment/);

    await fs.writeFile(
      path.join(root, "u", "publish.json"),
      map({ "../f.txt": "/b" })
    );
    await expect(resolve(root)).rejects.toThrow(/unit-relative/);
  });

  it("runs a unit's build.mjs before resolving its map", async () => {
    root = await makeRoot({
      u: {
        "publish.json": map({ "out/built.txt": "/built.txt" }),
        "build.mjs": `import fs from "node:fs/promises";
await fs.mkdir("out", { recursive: true });
await fs.writeFile("out/built.txt", "built");`,
      },
    });
    expect((await resolve(root)).map((e) => e.url)).toEqual(["/built.txt"]);
  });
});

describe("materialize", () => {
  let root, target;
  beforeEach(async () => {
    root = await makeRoot({
      u: { "publish.json": map({ "f.txt": "/pub/f.txt" }), "f.txt": "hello" },
    });
    await resolve(root, { write: true });
    target = await fs.mkdtemp(path.join(os.tmpdir(), "grida-host-"));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(target, { recursive: true, force: true });
  });

  const git = (...args) =>
    execFileSync("git", ["-C", target, ...args], { stdio: "pipe" });

  it("copies manifest entries to <target><url>", async () => {
    await materialize(root, target);
    expect(await fs.readFile(path.join(target, "pub", "f.txt"), "utf8")).toBe(
      "hello"
    );
  });

  it("refuses a URL that escapes the target root", async () => {
    // Forge a manifest with an escaping URL (resolve() would already reject it).
    const mf = path.join(root, ".dist", "manifest.json");
    await fs.writeFile(
      mf,
      JSON.stringify({
        version: 1,
        entries: [{ unit: "u", src: "f.txt", url: "/../oops" }],
      })
    );
    await expect(materialize(root, target)).rejects.toThrow(
      /escapes the target root/
    );
  });

  it("refuses to overwrite a git-tracked host file", async () => {
    git("init", "-q");
    git("config", "user.email", "t@t");
    git("config", "user.name", "t");
    await fs.mkdir(path.join(target, "pub"), { recursive: true });
    await fs.writeFile(path.join(target, "pub", "f.txt"), "precious");
    git("add", ".");
    git("commit", "-qm", "host file");
    await expect(materialize(root, target)).rejects.toThrow(/git-tracked/);
  });

  it("requires synced paths to be gitignored on the host", async () => {
    git("init", "-q");
    await expect(materialize(root, target)).rejects.toThrow(
      /not gitignored on the host/
    );
    await fs.writeFile(path.join(target, ".gitignore"), "/pub/\n");
    await materialize(root, target); // now passes
    expect(await fs.readFile(path.join(target, "pub", "f.txt"), "utf8")).toBe(
      "hello"
    );
  });
});

describe("slides-templates unit (the real tenant)", () => {
  it("build is deterministic: rebuild → byte-identical zips", async () => {
    const build = () =>
      execFileSync(
        process.execPath,
        [path.join(PUBLIC_ROOT, "slides-templates", "build.mjs")],
        {
          cwd: path.join(PUBLIC_ROOT, "slides-templates"),
        }
      );
    const hash = async () => {
      const out = path.join(PUBLIC_ROOT, "slides-templates", "out");
      const h = createHash("sha256");
      for (const f of (await fs.readdir(out)).sort())
        h.update(await fs.readFile(path.join(out, f)));
      return h.digest("hex");
    };
    build();
    const first = await hash();
    build();
    expect(await hash()).toBe(first);
  });

  it("zip → in-memory fs → dotcanvas.read roundtrip preserves the deck contract", async () => {
    const zipPath = path.join(
      PUBLIC_ROOT,
      "slides-templates",
      "out",
      "startup-pitch.canvas.zip"
    );
    const entries = unzipSync(new Uint8Array(await fs.readFile(zipPath)));
    const dec = new TextDecoder();
    // The ~5-line ReadableFs shim — the same shape the editor loader uses.
    const zipFs = {
      list: async () => Object.keys(entries),
      read: async (p) => (p in entries ? dec.decode(entries[p]) : null),
    };
    const canvas = await dotcanvas.read(zipFs);
    expect(canvas.editor).toBe("slides");
    expect(canvas.documents.map((d) => d.id).slice(0, 3)).toEqual([
      "cover",
      "problem",
      "why-now",
    ]);
    expect(canvas.documents).toHaveLength(12);
    const ext = canvas.manifest?.ext?.["co.grida.templates"];
    expect(ext?.title).toBe("Startup Pitch");
    expect(ext?.prompt).toMatch(/pitch deck/);
    expect(canvas.warnings).toEqual([]);
  });
});
