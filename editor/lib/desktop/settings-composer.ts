import type {
  DesktopBridge,
  DesktopComposerPredictionSettings,
} from "@grida/desktop-bridge";

/** Settings follows the Main-owned preference, including edits made outside this window. */
export class SettingsComposer {
  private state = {
    preference: null as DesktopComposerPredictionSettings | null,
    unavailable: false,
    saving: false,
    error: "",
  };
  private listeners = new Set<() => void>();
  private request = 0;
  readonly read = () => this.state;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  constructor(
    private readonly api: NonNullable<DesktopBridge["composerPredictions"]>
  ) {}

  connect(): () => void {
    const request = ++this.request;
    const apply = (value: DesktopComposerPredictionSettings) => {
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
    try {
      const value = await this.api.get();
      if (this.request === request) this.receive(value);
    } catch (error) {
      if (this.request !== request) return;
      if (
        error instanceof Error &&
        error.message.endsWith("composer_predictions_unavailable")
      ) {
        this.update({ unavailable: true, preference: null, error: "" });
      } else {
        this.update({
          error:
            "Couldn't read the composer preference. Check your global config.toml.",
        });
      }
    }
  };

  async set(enabled: boolean): Promise<void> {
    if (this.state.saving || !this.state.preference) return;
    this.update({ saving: true, error: "" });
    try {
      this.receive(await this.api.set(enabled));
    } catch {
      this.update({
        error:
          "Couldn't save the composer preference. Check your global config.toml and try again.",
      });
    } finally {
      this.update({ saving: false });
    }
  }

  private receive(preference: DesktopComposerPredictionSettings) {
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
