// GRIDA-SEC-004 — Main owns global chat preferences and background inference permission.
import { watchFile, unwatchFile } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  DesktopComposerPredictionSettings as Snapshot,
  DesktopPersonalizationChange,
  DesktopPersonalizationSettings,
} from "@grida/desktop-bridge";
import { atomicWrite } from "@grida/daemon/server";
import { parseTOML, type AST } from "toml-eslint-parser";
import {
  parseGlobalConfig,
  readGlobalConfig,
  sourceDirectory,
} from "./native-agent-files";

const PREDICTIONS = "composer-predictions-enabled";
const MAX_BYTES = 64 * 1024;
type Choices = Omit<DesktopPersonalizationSettings, "revision">;
type Change = Exclude<DesktopPersonalizationChange, { webSearch: "onDemand" }>;
const defaults: Choices = {
  webSearch: "live",
  suggestedPrompts: false,
};
const denied: Choices = {
  webSearch: "disabled",
  suggestedPrompts: false,
};

function searchPreference(value: unknown): Choices["webSearch"] {
  switch (value) {
    case undefined:
      return defaults.webSearch;
    case "automatic":
    case "live":
      return "live";
    // Retired policies require a new opt-in before granting automatic search.
    case "disabled":
    case "on_demand":
    case "cached":
    case "indexed":
      return "disabled";
    default:
      throw new Error("personalization_config_invalid");
  }
}

export function isPersonalizationChange(
  value: unknown
): value is DesktopPersonalizationChange {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  if (entries.length !== 1) return false;
  const [[key, next]] = entries;
  return (
    (key === "suggestedPrompts" && typeof next === "boolean") ||
    (key === "webSearch" &&
      (next === "onDemand" || next === "disabled" || next === "live"))
  );
}

