/**
 * PATH-independent command resolution for the Claude agent-provider (issue
 * #813 / #871 part 2). A GUI-launched desktop app inherits a STRIPPED `PATH`
 * (Finder/Dock give it `/usr/bin:/bin:/usr/sbin:/sbin`, not the user's shell
 * PATH) — so `npx`, `node`, and the user's `claude` that live under Homebrew,
 * the native installer, or a Node version manager are unfindable. Both the
 * detect probe ({@link ./detect}) and the bridge spawn ({@link ./claude})
 * search/run against the AUGMENTED PATH this module builds: the inherited PATH
 * plus a declarative list of well-known install dirs.
 *
 * Deliberately the SIMPLE approach: a static, maintainable dir list — not the
 * login-shell-env-capture technique (spawn the user's shell, parse its env).
 * The list covers the common installs (Homebrew, the native `~/.local/bin`
 * installer, npm-global, the version-manager SHIM dirs). Exotic setups that
 * miss surface as "not installed" in onboarding, not a crash — login-shell
 * capture is the documented future upgrade if the list proves insufficient.
 *
 * Pure given (env, platform, homedir) — all injectable for tests, so the
 * Windows path/PATHEXT logic is verifiable on a POSIX CI host.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type ResolveContext = {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homedir?: string;
  /** Existence check seam — defaults to a real `fs.existsSync` probe. */
  exists?: (p: string) => boolean;
};

type Resolved = {
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  home: string;
  exists: (p: string) => boolean;
  /** The `path` variant for the target platform (win32 vs posix separators). */
  p: path.PlatformPath;
};

export namespace claude_path {
  function resolveContext(ctx: ResolveContext): Resolved {
    const platform = ctx.platform ?? process.platform;
    return {
      env: ctx.env ?? process.env,
      platform,
      home: ctx.homedir ?? os.homedir(),
      exists: ctx.exists ?? defaultExists,
      p: platform === "win32" ? path.win32 : path.posix,
    };
  }

  /**
   * Well-known install dirs (existence not yet checked), in PREFERENCE order
   * AFTER the inherited PATH. Home-relative so they track the real user. The
   * version-manager entries are SHIM dirs only (version-stable); per-version
   * `node/<v>/bin` enumeration is intentionally skipped (it rots, and a
   * version-manager `claude` is almost always also on a shim or `~/.local/bin`).
   */
  function wellKnownDirs(c: Resolved): string[] {
    const { p, home, env } = c;
    if (c.platform === "win32") {
      const appData = env.APPDATA ?? p.join(home, "AppData", "Roaming");
      return [
        p.join(home, "scoop", "shims"),
        p.join(appData, "npm"),
        p.join(home, ".bun", "bin"),
        p.join(home, ".cargo", "bin"),
        p.join(home, ".local", "bin"),
      ];
    }
    const npmPrefix = env.npm_config_prefix;
    return [
      // user-writable installs first — what the user most likely has
      p.join(home, ".local", "bin"), // native Claude installer; pipx; uv
      "/opt/homebrew/bin", // Homebrew (Apple silicon)
      "/usr/local/bin", // Homebrew (Intel) / manual installs
      p.join(home, ".npm-global", "bin"), // common npm prefix override
      ...(npmPrefix ? [p.join(npmPrefix, "bin")] : []),
      p.join(home, ".bun", "bin"),
      p.join(home, ".cargo", "bin"),
      // version-manager shims (stable; not per-version dirs)
      p.join(home, ".local", "share", "mise", "shims"),
      p.join(home, ".fnm"),
      // POSIX system bins — present in a stripped GUI PATH already, but
      // included so `resolve` works even when PATH is empty (and to find
      // `/usr/bin/env`, which npx-shebang lookups need).
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
    ];
  }

  /**
   * The inherited `PATH` followed by the existing well-known dirs, deduped,
   * order-preserving (inherited entries win). This is the search space for
   * {@link resolve} and the value passed to a child's `env.PATH`.
   */
  export function augmentedSearchDirs(ctx: ResolveContext = {}): string[] {
    const c = resolveContext(ctx);
    const inherited = (c.env.PATH ?? "").split(c.p.delimiter).filter(Boolean);
    const seen = new Set<string>();
    const out: string[] = [];
    const push = (dir: string) => {
      if (!dir || seen.has(dir)) return;
      seen.add(dir);
      out.push(dir);
    };
    // Inherited PATH is trusted as-is (don't stat — it's the user's explicit
    // config and may include not-yet-created dirs).
    for (const dir of inherited) push(dir);
    // Well-known dirs are speculative — only add ones that actually exist so
    // the resulting PATH doesn't balloon with phantom entries.
    for (const dir of wellKnownDirs(c)) {
      if (!seen.has(dir) && c.exists(dir)) push(dir);
    }
    return out;
  }

  /** {@link augmentedSearchDirs} joined into a `PATH` string for a child env. */
  export function augmentedPathValue(ctx: ResolveContext = {}): string {
    const c = resolveContext(ctx);
    return augmentedSearchDirs(ctx).join(c.p.delimiter);
  }

  /**
   * Resolve a bare command name (e.g. `"claude"`, `"npx"`) to an absolute
   * path by probing each augmented dir. On Windows, tries the `PATHEXT`
   * extensions (`.cmd`/`.exe`/…) since the bare name has no suffix. Returns
   * the first hit, or `null` — never throws.
   */
  export function resolve(
    name: string,
    ctx: ResolveContext = {}
  ): string | null {
    const c = resolveContext(ctx);
    const dirs = augmentedSearchDirs(ctx);
    const candidates =
      c.platform === "win32" ? withWindowsExts(name, c) : [name];
    for (const dir of dirs) {
      for (const candidate of candidates) {
        const full = c.p.join(dir, candidate);
        if (c.exists(full)) return full;
      }
    }
    return null;
  }

  function withWindowsExts(name: string, c: Resolved): string[] {
    // Already-suffixed names are taken verbatim; bare names get PATHEXT.
    if (c.p.extname(name)) return [name];
    const exts = (c.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
      .split(";")
      .filter(Boolean);
    return [name, ...exts.map((ext) => name + ext.toLowerCase())];
  }

  function defaultExists(p: string): boolean {
    // Existence is enough for both uses: dir-presence (augmented PATH) and a
    // resolved command (an executable is a file; a dir colliding with a
    // command name is not a real-world case worth guarding).
    return fs.existsSync(p);
  }
}
