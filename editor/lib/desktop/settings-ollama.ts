import {
  DesktopBridgeMissingError,
  OLLAMA_ENDPOINT_PRESET,
  mergeProbedModels,
  providers,
  type EndpointProviderConfig,
} from "./bridge";

/** Endpoint drafts and discovery share a lifecycle, but only Save grants consent.
 * See test/desktop-settings-endpoint-consent.md for the native interaction case. */
export namespace SettingsOllama {
  export type API = Pick<
    typeof providers,
    | "isSupported"
    | "supportsEndpointConsent"
    | "listEndpoints"
    | "setEndpoint"
    | "endpointAuthorization"
    | "probeEndpoint"
    | "updateEndpointModels"
    | "deleteEndpoint"
    | "confirmDeleteEndpoint"
  >;
  export type State = Readonly<{
    kind: "loading" | "unsupported" | "unavailable" | "ready" | "saving";
    draft: EndpointProviderConfig | null;
    dirty: boolean;
    persisted: boolean;
    consentSupported: boolean;
    authorizedBaseUrl: string | null;
    probing: boolean;
    probeNote: string | null;
    error: string | null;
  }>;

  export function sameAddress(a: string | null, b: string): boolean {
    if (a === null) return false;
    try {
      return new URL(a).href === new URL(b).href;
    } catch {
      return false;
    }
  }
  export function needsConnection(state: State): boolean {
    return (
      state.consentSupported &&
      state.draft !== null &&
      !sameAddress(state.authorizedBaseUrl, state.draft.base_url)
    );
  }

