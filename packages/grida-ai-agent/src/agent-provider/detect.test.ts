import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectClaude } from "./detect";
import type { ResolveContext } from "./path-resolve";

const HOME = "/home/u";

function posix(
  existing: string[],
  env: NodeJS.ProcessEnv = {}
): ResolveContext {
  const set = new Set(existing);
  return { env, platform: "linux", homedir: HOME, exists: (p) => set.has(p) };
}

describe("detectClaude", () => {
  it("reports installed with the resolved path when claude is on a well-known dir", () => {
    const bin = path.join(HOME, ".local", "bin", "claude");
    const result = detectClaude(
      posix([path.join(HOME, ".local", "bin"), bin], { PATH: "/usr/bin" })
    );
    expect(result).toEqual({ installed: true, path: bin });
  });

  it("reports not installed when claude is unresolvable", () => {
    const result = detectClaude(posix(["/usr/bin"], { PATH: "/usr/bin" }));
    expect(result).toEqual({ installed: false });
  });

  it("never throws on an empty environment", () => {
    expect(() => detectClaude(posix([], {}))).not.toThrow();
    expect(detectClaude(posix([], {}))).toEqual({ installed: false });
  });
});
