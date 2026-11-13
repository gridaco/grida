// GRIDA-SEC-004 — known legacy scratch location denied to native services.
import crypto from "node:crypto";
import path from "node:path";

/**
 * Paths the TypeScript agent of earlier Desktop releases left on disk. This
 * build only names them so Main and the sandboxes can keep native services
 * away from that data; it never creates or writes them.
 */
export namespace LegacyAgentPaths {
  /**
   * Session scratch base of an earlier agent host: `<tempRoot>/grida-agent-`
   * followed by the first 16 hex digits of the SHA-256 of its resolved
   * `userData` directory.
   */
  export function scratchBase(userDataPath: string, tempRoot: string): string {
    const tag = crypto
      .createHash("sha256")
      .update(path.resolve(userDataPath))
      .digest("hex")
      .slice(0, 16);
    return path.join(tempRoot, `grida-agent-${tag}`);
  }
}
