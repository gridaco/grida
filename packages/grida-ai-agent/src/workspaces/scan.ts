/**
 * Workspace hydrate-scan policy (issue #786).
 *
 * When a workspace-bound agent starts, it hydrates a virtual filesystem over
 * the opened workspace — it enumerates the tree so the model's `list_files` /
 * `read_file` tools have something to see. Left unbounded, that walk reads
 * every path in the repo: `node_modules`, `.git`, build output, caches — a
 * real project is hundreds of thousands to millions of entries, which
 * overflows the read fan-out (`AgentFs` runHydrate) and OOMs the host. The
 * run then dies before the model ever speaks; the client only sees a dropped
 * stream ("network error").
 *
 * This module is the scan half of the bound: which directories the hydrate
 * walk must NOT descend into, and the hard caps that stop a pathological tree
 * (no ignored dirs, just genuinely huge) regardless. It is a sibling to
 * `fs/scope.ts` (the no-clobber WRITE policy): both are hand-maintained lists
 * that fail safe — a gap here costs a slower-than-ideal scan, never a
 * correctness breach (the agent can still reach any path on demand via the
 * shell, or `read_file` once it's listed).
 *
 * NOTE this is deliberately a curated heuristic, not a `.gitignore` engine.
 * The ignored set targets the well-known dependency / VCS / build / cache
 * directories of this repo's ecosystems (JS/TS, Rust, Python). Honoring a
 * project's own `.gitignore` is a reasonable future refinement; it is not
 * required to stop the blow-up, and parsing gitignore semantics correctly is
 * its own surface.
 *
 * Distinct from `fs/scope.ts`: that set is no-CLOBBER (`.git` is protected
 * from writes; `node_modules` is NOT, because the agent may legitimately
 * write there via the package manager). This set is no-SCAN: both `.git` and
 * `node_modules` are skipped because hydrating them is pure waste. The two
 * lists overlap but answer different questions, so they stay separate.
 */

/**
 * Directory basenames the hydrate walk skips entirely (the whole subtree).
 * Matched by basename anywhere in the tree — a `node_modules` at any depth is
 * skipped, mirroring `scope.ts`'s segment match.
 */
const IGNORED_SCAN_DIRS: ReadonlySet<string> = new Set([
  // VCS
  ".git",
  ".hg",
  ".svn",
  // JS/TS dependencies + package-manager state
  "node_modules",
  ".pnpm",
  ".yarn",
  "bower_components",
  // build / framework output
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".output",
  // caches / coverage / test output
  ".cache",
  ".parcel-cache",
  "coverage",
  ".nyc_output",
  // Rust / native build output
  "target",
  // Python virtualenvs + caches
  ".venv",
  "venv",
  "__pycache__",
  ".mypy_cache",
  ".pytest_cache",
  ".tox",
  // IaC / editor caches that bloat without being source
  ".terraform",
  ".gradle",
]);

/**
 * Hard cap on the number of files the hydrate walk enumerates. A real source
 * tree (ignored dirs removed) is comfortably under this; the cap exists so a
 * pathological tree — one genuinely full of source files, or a directory
 * named in none of the ignore entries that nonetheless holds a million
 * files — still terminates with a bounded, usable file list instead of
 * exhausting memory. On overflow the caller warns and proceeds with the
 * truncated list (the agent reaches the rest via the shell).
 */
export const SCAN_MAX_FILES = 10_000;

/**
 * Backstop on recursion depth. Normal trees are well under this; the cap
 * guards against an accidentally-deep or adversarial layout. Symlinked
 * directories are reported as `symlink` (never recursed), so this is not the
 * cycle guard — it's a depth sanity bound.
 */
export const SCAN_MAX_DEPTH = 32;

/**
 * Whether the hydrate walk should skip a directory with this basename
 * (and its whole subtree). `name` is the entry basename, not a path.
 */
export function isIgnoredScanDir(name: string): boolean {
  return IGNORED_SCAN_DIRS.has(name);
}
