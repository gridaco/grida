/**
 * Persistent file log for the agent sidecar (the observability half of the
 * approval-resume incident fix — see `docs` in the incident plan).
 *
 * The supervisor pipes the sidecar's stdout/stderr to the Electron main
 * process console only, which is ephemeral: a packaged-app incident leaves
 * NO trace on disk (the 2026-07-10 approval-resume incident was
 * undiagnosable for exactly this reason). This writer appends every line to
 * a rotating file under the agent data dir (`~/.grida/agent/logs/`), so the
 * next field incident carries its server-side trace.
 *
 * Deliberately electron-free (node:fs/node:path only) so it is unit-testable
 * as a plain Node module. Logging must never break the supervisor: every fs
 * error is swallowed and the writer degrades to a no-op.
 */
import fs from "node:fs";
import path from "node:path";

/** Which pipe a line came from: sidecar stdout, sidecar stderr, or the
 * supervisor's own lifecycle notes (spawn / port / exit / restart). */
export type SidecarLogStream = "out" | "err" | "sup";

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // rotate at 5 MB
const DEFAULT_KEEP = 3; // sidecar.log + sidecar.1.log + sidecar.2.log
const CURRENT_FILE = "sidecar.log";

export class SidecarLogWriter {
  private readonly dir: string;
  private readonly max_bytes: number;
  private readonly keep: number;
  /** Bytes in the current file. `null` until the first successful write
   * resolves it (statSync on an existing file, 0 on a fresh one). */
  private size: number | null = null;

  constructor(dir: string, opts?: { max_bytes?: number; keep?: number }) {
    this.dir = dir;
    this.max_bytes = opts?.max_bytes ?? DEFAULT_MAX_BYTES;
    // At least the current file.
    this.keep = Math.max(1, opts?.keep ?? DEFAULT_KEEP);
  }

  /** Absolute path of the current log file (for tests / diagnostics). */
  get file(): string {
    return path.join(this.dir, CURRENT_FILE);
  }

  /**
   * Append one line. Multi-line payloads are the caller's concern — the
   * supervisor already splits chunks into trimmed lines. Never throws.
   */
  write(stream: SidecarLogStream, line: string): void {
    const entry = `${new Date().toISOString()} [${stream}] ${line}\n`;
    try {
      if (this.size === null) this.size = this.currentSize();
      // Byte count (not `entry.length`, which is UTF-16 code units) so the
      // accounting matches `statSync().size` — sidecar stderr can carry
      // multi-byte content, and an undercount would let the file overshoot
      // the cap the rotation exists to enforce.
      const entryBytes = Buffer.byteLength(entry, "utf8");
      if (this.size + entryBytes > this.max_bytes) this.rotate();
      fs.appendFileSync(this.file, entry, "utf8");
      this.size += entryBytes;
    } catch {
      // Logging is best-effort by contract; a full disk or a permissions
      // problem must never take the supervisor down with it.
      this.size = null; // re-resolve on the next attempt
    }
  }

  private currentSize(): number {
    fs.mkdirSync(this.dir, { recursive: true });
    try {
      return fs.statSync(this.file).size;
    } catch {
      return 0; // fresh file
    }
  }

  /** Shift sidecar.log → sidecar.1.log → … dropping the oldest. */
  private rotate(): void {
    const rotated = (i: number) => path.join(this.dir, `sidecar.${i}.log`);
    // Drop the one that would fall off the end.
    fs.rmSync(rotated(this.keep - 1), { force: true });
    for (let i = this.keep - 2; i >= 1; i -= 1) {
      try {
        fs.renameSync(rotated(i), rotated(i + 1));
      } catch {
        // gap in the chain (file missing) — fine
      }
    }
    if (this.keep > 1) {
      try {
        fs.renameSync(this.file, rotated(1));
      } catch {
        // current file missing — nothing to rotate
      }
    } else {
      fs.rmSync(this.file, { force: true });
    }
    this.size = 0;
  }
}
