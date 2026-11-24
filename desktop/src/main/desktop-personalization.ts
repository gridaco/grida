// GRIDA-SEC-004 — Main owns global chat preferences and background inference permission.
import { watchFile, unwatchFile } from "node:fs";
import path from "node:path";
import type {
  DesktopComposerPredictionSettings as Snapshot,
  DesktopPersonalizationChange,
  DesktopPersonalizationSettings,
} from "@grida/desktop-bridge";
import type { NativeAgentConfig } from "./native-agent-config";
import { parseGlobalConfig, readGlobalConfig } from "./native-agent-files";

const PREDICTIONS = "composer-predictions-enabled";
type Choices = Omit<DesktopPersonalizationSettings, "revision">;
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

function source(bytes: Buffer | null): Choices {
  if (!bytes) return defaults;
  const table = parseGlobalConfig(bytes);
  const desktop = table.desktop;
  if (
    desktop !== undefined &&
    (!desktop ||
      typeof desktop !== "object" ||
      Array.isArray(desktop) ||
      desktop instanceof Date)
  )
    throw new Error("personalization_config_invalid");
  const prediction = desktop?.[PREDICTIONS];
  if (prediction !== undefined && typeof prediction !== "boolean")
    throw new Error("composer_predictions_config_invalid");
  return {
    suggestedPrompts: prediction ?? defaults.suggestedPrompts,
    webSearch: searchPreference(table.web_search),
  };
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

  constructor(
    private readonly file: string,
    private readonly config?: Pick<NativeAgentConfig, "set">
  ) {
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
      this.publish(source(bytes));
    } catch (error) {
      this.publish(denied);
      throw error;
    }
  }

  set(
    enabled: boolean,
    check: () => void = () => {},
    signal?: AbortSignal
  ): Promise<Snapshot> {
    return this.setPersonalization(
      { suggestedPrompts: enabled },
      check,
      signal
    ).then(() => this.state);
  }

  setPersonalization(
    change: DesktopPersonalizationChange,
    check: () => void = () => {},
    signal?: AbortSignal
  ): Promise<DesktopPersonalizationSettings> {
    return this.serialize(async () => {
      if (!isPersonalizationChange(change))
        throw new Error("personalization_preference_invalid");
      await this.readSource();
      if (!this.config) throw new Error("global_config_writer_unavailable");
      try {
        await this.config.set(
          "webSearch" in change
            ? {
                webSearch:
                  change.webSearch === "live" ? "automatic" : "disabled",
              }
            : change,
          check,
          signal
        );
      } catch (error) {
        // A lost acknowledgement can follow a committed write. Refresh the
        // in-memory permissions before returning its transport error.
        await this.readSource().catch(() => {});
        throw error;
      }
      await this.readSource();
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
