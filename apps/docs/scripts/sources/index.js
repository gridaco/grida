const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { build } = require("./build");

/**
 * Docs sources — docs authored in other repos, published on this site
 * (docs/wg/platform/docs-sources.md).
 *
 * - `sources.json` declares each source: repo, ref policy, published
 *   directories, and the asset rules every source follows.
 * - `sources.lock.json` pins each source to a commit. It is the only thing
 *   this repo stores about a source (DS-1, DS-2).
 * - The site build fetches each source at its pinned commit and writes the
 *   snapshot into the generated content dir (DS-3) — `materialize`.
 *
 * Ref policies: `"main"` (any branch) tracks the branch; `{ tag, version_of }`
 * follows the exact version a package in this repo pins.
 */

const SITE = path.resolve(__dirname, "../..");
const REPO = path.resolve(SITE, "../..");
const MANIFEST = path.join(SITE, "sources.json");
const LOCK = path.join(SITE, "sources.lock.json");
const CACHE = path.join(SITE, "node_modules/.cache/docs-sources");
const INDEX = path.join(CACHE, "materialized.json");

let manifest_cache;

/** @returns {{ assets: { types: string[]; max_bytes: number }; sources: Record<string, any> }} */
function read_manifest() {
  if (manifest_cache) return manifest_cache;
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  for (const [id, source] of Object.entries(manifest.sources)) {
    if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`bad source id "${id}"`);
    source.paths = Object.fromEntries(
      Object.entries(source.paths).map(([from, to]) => [
        from,
        typeof to === "string" ? { to } : to,
      ])
    );
    source.exclude ??= [];
  }
  return (manifest_cache = manifest);
}

function read_lock() {
  return fs.existsSync(LOCK) ? JSON.parse(fs.readFileSync(LOCK, "utf8")) : {};
}

function write_lock(lock) {
  const sorted = Object.fromEntries(Object.entries(lock).sort());
  fs.writeFileSync(LOCK, JSON.stringify(sorted, null, 2) + "\n");
}

/** The ref a source should be pinned to now: `{ ref, tag }`. */
function wanted_ref(source) {
  if (typeof source.ref === "string") return { ref: source.ref, tag: false };
  const { file, dependency } = source.ref.version_of;
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, file), "utf8"));
  const version = { ...pkg.dependencies, ...pkg.devDependencies }[dependency];
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version ?? "")) {
    throw new Error(
      `${file} must pin ${dependency} to an exact version, found "${version}"`
    );
  }
  return { ref: source.ref.tag.replace("{version}", version), tag: true };
}

// ---------------------------------------------------------------------------
// snapshots: a source repo at one revision, as { commit, files, read }

function git(cwd, args, opts = {}) {
  return execFileSync("git", args, {
    cwd,
    encoding: opts.encoding ?? "utf8",
    stdio: ["ignore", "pipe", opts.quiet ? "ignore" : "inherit"],
    maxBuffer: 256 * 1024 * 1024,
  });
}

/** Private sources: `DOCS_SOURCES_TOKEN`, sent the way actions/checkout does. */
function auth_args() {
  const token = process.env.DOCS_SOURCES_TOKEN;
  if (!token) return [];
  const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
  return [
    "-c",
    `http.https://github.com/.extraheader=AUTHORIZATION: basic ${basic}`,
  ];
}

function published_dirs(repo) {
  return Object.values(read_manifest().sources)
    .filter((s) => s.repo === repo)
    .flatMap((s) => Object.keys(s.paths));
}

function from_dir(commit, files, dir) {
  return {
    commit,
    files,
    read: (p) => fs.readFileSync(path.join(dir, p)),
  };
}

/**
 * Fetches the published directories of `repo` at `rev` (a tag, branch or
 * commit) from GitHub — a shallow, blob-less, sparse fetch, so only the
 * published files are downloaded. Cached by commit.
 */
