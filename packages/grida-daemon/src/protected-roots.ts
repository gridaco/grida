// GRIDA-SEC-004 / GRIDA-SEC-014 — native credential trees never become file grants.
import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { containsPath } from "./path-contains";

/** Node-only topology gate for fixed native roots, including not-yet-created paths. */
export class ProtectedRoots {
  private readonly roots: readonly string[];

  constructor(roots: readonly string[]) {
    this.roots = roots.map((root) => {
      if (!path.isAbsolute(root))
        throw new Error("Protected roots must be absolute");
      return path.resolve(root);
    });
  }

  /** Revalidates aliases on every use; unavailable path authority fails closed. */
  overlaps(candidate: string): boolean {
    if (!path.isAbsolute(candidate))
      throw new Error("Protected paths must be absolute");
    if (this.roots.length === 0) return false;
    const current = this.canonical(candidate);
    return this.roots.some((root) => {
      const protectedRoot = this.canonical(root);
      return (
        containsPath(protectedRoot, current) ||
        containsPath(current, protectedRoot)
      );
    });
  }

  private canonical(value: string): string {
    let current = path.resolve(value);
    const suffix: string[] = [];
    for (;;) {
      try {
        return path.join(realpathSync.native(current), ...suffix);
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
          throw new Error("Protected path authority is unavailable");
        }
        try {
          if (lstatSync(current).isSymbolicLink())
            throw new Error("Protected path authority is unavailable");
        } catch (error) {
          if ((error as NodeJS.ErrnoException)?.code !== "ENOENT")
            throw new Error("Protected path authority is unavailable");
        }
        const parent = path.dirname(current);
        if (parent === current)
          throw new Error("Protected path authority is unavailable");
        suffix.unshift(path.basename(current));
        current = parent;
      }
    }
  }
}