  export class Controller {
    private state: State = {
      kind: "loading",
      draft: null,
      dirty: false,
      persisted: false,
      consentSupported: false,
      authorizedBaseUrl: null,
      probing: false,
      probeNote: null,
      error: null,
    };
    private listeners = new Set<() => void>();
    private generation = 0;
    private probeGeneration = 0;
    constructor(private readonly api: API = providers) {}
    readonly read = (): State => this.state;
    readonly subscribe = (listener: () => void): (() => void) => {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    };
    cancel(): void {
      this.invalidate();
    }
    readonly refresh = async (): Promise<void> => {
      const generation = this.invalidate();
      if (!this.api.isSupported()) {
        this.publish({ kind: "unsupported" });
        return;
      }
      this.publish({ kind: "loading", error: null });
      try {
        const saved = await this.saved();
        const consentSupported = this.api.supportsEndpointConsent();
        if (generation !== this.generation) return;
        this.publish({
          draft: saved,
          dirty: false,
          persisted: saved !== null,
          consentSupported,
          authorizedBaseUrl: null,
        });
        const authorized =
          saved && consentSupported
            ? await this.api.endpointAuthorization(saved.id, saved.base_url)
            : false;
        if (generation !== this.generation) return;
        this.publish({
          kind: "ready",
          draft: saved,
          dirty: false,
          persisted: saved !== null,
          consentSupported,
          authorizedBaseUrl: authorized ? saved!.base_url : null,
          probeNote: null,
        });
        // Legacy probes open a modal. Merely visiting Settings never calls them.
        if (saved && authorized) await this.detect();
      } catch (error) {
        if (generation === this.generation)
          this.publish({ kind: "unavailable", error: errorMessage(error) });
      }
    };
    readonly setup = (): void => {
      this.invalidate();
      this.publish({
        kind: "ready",
        draft: { ...OLLAMA_ENDPOINT_PRESET, models: [] },
        dirty: true,
        persisted: false,
        consentSupported: this.api.supportsEndpointConsent(),
        authorizedBaseUrl: null,
        probeNote: null,
        error: null,
      });
    };
    readonly edit = (draft: EndpointProviderConfig): void => {
      this.invalidate();
      this.publish({
        kind: this.state.kind === "unavailable" ? "unavailable" : "ready",
        draft,
        dirty: true,
        error: this.state.kind === "unavailable" ? this.state.error : null,
      });
    };
    readonly save = async (): Promise<void> => {
      const draft = this.state.draft;
      if (!draft || this.state.kind !== "ready") return;
      const generation = this.invalidate();
      this.publish({ kind: "saving", error: null, probeNote: null });
      try {
        // This is the sole consent-minting operation, called by Connect/Save.
        await this.api.setEndpoint(draft);
        const saved = await this.saved();
        const consentSupported = this.api.supportsEndpointConsent();
        const authorized =
          saved && consentSupported
            ? await this.api.endpointAuthorization(saved.id, saved.base_url)
            : false;
        if (generation !== this.generation) return;
        this.publish({
          kind: "ready",
          draft: saved,
          dirty: false,
          persisted: saved !== null,
          consentSupported,
          authorizedBaseUrl: authorized ? saved!.base_url : null,
        });
        if (saved && authorized) await this.detect();
      } catch (error) {
        if (generation === this.generation)
          this.publish({ kind: "ready", error: errorMessage(error) });
      }
    };
    readonly detect = async (): Promise<void> => {
      const state = this.state;
      const base = state.draft;
      if (!base || state.kind !== "ready" || state.probing) return;
      if (needsConnection(state)) {
        this.publish({
          probeNote: "Connect to this address to detect models.",
        });
        return;
      }
      const generation = this.generation;
      const probe = ++this.probeGeneration;
      this.publish({ probing: true, probeNote: null });
      try {
        const result = await this.api.probeEndpoint(base.base_url);
        if (generation !== this.generation) return;
        const merged = mergeProbedModels(base.models, result.models);
        this.publish({
          probeNote:
            merged.discovered > 0
              ? `Found ${merged.discovered} model${merged.discovered === 1 ? "" : "s"}.`
              : merged.updated > 0
                ? "Updated model details."
                : "No new models found.",
        });
        if (merged.discovered === 0 && merged.updated === 0) return;
        if (state.consentSupported && state.persisted && !state.dirty) {
          // The host merges facts into its CURRENT config, preserving human
          // overrides/defaults even when another Settings window changed them.
          await this.api.updateEndpointModels({
            id: base.id,
            base_url: base.base_url,
            models: result.models,
          });
          const saved = await this.saved();
          if (generation !== this.generation) return;
          this.publish({
            draft: saved,
            persisted: saved !== null,
            dirty: false,
          });
        } else {
          this.publish({
            draft: { ...base, models: merged.models },
            dirty: true,
          });
        }
      } catch (error) {
        if (generation === this.generation) {
          if (
            error instanceof Error &&
            /\bprovider_endpoint_connect_required\b/.test(error.message)
          ) {
            this.publish({
              authorizedBaseUrl: null,
              probeNote: "Connect to this address to use it and detect models.",
            });
          } else {
            this.publish({
              probeNote: `Couldn't reach the endpoint (${errorMessage(error)}) — add models manually.`,
            });
          }
        }
      } finally {
        if (probe === this.probeGeneration) this.publish({ probing: false });
      }
    };
    readonly remove = async (): Promise<void> => {
      const draft = this.state.draft;
      if (!draft || this.state.kind !== "ready") return;
      const generation = this.invalidate();
      this.publish({ kind: "saving", error: null });
      try {
        if (!(await this.api.confirmDeleteEndpoint(draft.label ?? draft.id))) {
          if (generation === this.generation) this.publish({ kind: "ready" });
          return;
        }
        if (generation !== this.generation) return;
        await this.api.deleteEndpoint(draft.id);
        if (generation === this.generation) await this.refresh();
      } catch (error) {
        if (generation === this.generation)
          this.publish({ kind: "ready", error: errorMessage(error) });
      }
    };
    private async saved(): Promise<EndpointProviderConfig | null> {
      const list = await this.api.listEndpoints();
      return (
        list.find((entry) => entry.id === OLLAMA_ENDPOINT_PRESET.id) ?? null
      );
    }
    private invalidate(): number {
      this.probeGeneration += 1;
      this.publish({ probing: false });
      return ++this.generation;
    }
    private publish(patch: Partial<State>): void {
      this.state = { ...this.state, ...patch };
      for (const listener of this.listeners) listener();
    }
  }

  function errorMessage(error: unknown): string {
    if (
      error instanceof DesktopBridgeMissingError ||
      (error instanceof Error &&
        /No handler registered for ['"]grida:provider:endpoint:/.test(
          error.message
        ))
    )
      return "Please relaunch Grida Desktop to use this connection.";
    return error instanceof Error ? error.message : "Try again.";
  }
}
