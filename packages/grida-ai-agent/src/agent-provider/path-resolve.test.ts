import path from "node:path";
import { describe, expect, it } from "vitest";
import { claude_path, type ResolveContext } from "./path-resolve";

const HOME = "/home/u";

/** A POSIX context whose "filesystem" is the given set of existing paths. */
function posix(
  existing: string[],
  env: NodeJS.ProcessEnv = {}
): ResolveContext {
  const set = new Set(existing);
  return { env, platform: "linux", homedir: HOME, exists: (p) => set.has(p) };
}

describe("claude_path.augmentedSearchDirs", () => {
  it("keeps inherited PATH first, then appends existing well-known dirs", () => {
    const dirs = claude_path.augmentedSearchDirs(
      posix(["/opt/homebrew/bin", path.join(HOME, ".local", "bin")], {
        PATH: "/usr/bin:/custom",
      })
    );
    // inherited entries lead, in order…
    expect(dirs.slice(0, 2)).toEqual(["/usr/bin", "/custom"]);
    // …then the well-known dirs that actually exist
    expect(dirs).toContain("/opt/homebrew/bin");
    expect(dirs).toContain(path.join(HOME, ".local", "bin"));
  });

  it("omits well-known dirs that don't exist", () => {
    const dirs = claude_path.augmentedSearchDirs(
      posix([], { PATH: "/usr/bin" }) // nothing on disk
    );
    expect(dirs).toEqual(["/usr/bin"]);
  });

  it("dedupes a well-known dir already present in inherited PATH", () => {
    const dirs = claude_path.augmentedSearchDirs(
      posix(["/opt/homebrew/bin"], { PATH: "/opt/homebrew/bin" })
    );
    expect(dirs.filter((d) => d === "/opt/homebrew/bin")).toHaveLength(1);
  });

  it("works with an empty inherited PATH (stripped GUI launch)", () => {
    const dirs = claude_path.augmentedSearchDirs(
      posix(["/usr/bin", path.join(HOME, ".local", "bin")], {})
    );
    expect(dirs).toContain("/usr/bin");
    expect(dirs).toContain(path.join(HOME, ".local", "bin"));
  });
});

describe("claude_path.augmentedPathValue", () => {
  it("joins the dirs with the platform delimiter", () => {
    const value = claude_path.augmentedPathValue(
      posix(["/opt/homebrew/bin"], { PATH: "/usr/bin" })
    );
    expect(value.split(path.posix.delimiter)).toContain("/opt/homebrew/bin");
    expect(value.startsWith("/usr/bin")).toBe(true);
  });
});

describe("claude_path.resolve", () => {
  it("finds a command planted in a well-known dir absent from PATH", () => {
    const claudeBin = path.join(HOME, ".local", "bin", "claude");
    const resolved = claude_path.resolve(
      "claude",
      posix([path.join(HOME, ".local", "bin"), claudeBin], {
        PATH: "/usr/bin:/bin", // the stripped GUI PATH — no ~/.local/bin
      })
    );
    expect(resolved).toBe(claudeBin);
  });

  it("returns null when the command exists nowhere on the augmented PATH", () => {
    const resolved = claude_path.resolve(
      "claude",
      posix(["/usr/bin", "/opt/homebrew/bin"], { PATH: "/usr/bin" })
    );
    expect(resolved).toBeNull();
  });

  it("prefers an inherited-PATH hit over a well-known-dir hit", () => {
    const onPath = "/custom/claude";
    const onWellKnown = path.join(HOME, ".local", "bin", "claude");
    const resolved = claude_path.resolve(
      "claude",
      posix(
        ["/custom", onPath, path.join(HOME, ".local", "bin"), onWellKnown],
        { PATH: "/custom" }
      )
    );
    expect(resolved).toBe(onPath);
  });

  it("tries Windows extensions for a bare name", () => {
    const set = new Set(["C:\\bin", "C:\\bin\\claude.cmd"]);
    const resolved = claude_path.resolve("claude", {
      env: { PATH: "C:\\bin", PATHEXT: ".EXE;.CMD" },
      platform: "win32",
      homedir: "C:\\Users\\u",
      exists: (p) => set.has(p),
    });
    expect(resolved).toBe(path.win32.join("C:\\bin", "claude.cmd"));
  });
});
