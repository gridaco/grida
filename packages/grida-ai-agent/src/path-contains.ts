import path from "node:path";

/**
 * `path.sep`-terminated prefix containment: is `candidate` `root` itself or a
 * path strictly inside it? The trailing-separator guard is what keeps a sibling
 * like `${root}-backup` from counting as inside `${root}`.
 *
 * Both arguments must already be absolute (and ideally `realpath`'d by the
 * caller when symlink stability matters) — this is a pure string check, not a
 * filesystem op. Shared by the shell runner's workspace/secret-root gates, the
 * session scratch containment assert, and `WorkspaceRegistry.createProject`'s
 * managed-root assert so the discipline can't drift between copies.
 */
export function containsPath(root: string, candidate: string): boolean {
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  return candidate === root || candidate.startsWith(prefix);
}
