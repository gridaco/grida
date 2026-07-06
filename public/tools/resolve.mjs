// Resolver for the `public/` origin tree (see ../README.md).
//
// A publishing unit is a subdirectory with a `publish.json` map. This module
// discovers units, runs each unit's optional `build.mjs`, expands the map
// entries, validates the resulting URL registry, and writes the resolved
// manifest to `.dist/manifest.json` — the only artifact hosts consume.
//
// Map entry forms (the whole schema — nothing else, ever):
//   "file"        : "/exact/url"    file → exact URL
//   "dir/"        : "/prefix/"      dir  → URL prefix (recursive, as-is)
//   "out/*.zip"   : "/prefix/"      glob → URL prefix (single-`*`, one segment)

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

export const MAP_FILENAME = "publish.json";
export const MANIFEST_PATH = ".dist/manifest.json";

/** A publish-contract violation — always a hard build failure. */
export class PublishError extends Error {}

async function exists(p) {
  return fs.access(p).then(
    () => true,
    () => false
  );
}

/** URL rules: `/`-rooted, no `..`/`//`, no query/hash/backslash. */
function assertUrl(url, ctx) {
  const bad = (why) => {
    throw new PublishError(`${ctx}: invalid URL "${url}" — ${why}`);
  };
  if (typeof url !== "string" || !url.startsWith("/"))
    bad(`must start with "/"`);
  if (/[?#\\]/.test(url)) bad("query/hash/backslash not allowed");
  if (url.includes("//")) bad("empty path segment");
  if (url.split("/").includes("..")) bad(`".." segment`);
}

/** Source keys are unit-relative and must stay inside the unit. */
function assertSrcKey(key, ctx) {
  if (path.posix.isAbsolute(key) || key.split("/").includes(".."))
    throw new PublishError(
      `${ctx}: source "${key}" must be unit-relative (no "/" root, no "..")`
    );
}

/** Recursively list files under `dir`, as posix paths relative to `dir`. */
async function walk(dir) {
  const out = [];
  const entries = await fs.readdir(dir, {
    recursive: true,
    withFileTypes: true,
  });
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (e.name === ".DS_Store") continue;
    const abs = path.join(e.parentPath, e.name);
    out.push(path.relative(dir, abs).split(path.sep).join("/"));
  }
  return out.sort();
}

/** Minimal glob: literal dir part + a basename with `*` wildcards. No `**`. */
async function expandGlob(unitDir, pattern, ctx) {
  const dir = path.posix.dirname(pattern);
  const base = path.posix.basename(pattern);
  if (dir.includes("*") || base.includes("**"))
    throw new PublishError(
      `${ctx}: only single-segment "*" globs are supported: "${pattern}"`
    );
  const re = new RegExp(
    `^${base
      .split("*")
      .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*")}$`
  );
  const absDir = path.join(unitDir, dir);
  if (!(await exists(absDir))) return [];
  const names = (await fs.readdir(absDir)).filter((n) => re.test(n)).sort();
  return names.map((n) => (dir === "." ? n : `${dir}/${n}`));
}

/** Expand one `source → url` map entry into `{src, url}[]` (unit-relative src). */
async function expandEntry(unitDir, key, value, ctx) {
  assertSrcKey(key, ctx);
  assertUrl(value, ctx);
  if (key.endsWith("/")) {
    // dir → prefix (recursive as-is). Value must be a prefix.
    if (!value.endsWith("/"))
      throw new PublishError(
        `${ctx}: directory source "${key}" needs a "/"-terminated URL prefix`
      );
    const absDir = path.join(unitDir, key);
    if (!(await exists(absDir)))
      throw new PublishError(`${ctx}: mapped directory missing: "${key}"`);
    return (await walk(absDir)).map((rel) => ({
      src: key + rel,
      url: value + rel,
    }));
  }
  if (key.includes("*")) {
    // glob → prefix. Flattens to basename under the prefix.
    if (!value.endsWith("/"))
      throw new PublishError(
        `${ctx}: glob source "${key}" needs a "/"-terminated URL prefix`
      );
    const matches = await expandGlob(unitDir, key, ctx);
    if (matches.length === 0)
      throw new PublishError(`${ctx}: glob matched nothing: "${key}"`);
    return matches.map((src) => ({
      src,
      url: value + path.posix.basename(src),
    }));
  }
  // file → exact URL (or prefix + basename for convenience).
  if (!(await exists(path.join(unitDir, key))))
    throw new PublishError(`${ctx}: mapped file missing: "${key}"`);
  return [
    {
      src: key,
      url: value.endsWith("/") ? value + path.posix.basename(key) : value,
    },
  ];
}

/** Discover publishing units: direct subdirs of `root` holding a publish.json. */
export async function discoverUnits(root) {
  const units = [];
  for (const e of await fs.readdir(root, { withFileTypes: true })) {
    if (
      !e.isDirectory() ||
      e.name.startsWith(".") ||
      e.name === "node_modules" ||
      e.name === "tools"
    )
      continue;
    if (await exists(path.join(root, e.name, MAP_FILENAME))) units.push(e.name);
  }
  return units.sort();
}

/** Run a unit's build.mjs (if present) with the unit dir as cwd. */
async function buildUnit(root, unit) {
  const script = path.join(root, unit, "build.mjs");
  if (!(await exists(script))) return;
  await exec(process.execPath, [script], { cwd: path.join(root, unit) }).catch(
    (err) => {
      throw new PublishError(
        `unit "${unit}": build.mjs failed\n${err.stderr || err.message}`
      );
    }
  );
}

/**
 * The clean-tree contract: a unit build must not ADD unignored files — every
 * generated path must be covered by the unit's own `.gitignore`. Implemented
 * as a before/after `git status` snapshot so pre-existing uncommitted SOURCE
 * files (normal during development) never trip it.
 */
async function gitStatusSnapshot(root) {
  const inRepo = await exec("git", [
    "-C",
    root,
    "rev-parse",
    "--is-inside-work-tree",
  ]).then(
    () => true,
    () => false
  );
  if (!inRepo) return null; // e.g. a test fixture in a tmp dir
  const { stdout } = await exec("git", [
    "-C",
    root,
    "status",
    "--porcelain",
    "-uall",
    "--",
    ".",
  ]);
  return new Set(stdout.split("\n").filter(Boolean));
}

function assertNoNewUnignored(before, after) {
  if (before === null || after === null) return;
  const added = [...after].filter((line) => !before.has(line));
  if (added.length > 0)
    throw new PublishError(
      `build produced files that are not gitignored — add them to the unit's .gitignore:\n${added.join("\n")}`
    );
}

/**
 * Resolve the whole tree: build units, expand + validate maps, return the
 * manifest entries (URL-sorted). Pass `{ write: true }` to also persist
 * `.dist/manifest.json`.
 */
export async function resolve(root, opts = {}) {
  const entries = [];
  const byUrl = new Map();
  const before = await gitStatusSnapshot(root);
  for (const unit of await discoverUnits(root)) {
    await buildUnit(root, unit);
    const ctxUnit = `unit "${unit}"`;
    const raw = JSON.parse(
      await fs.readFile(path.join(root, unit, MAP_FILENAME), "utf8")
    );
    if (!raw || typeof raw.publish !== "object")
      throw new PublishError(
        `${ctxUnit}: ${MAP_FILENAME} must have a "publish" object`
      );
    for (const [key, value] of Object.entries(raw.publish)) {
      for (const { src, url } of await expandEntry(
        path.join(root, unit),
        key,
        value,
        `${ctxUnit}, "${key}"`
      )) {
        const prev = byUrl.get(url);
        if (prev)
          throw new PublishError(
            `URL collision: "${url}" published by both "${prev}" and "${unit}/${src}"`
          );
        byUrl.set(url, `${unit}/${src}`);
        entries.push({ unit, src, url });
      }
    }
  }
  entries.sort((a, b) => (a.url < b.url ? -1 : 1));
  assertNoNewUnignored(before, await gitStatusSnapshot(root));
  if (opts.write) {
    const file = path.join(root, MANIFEST_PATH);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(
      file,
      JSON.stringify({ version: 1, entries }, null, 2) + "\n"
    );
  }
  return entries;
}
