/**
 * @grida/home — the canonical Grida home directory contract.
 *
 * Resolves WHERE Grida stores per-user state on disk: a single home
 * directory, `~/.grida`, overridable with the `GRIDA_HOME` env var — the
 * `~/.cargo` / `~/.aws` / `CARGO_HOME` convention (one self-contained
 * per-user dir), NOT the XDG category split. Components carve subdirs under
 * it (the agent → `~/.grida/agent`; a future `settings.json` → `~/.grida/…`).
 *
 * Pure path resolution. It never touches the filesystem — no mkdir, no stat,
 * no read/write. Callers create directories lazily themselves.
 *
 * Host facts (`env`, `home`) are injectable so resolution is unit-testable
 * with zero mocks and zero real-filesystem reads. The location is the same on
 * every platform — that uniformity is the point of the single-home model.
 */
import os from "node:os";
import path from "node:path";

export namespace home {
  /** Env var that overrides the Grida home directory. */
  export const ENV = "GRIDA_HOME";

  /** Default directory name, placed under the user's home directory. */
  export const DIRNAME = ".grida";

  /** Injectable host facts. All optional; default to the real Node host. */
  export type ResolveOptions = {
    /** Environment to read {@link ENV} from. Defaults to `process.env`. */
    env?: Record<string, string | undefined>;
    /** User home directory. Defaults to `os.homedir()`. */
    home?: string;
  };

  /**
   * The canonical Grida home directory.
   *
   * Precedence: `GRIDA_HOME` when set to a non-empty **absolute** path
   * (mirrors `CARGO_HOME`), otherwise `<home>/.grida`.
   */
  export function dir(options: ResolveOptions = {}): string {
    const env = options.env ?? process.env;
    const override = env[ENV];
    if (override && path.isAbsolute(override)) {
      return override;
    }
    const userHome = options.home ?? os.homedir();
    return path.join(userHome, DIRNAME);
  }

  /**
   * A path under the Grida home directory. Centralizes the component layout
   * fact (the agent uses `join("agent")` → `<home>/agent`). Pure `path.join`;
   * performs no I/O and does not create the directory.
   */
  export function join(subpath: string, options: ResolveOptions = {}): string {
    return path.join(dir(options), subpath);
  }
}