function fetch_snapshot(repo, rev) {
  if (/^[0-9a-f]{40}$/.test(rev)) {
    const cached = read_cache(repo, rev);
    if (cached) return cached;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "docs-source-"));
  try {
    git(tmp, ["init", "-q"]);
    // a named remote: partial clone needs one to lazily fetch blobs
    git(tmp, ["remote", "add", "origin", `https://github.com/${repo}.git`]);
    git(tmp, [
      ...auth_args(),
      "fetch",
      "-q",
      "--depth=1",
      "--filter=blob:none",
      "origin",
      rev,
    ]);
    const commit = git(tmp, ["rev-parse", "FETCH_HEAD^{commit}"]).trim();
    const cached = read_cache(repo, commit);
    if (cached) return cached;
    git(tmp, [
      "sparse-checkout",
      "set",
      "--no-cone",
      ...published_dirs(repo).map((d) => `/${d}/`),
    ]);
    git(tmp, [...auth_args(), "checkout", "-q", commit]);
    const files = git(tmp, ["ls-tree", "-r", "--name-only", commit])
      .split("\n")
      .filter(Boolean);
    return write_cache(repo, commit, files, tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Keyed by commit and by which directories were taken from it. */
function cache_dir(repo, commit) {
  const key = require("crypto")
    .createHash("sha1")
    .update(published_dirs(repo).sort().join("\n"))
    .digest("hex")
    .slice(0, 8);
  return path.join(CACHE, repo, `${commit}-${key}`);
}

function read_cache(repo, commit) {
  const dir = cache_dir(repo, commit);
  const list = path.join(dir, ".files");
  if (!fs.existsSync(list)) return null;
  const files = new Set(
    fs.readFileSync(list, "utf8").split("\n").filter(Boolean)
  );
  return from_dir(commit, files, dir);
}

function write_cache(repo, commit, files, checkout) {
  const dir = cache_dir(repo, commit);
  fs.rmSync(dir, { recursive: true, force: true });
  for (const d of published_dirs(repo)) {
    if (fs.existsSync(path.join(checkout, d))) {
      fs.cpSync(path.join(checkout, d), path.join(dir, d), { recursive: true });
    }
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, ".files"), files.join("\n"));
  return from_dir(commit, new Set(files), dir);
}

/** A local clone at `rev`; prefers the clone's view of upstream (`origin/<rev>`). */
function local_snapshot(repo, dir, rev) {
  const candidates = [`refs/remotes/origin/${rev}`, rev];
  const commit = candidates
    .map((c) => {
      try {
        return git(dir, ["rev-parse", "--verify", "-q", `${c}^{commit}`], {
          quiet: true,
        }).trim();
      } catch {
        return "";
      }
    })
    .find(Boolean);
  if (!commit) throw new Error(`${dir}: no such ref "${rev}"`);
  const cached = read_cache(repo, commit);
  if (cached) return cached;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "docs-source-"));
  try {
    const tar = git(
      dir,
      ["archive", "--format=tar", commit, "--", ...published_dirs(repo)],
      { encoding: "buffer" }
    );
    execFileSync("tar", ["-x", "-C", tmp], { input: tar });
    const files = git(dir, ["ls-tree", "-r", "--name-only", commit])
      .split("\n")
      .filter(Boolean);
    return write_cache(repo, commit, files, tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** A working tree as it is now, uncommitted changes included (`check`). */
function worktree_snapshot(dir) {
  const files = git(dir, ["ls-files", "-co", "--exclude-standard"])
    .split("\n")
    .filter(Boolean);
  let commit = "HEAD";
  try {
    commit = git(dir, ["rev-parse", "HEAD"], { quiet: true }).trim();
  } catch {}
  return from_dir(commit, new Set(files), dir);
}

/**
 * Local checkouts to read instead of GitHub: `{ "gridaco/fx": "../fx" }`, from
 * `--local` or `DOCS_SOURCES_LOCAL="gridaco/fx=../fx,…"` (paths relative to
 * the repo root).
 */
function local_overrides(extra = {}) {
  const out = {};
  for (const pair of (process.env.DOCS_SOURCES_LOCAL ?? "").split(",")) {
    const [repo, dir] = pair.split("=");
    if (repo && dir) out[repo] = path.resolve(REPO, dir);
  }
  for (const [repo, dir] of Object.entries(extra))
    out[repo] = path.resolve(dir);
  return out;
}

function snapshot_of(source, rev, local) {
  return local[source.repo]
    ? local_snapshot(source.repo, local[source.repo], rev)
    : fetch_snapshot(source.repo, rev);
}

// ---------------------------------------------------------------------------
// commands

function format_problems(id, problems) {
  return problems.map(
    (p) => `${id}: ${p.file}${p.target ? ` → ${p.target}` : ""}: ${p.reason}`
  );
}

/**
 * Moves pins: resolves each source's ref policy (or `ref`) to a commit,
 * builds it to prove it passes the source rules, and records it.
 * Never writes content into this repo.
 */
function sync({ ids, ref: override, local: extra } = {}) {
  const manifest = read_manifest();
  const lock = read_lock();
  const local = local_overrides(extra);
  ids = ids?.length ? ids : Object.keys(manifest.sources);
  if (override && ids.length !== 1) {
    throw new Error("--ref needs exactly one source");
  }

  const failed = [];
  for (const id of ids) {
    const source = manifest.sources[id];
    if (!source) throw new Error(`unknown source "${id}"`);
    const wanted = override
      ? { ref: override, tag: false }
      : wanted_ref(source);
    const snap = snapshot_of(source, wanted.ref, local);
    const tag = wanted.tag ? wanted.ref : null;
    const { files, problems } = build({
      source,
      manifest,
      snapshot: snap,
      tag,
    });
    if (problems.length) {
      failed.push(...format_problems(id, problems));
      continue;
    }
    const before = lock[id];
    lock[id] = { repo: source.repo, ref: wanted.ref, commit: snap.commit };
    const moved =
      before && before.commit !== snap.commit
        ? ` — https://github.com/${source.repo}/compare/${before.commit.slice(0, 12)}...${snap.commit.slice(0, 12)}`
        : before
          ? " (unchanged)"
          : "";
    console.log(
      `[sources] ${id}: ${source.repo}@${wanted.ref} → ${snap.commit.slice(0, 12)}, ${files.size} files${moved}`
    );
  }

  for (const id of Object.keys(lock))
    if (!manifest.sources[id]) delete lock[id];
  write_lock(lock);
  if (failed.length) {
    throw new Error(
      `not pinned — the source rules fail:\n  ${failed.join("\n  ")}`
    );
  }
}

/**
 * What a site PR must satisfy: every source is pinned, every version-of pin
 * agrees with its package, and every pinned revision passes the source rules
 * and claims no path a native page has (DS-2, DS-3, DS-6).
 */
function verify({ local: extra } = {}) {
  const manifest = read_manifest();
  const lock = read_lock();
  const local = local_overrides(extra);
  const problems = [];

  for (const [id, source] of Object.entries(manifest.sources)) {
    const pin = lock[id];
    if (!pin) {
      problems.push(`${id}: not pinned — run sources:sync ${id}`);
      continue;
    }
    const wanted = wanted_ref(source);
    if (wanted.tag && wanted.ref !== pin.ref) {
      problems.push(
        `${id}: ${source.ref.version_of.file} wants ${wanted.ref}, pinned ${pin.ref} — run sources:sync ${id}`
      );
      continue;
    }
    const snap = snapshot_of(source, pin.commit, local);
    const r = build({
      source,
      manifest,
      snapshot: snap,
      tag: wanted.tag ? pin.ref : null,
    });
    problems.push(...format_problems(id, r.problems));
  }
  for (const id of Object.keys(lock)) {
    if (!manifest.sources[id]) problems.push(`${id}: pinned but not declared`);
  }
  if (!problems.length) {
    try {
      plan(path.join(REPO, "docs"), local);
    } catch (e) {
      problems.push(e.message);
    }
  }
  return problems;
}

/**
 * What a source PR must satisfy: its working tree passes the source rules for
 * every source declared on `repo` — run by the source repo's CI.
 */
function check({ repo, dir }) {
  const manifest = read_manifest();
  const snap = worktree_snapshot(path.resolve(dir));
  const ids = Object.keys(manifest.sources).filter(
    (id) => manifest.sources[id].repo === repo
  );
  if (!ids.length) throw new Error(`no docs source is declared for ${repo}`);
  const problems = [];
  for (const id of ids) {
    const source = manifest.sources[id];
    const r = build({ source, manifest, snapshot: snap, tag: null });
    problems.push(...format_problems(id, r.problems));
    console.log(`[sources] ${id}: ${r.files.size} files`);
  }
  return problems;
}

/** Every source's files at its pin, keyed by site path; throws on DS-6. */
function plan(docs_dir, local) {
  const manifest = read_manifest();
  const lock = read_lock();
  const native = new Set();
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(docs_dir, rel), {
      withFileTypes: true,
    })) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p);
      else native.add(p);
    }
  };
  walk("");

  const out = new Map();
  const collisions = [];
  for (const [id, source] of Object.entries(manifest.sources)) {
    const pin = lock[id];
    if (!pin) throw new Error(`docs source ${id} is not pinned`);
    const snap = snapshot_of(source, pin.commit, local);
    const tag = typeof source.ref === "string" ? null : pin.ref;
    const r = build({ source, manifest, snapshot: snap, tag });
    if (r.problems.length) {
      throw new Error(
        `docs source ${id} @ ${pin.commit.slice(0, 12)} fails the source rules:\n  ${format_problems(id, r.problems).join("\n  ")}`
      );
    }
    for (const [site, bytes] of r.files) {
      const owner = native.has(site) ? "docs/" : out.get(site)?.id;
      if (owner) collisions.push(`${site} (${id} vs ${owner})`);
      const from = Object.entries(source.paths).find(([, { to }]) =>
        site.startsWith(to + "/")
      );
      out.set(site, {
        id,
        bytes,
        edit: `https://github.com/${source.repo}/edit/${source.edit_branch ?? "main"}/${from[0]}/${site.slice(from[1].to.length + 1)}`,
      });
    }
  }
  if (collisions.length) {
    throw new Error(
      `docs sources collide with existing pages:\n  ${collisions.join("\n  ")}`
    );
  }
  return out;
}

