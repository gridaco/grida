// GRIDA-SEC-004 — Main owns the global preference that admits background inference.
import { watchFile, unwatchFile } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { DesktopComposerPredictionSettings as Snapshot } from "@grida/desktop-bridge";
import { atomicWrite } from "@grida/daemon/server";
import { parseTOML, type AST } from "toml-eslint-parser";
import {
  parseGlobalConfig,
  readGlobalConfig,
  sourceDirectory,
} from "./native-agent-files";

const KEY = "composer-predictions-enabled";
const MAX_BYTES = 64 * 1024;

function source(bytes: Buffer | null) {
  const { text, desktop } = parseGlobalConfig(
    bytes ?? Buffer.from("schema_version = 1\n")
  );
  const value = desktop?.[KEY];
  if (value !== undefined && typeof value !== "boolean")
    throw new Error("composer_predictions_config_invalid");
  return {
    text,
    explicit: value,
    enabled: value === true,
    hasDesktop: desktop !== undefined,
    bom: bytes?.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) ?? false,
  };
}

function keyIs(key: AST.TOMLKey, ...path: string[]): boolean {
  return (
    key.keys.length === path.length &&
    key.keys.every(
      (part, i) =>
        (part.type === "TOMLBare" ? part.name : part.value) === path[i]
    )
  );
}

/** Change just the boolean token, including for dotted, quoted, and inline TOML. */
function edit(current: ReturnType<typeof source>, enabled: boolean): string {
  const { text } = current;
  const body = parseTOML(text, { tomlVersion: "1.1" }).body[0].body;
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const assignment = `${KEY} = ${enabled}`;
  const replace = (start: number, end: number, insertion: string) =>
    text.slice(0, start) + insertion + text.slice(end);
  for (const entry of body) {
    if (entry.type === "TOMLTable" && keyIs(entry.key, "desktop")) {
      const field = entry.body.find((f) => keyIs(f.key, KEY));
      if (field) return replace(...field.value.range, String(enabled));
      const nextLine = text.indexOf("\n", entry.key.range[1]);
      return nextLine < 0
        ? text + newline + assignment + newline
        : replace(nextLine + 1, nextLine + 1, assignment + newline);
    }
    if (entry.type === "TOMLKeyValue") {
      if (keyIs(entry.key, "desktop", KEY))
        return replace(...entry.value.range, String(enabled));
      if (
        keyIs(entry.key, "desktop") &&
        entry.value.type === "TOMLInlineTable"
      ) {
        const field = entry.value.body.find((f) => keyIs(f.key, KEY));
        if (field) return replace(...field.value.range, String(enabled));
        const start = entry.value.range[0] + 1;
        return replace(
          start,
          start,
          assignment + (entry.value.body.length ? ", " : "")
        );
      }
    }
  }
  // An existing implicitly declared desktop table can already have dotted children.
  if (current.hasDesktop) return "desktop." + assignment + newline + text;
  return (
    text +
    (text.endsWith("\n") ? "" : newline) +
    newline +
    "[desktop]" +
    newline +
    assignment +
    newline
  );
}

export class DesktopComposerPredictions {
  private state: Snapshot = Object.freeze({ enabled: false, revision: 0 });
  private permission?: AbortController;
  private readonly listeners = new Set<(snapshot: Snapshot) => void>();
  private pending: Promise<unknown> = Promise.resolve();
  private readonly directory: string;

  constructor(private readonly file: string) {
    this.directory = path.dirname(file);
    if (
      !path.isAbsolute(file) ||
      path.normalize(file) !== file ||
      path.basename(file) !== "config.toml"
    )
      throw new Error("global_config_path_invalid");
  }

  get snapshot(): Snapshot {
    return this.state;
  }

  /** Turning the preference off revokes every request admitted by this revision. */
  capture(revision: number): AbortSignal | undefined {
    return this.state.revision === revision
      ? this.permission?.signal
      : undefined;
  }

  get(): Promise<Snapshot> {
    return this.serialize(async () => {
      await this.readSource();
      return this.state;
    });
  }

  private async readSource() {
    try {
      const bytes = await readGlobalConfig(this.directory);
      const current = source(bytes);
      this.publish(current.enabled);
      return { bytes, current };
    } catch (error) {
      this.publish(false);
      throw error;
    }
  }

  set(enabled: boolean, check: () => void = () => {}): Promise<Snapshot> {
    return this.serialize(async () => {
      const { bytes: before, current } = await this.readSource();
      check();
      if (current.explicit === enabled) return this.state;
      const next = Buffer.from(
        (current.bom ? "\uFEFF" : "") + edit(current, enabled)
      );
      if (next.byteLength > MAX_BYTES || source(next).enabled !== enabled)
        throw new Error("composer_predictions_config_edit_invalid");
      await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
      await sourceDirectory(this.directory);
      await atomicWrite(this.file, next, {
        mode: 0o600,
        ensure_dir: false,
        before_commit: async () => {
          const { bytes: latest } = await this.readSource();
          if (
            !(latest === null
              ? before === null
              : before !== null && latest.equals(before))
          )
            throw new Error("global_config_changed");
          check();
        },
      });
      return this.publish(enabled);
    });
  }

  onChange(listener: (state: Snapshot) => void): () => void {
    if (!this.listeners.size)
      watchFile(this.file, { persistent: false, interval: 500 }, this.refresh);
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) unwatchFile(this.file, this.refresh);
    };
  }

  private readonly refresh = () => {
    void this.get().catch(() => {});
  };

  private publish(enabled: boolean): Snapshot {
    if (this.state.enabled !== enabled) {
      this.state = Object.freeze({
        enabled,
        revision: this.state.revision + 1,
      });
      this.permission?.abort();
      this.permission = enabled ? new AbortController() : undefined;
      for (const listener of this.listeners) listener(this.state);
    }
    return this.state;
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation);
    this.pending = result.catch(() => {});
    return result;
  }
}