function source(bytes: Buffer | null) {
  const { text, table, desktop } = parseGlobalConfig(
    bytes ?? Buffer.from("schema_version = 1\n")
  );
  const prediction = desktop?.[PREDICTIONS];
  if (prediction !== undefined && typeof prediction !== "boolean")
    throw new Error("composer_predictions_config_invalid");
  const choices: Choices = {
    suggestedPrompts: prediction ?? defaults.suggestedPrompts,
    webSearch: searchPreference(table.web_search),
  };
  return {
    text,
    table,
    choices,
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

/** Edit one TOML assignment while preserving comments, sibling keys and inline tables. */
function edit(current: ReturnType<typeof source>, change: Change): string {
  const { text, table } = current;
  const body = parseTOML(text, { tomlVersion: "1.1" }).body[0].body;
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const replace = (start: number, end: number, insertion: string) =>
    text.slice(0, start) + insertion + text.slice(end);
  if ("webSearch" in change) {
    const value = change.webSearch === "live" ? "automatic" : "disabled";
    if (table.web_search === value) return text;
    const field = body.find(
      (e) => e.type === "TOMLKeyValue" && keyIs(e.key, "web_search")
    );
    if (field?.type === "TOMLKeyValue")
      return replace(...field.value.range, JSON.stringify(value));
    return `web_search = ${JSON.stringify(value)}${newline}${text}`;
  }
  const section = "desktop";
  const key = PREDICTIONS;
  const value = change.suggestedPrompts;
  const assignment = `${key} = ${value}`;
  for (const entry of body) {
    if (entry.type === "TOMLTable" && keyIs(entry.key, section)) {
      const field = entry.body.find((f) => keyIs(f.key, key));
      if (field) return replace(...field.value.range, String(value));
      const nextLine = text.indexOf("\n", entry.key.range[1]);
      return nextLine < 0
        ? text + newline + assignment + newline
        : replace(nextLine + 1, nextLine + 1, assignment + newline);
    }
    if (entry.type === "TOMLKeyValue") {
      if (keyIs(entry.key, section, key))
        return replace(...entry.value.range, String(value));
      if (keyIs(entry.key, section) && entry.value.type === "TOMLInlineTable") {
        const field = entry.value.body.find((f) => keyIs(f.key, key));
        if (field) return replace(...field.value.range, String(value));
        const start = entry.value.range[0] + 1;
        return replace(
          start,
          start,
          assignment + (entry.value.body.length ? ", " : "")
        );
      }
    }
  }
  if (table[section] !== undefined)
    return section + "." + assignment + newline + text;
  return (
    text +
    (text.endsWith("\n") ? "" : newline) +
    newline +
    "[" +
    section +
    "]" +
    newline +
    assignment +
    newline
  );
}

export class DesktopPersonalization {
  private state: Snapshot = Object.freeze({ enabled: false, revision: 0 });
  private choices: DesktopPersonalizationSettings = Object.freeze({
    ...defaults,
    revision: 0,
  });
  private readonly personalizationListeners = new Set<
    (state: DesktopPersonalizationSettings) => void
  >();
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

  get personalizationSnapshot(): DesktopPersonalizationSettings {
    return this.choices;
  }

  getPersonalization(): Promise<DesktopPersonalizationSettings> {
    return this.serialize(async () => {
      await this.readSource();
      return this.choices;
    });
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
      this.publish(current.choices);
      return { bytes, current };
    } catch (error) {
      this.publish(denied);
      throw error;
    }
  }

  set(enabled: boolean, check: () => void = () => {}): Promise<Snapshot> {
    return this.setPersonalization({ suggestedPrompts: enabled }, check).then(
      () => this.state
    );
  }

  setPersonalization(
    change: DesktopPersonalizationChange,
    check: () => void = () => {}
  ): Promise<DesktopPersonalizationSettings> {
    return this.serialize(async () => {
      if (!isPersonalizationChange(change))
        throw new Error("personalization_preference_invalid");
      const requested: Change =
        "webSearch" in change && change.webSearch === "onDemand"
          ? { webSearch: "disabled" }
          : change;
      const { bytes: before, current } = await this.readSource();
      check();
      const text = edit(current, requested);
      if (current.text === text) return this.choices;
      const next = Buffer.from((current.bom ? "\uFEFF" : "") + text);
      if (next.byteLength > MAX_BYTES)
        throw new Error("personalization_config_edit_invalid");
      const updated = source(next).choices;
      const expected = { ...current.choices, ...requested };
      if (
        updated.suggestedPrompts !== expected.suggestedPrompts ||
        updated.webSearch !== expected.webSearch
      )
        throw new Error("personalization_config_edit_invalid");
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
      this.publish(updated);
      return this.choices;
    });
  }

  onChange(listener: (state: Snapshot) => void): () => void {
    return this.watch(this.listeners, listener);
  }

  onPersonalizationChange(
    listener: (state: DesktopPersonalizationSettings) => void
  ): () => void {
    return this.watch(this.personalizationListeners, listener);
  }

  private watch<T>(
    listeners: Set<(state: T) => void>,
    listener: (state: T) => void
  ): () => void {
    if (!this.listeners.size && !this.personalizationListeners.size)
      watchFile(this.file, { persistent: false, interval: 500 }, this.refresh);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (!this.listeners.size && !this.personalizationListeners.size)
        unwatchFile(this.file, this.refresh);
    };
  }

  private readonly refresh = () => {
    void this.get().catch(() => {});
  };

  private publish(next: Choices): void {
    const enabled = next.suggestedPrompts;
    if (this.state.enabled !== enabled) {
      this.state = Object.freeze({
        enabled,
        revision: this.state.revision + 1,
      });
      this.permission?.abort();
      this.permission = enabled ? new AbortController() : undefined;
      for (const listener of this.listeners) listener(this.state);
    }
    if (
      next.suggestedPrompts !== this.choices.suggestedPrompts ||
      next.webSearch !== this.choices.webSearch
    ) {
      this.choices = Object.freeze({
        ...next,
        revision: this.choices.revision + 1,
      });
      for (const listener of this.personalizationListeners)
        listener(this.choices);
    }
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation);
    this.pending = result.catch(() => {});
    return result;
  }
}