/**
 * The build step (DS-3): writes every source's snapshot into the generated
 * content dir. Strict by default — a source that cannot be fetched or fails
 * the source rules fails the build. `optional` (a dependency install, local
 * development) skips sources with a warning instead.
 */
function materialize(docs_dir, dest, { optional = false } = {}) {
  let files;
  try {
    files = plan(docs_dir, local_overrides());
  } catch (e) {
    if (optional) {
      console.warn(
        `[sources] skipped docs sources: ${e.message.split("\n")[0]}`
      );
      return;
    }
    throw e;
  }
  const index = {};
  for (const [site, { bytes, edit }] of files) {
    const to = path.join(dest, site);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, bytes);
    index[site] = edit;
  }
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(INDEX, JSON.stringify(index));
  console.log(
    `[sources] ${files.size} files from ${Object.keys(read_lock()).length} sources`
  );
}

/** DS-9 — "edit this page" for a synced page opens its source; null otherwise. */
function edit_url(doc_path) {
  if (!edit_url.index) {
    edit_url.index = fs.existsSync(INDEX)
      ? JSON.parse(fs.readFileSync(INDEX, "utf8"))
      : {};
  }
  return edit_url.index[doc_path] ?? null;
}

module.exports = {
  read_manifest,
  read_lock,
  wanted_ref,
  sync,
  verify,
  check,
  materialize,
  edit_url,
};
