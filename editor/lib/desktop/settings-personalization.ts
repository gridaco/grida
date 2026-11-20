import type {
  DesktopBridge,
  DesktopPersonalizationSettings,
  DesktopPersonalizationChange,
} from "@grida/desktop-bridge";

/** Settings follows the Main-owned preference, including edits made outside this window. */
export class SettingsPersonalization {
  private state = {
    preference: null as DesktopPersonalizationSettings | null,
    unavailable: false,
    saving: false,
    error: "",
  };
  private listeners = new Set<() => void>();
  private request = 0;
  private latestRead = 0;
  readonly read = () => this.state;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  constructor(
    private readonly api: NonNullable<DesktopBridge["personalization"]>
  ) {}

  // A hosted renderer can open Settings on an older Desktop installation.
  static fromPredictions(
    api: NonNullable<DesktopBridge["composerPredictions"]>
  ) {
    const snapshot = (value: {
      enabled: boolean;
      revision: number;
    }): DesktopPersonalizationSettings => ({
      suggestedPrompts: value.enabled,
      revision: value.revision,
      fastMode: false,
      webSearch: "onDemand",
    });
    return new SettingsPersonalization({
      get: async () => snapshot(await api.get()),
      set: async (change) => {
        if (!("suggestedPrompts" in change))
          throw new Error("personalization_unavailable");
        return snapshot(await api.set(change.suggestedPrompts));
      },
      onChange: (listener) =>
        api.onChange((value) => listener(snapshot(value))),
    });
  }

  connect(): () => void {
    const request = ++this.request;
    const apply = (value: DesktopPersonalizationSettings) => {
      if (this.request === request) this.receive(value);
    };
    const unsubscribe = this.api.onChange(apply);
    void this.refresh();
    return () => {
      this.request++;
      unsubscribe();
    };
  }

  readonly refresh = async (): Promise<void> => {
    const request = this.request;
    const read = ++this.latestRead;
    const previous = this.state.preference;
    try {
      const value = await this.api.get();
      if (this.request === request && this.latestRead === read)
        this.receive(value);
    } catch (error) {
      if (
        this.request !== request ||
        this.latestRead !== read ||
        this.state.preference !== previous
      )
        return;
      if (
        error instanceof Error &&
        /(?:personalization|composer_predictions)_unavailable$/.test(
          error.message
        )
      ) {
        this.update({ unavailable: true, preference: null, error: "" });
      } else {
        this.update({
          error:
            "Couldn't read your personalization settings. Check your global config.toml.",
        });
      }
    }
  };

  async set(change: DesktopPersonalizationChange): Promise<void> {
    if (this.state.saving || !this.state.preference) return;
    this.update({ saving: true, error: "" });
    try {
      this.receive(await this.api.set(change));
    } catch {
      this.update({
        error:
          "Couldn't save your personalization settings. Check your global config.toml and try again.",
      });
    } finally {
      this.update({ saving: false });
    }
  }

  private receive(preference: DesktopPersonalizationSettings) {
    if (
      !this.state.preference ||
      this.state.preference.revision <= preference.revision
    )
      this.update({ preference, unavailable: false, error: "" });
  }
  private update(patch: Partial<typeof this.state>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}
