import { catalog as models } from "@app/ai-catalog";
import { byokProvidersFor } from "@grida/agent";
import type { DesktopBridge } from "@/lib/desktop/bridge";

type MediaModelCard = Readonly<{ id: string; deprecated?: boolean }>;

/** Catalogue selection and native-client compatibility for media models. */
export namespace MediaModelAvailability {
  /** Preserve a requested available model, then apply the service preference. */
  export function select<T extends MediaModelCard>(
    catalogue: readonly T[],
    requestedId?: string | null,
    defaultId?: string
  ): T | undefined {
    return (
      catalogue.find((model) => model.id === requestedId) ??
      catalogue.find((model) => model.id === defaultId && !model.deprecated) ??
      catalogue.find((model) => !model.deprecated) ??
      catalogue[0]
    );
  }

  export type ImageProviderState = Readonly<{
    loaded: boolean;
    images: boolean;
    desktopVersion?: string;
    configured: readonly models.image.ImageProvider[];
    hosted: boolean;
  }>;

  export type ImageAccess = Readonly<{
    available: boolean;
    reason?: string;
  }>;

  export const imageUpdateMessage = "Update Grida Desktop to use this model";

  /** Background request fields first ship in Desktop 0.0.22. */
  export function supportsImageBackground(desktopVersion?: string): boolean {
    const match = desktopVersion?.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
    if (!match) return false;
    const [major, minor, patch] = match.slice(1, 4).map(Number);
    return major > 0 || minor > 0 || patch >= 22;
  }

  /** Desktop 0.0.22 adds partial cards and GPT Image 2.5 request mappings. */
  export function requiresImageUpdate(
    card:
      | Pick<models.image.ImageModelCard, "id" | "provider" | "providers">
      | undefined,
    desktopVersion?: string
  ): boolean {
    if (!card) return false;
    const needsNewRuntime =
      card.id === "openai/gpt-image-2.5-flare" ||
      card.id === "openai/gpt-image-2.5-sunburst" ||
      card.provider !== "vercel" ||
      models.image.providers.some((provider) => !card.providers[provider]);
    if (!needsNewRuntime) return false;
    return !supportsImageBackground(desktopVersion);
  }

  /** Curation is not readiness: a listed card still needs a connected route. */
  export function image(
    card: models.image.ImageModelCard | undefined,
    state: ImageProviderState,
    transparent = false
  ): ImageAccess {
    if (!card?.listed)
      return { available: false, reason: "Choose an image model" };
    if (
      requiresImageUpdate(card, state.desktopVersion) ||
      (transparent && !supportsImageBackground(state.desktopVersion))
    ) {
      return { available: false, reason: imageUpdateMessage };
    }
    if (!state.loaded)
      return { available: false, reason: "Checking connected providers…" };
    if (!state.images)
      return {
        available: false,
        reason: "Image generation is unavailable in this Desktop version",
      };
    const eligible = byokProvidersFor("image").filter((provider) => {
      const id = provider.id as models.image.ImageProvider;
      return (
        models.image.binding(card, id) &&
        (!transparent || models.image.supportsTransparentBackground(card, id))
      );
    });
    if (
      eligible.some((provider) =>
        state.configured.includes(provider.id as models.image.ImageProvider)
      )
    ) {
      return { available: true };
    }
    // GRIDA-GG: desktop — hosted readiness follows the served Vercel binding.
    if (
      state.hosted &&
      models.image.binding(card, "vercel") &&
      (!transparent ||
        models.image.supportsTransparentBackground(card, "vercel"))
    ) {
      return { available: true };
    }
    const purpose = transparent
      ? "for transparent backgrounds"
      : "to use this model";
    return {
      available: false,
      reason: eligible.length
        ? `Connect a ${eligible.map((provider) => provider.label).join(" or ")} key ${purpose}`
        : "Transparent backgrounds are not supported by this model's available providers",
    };
  }

  /** Refreshable, secret-free key presence and hosted-session readiness. */
  export class ImageProviders {
    private current: ImageProviderState;
    private generation = 0;
    private listeners = new Set<() => void>();

    constructor(
      private readonly bridge: DesktopBridge | null,
      private readonly refreshHosted: () => Promise<boolean>
    ) {
      this.current = {
        loaded: false,
        images: !!bridge?.images,
        desktopVersion: bridge?.app.version,
        configured: [],
        hosted: false,
      };
    }

    readonly getSnapshot = (): ImageProviderState => this.current;

    readonly subscribe = (listener: () => void): (() => void) => {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    };

    async refresh(
      card?: models.image.ImageModelCard,
      transparent = false
    ): Promise<ImageProviderState> {
      const generation = ++this.generation;
      const bridge = this.bridge;
      const hosted = bridge?.images
        ? Promise.resolve()
            .then(() => this.refreshHosted())
            .catch(() => false)
        : Promise.resolve(false);
      const presence = bridge?.images
        ? await Promise.all(
            models.image.providers.map(async (id) => ({
              id,
              connected: await Promise.resolve()
                .then(() => bridge.secrets.has(id))
                .catch(() => false),
            }))
          )
        : [];
      const next: ImageProviderState = {
        loaded: true,
        images: !!bridge?.images,
        desktopVersion: bridge?.app.version,
        configured: presence
          .filter((provider) => provider.connected)
          .map((provider) => provider.id),
        hosted: false,
      };
      const publish = (state: ImageProviderState): ImageProviderState => {
        // A newer refresh or unmount invalidates this submit-time result too,
        // not only its UI update. Never return superseded connected keys.
        if (generation !== this.generation)
          return {
            ...this.current,
            loaded: false,
            configured: [],
            hosted: false,
          };
        if (this.current !== state) {
          this.current = state;
          for (const listener of this.listeners) listener();
        }
        return state;
      };
      const keyState = publish(next);
      // Publish BYOK immediately: a slow hosted mint must not hold a connected
      // local provider behind network IO. Only hosted-only submits await it.
      const hostedState = hosted.then((available) =>
        publish(available ? { ...next, hosted: true } : next)
      );
      if (
        card &&
        (image(card, keyState, transparent).available ||
          !image(card, { ...keyState, hosted: true }, transparent).available)
      ) {
        return keyState;
      }
      return hostedState;
    }

    /** Settings uses another window; recheck when the image surface regains focus. */
    connect(): () => void {
      const refresh = () => {
        void this.refresh();
      };
      const whenVisible = () => {
        if (document.visibilityState === "visible") refresh();
      };
      refresh();
      window.addEventListener("focus", refresh);
      document.addEventListener("visibilitychange", whenVisible);
      return () => {
        this.generation++;
        window.removeEventListener("focus", refresh);
        document.removeEventListener("visibilitychange", whenVisible);
      };
    }
  }

  export function filter<T extends MediaModelCard>(
    catalogue: readonly T[],
    modelIds?: readonly string[]
  ): readonly T[] {
    if (modelIds === undefined) return catalogue;
    const allowed = new Set(modelIds);
    return catalogue.filter((model) => allowed.has(model.id));
  }
}
