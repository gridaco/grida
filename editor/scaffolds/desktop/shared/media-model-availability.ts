import { catalog as models } from "@grida/ai-models/grida";
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

  type ProviderState = Readonly<{
    loaded: boolean;
    desktopVersion?: string;
    configured: readonly models.image.ImageProvider[];
    hosted: boolean;
  }>;

  export type ImageProviderState = ProviderState &
    Readonly<{ images: boolean }>;
  export type VideoProviderState = ProviderState & Readonly<{ video: boolean }>;

  export type ImageAccess = Readonly<{
    available: boolean;
    reason?: string;
  }>;

  export const imageUpdateMessage = "Update Grida Desktop to use this model";

  /** Desktop 0.0.25 resolves GG media independently of BYOK bindings.
   * See test/desktop-media-hosted-fal-compatibility.md for native verification.
   */
  export function supportsHostedMedia(desktopVersion?: string): boolean {
    return supportsVersion(desktopVersion, 25);
  }

  function supportsVersion(
    desktopVersion: string | undefined,
    minimumPatch: number
  ): boolean {
    const match = desktopVersion?.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
    if (!match) return false;
    const [major, minor, patch] = match.slice(1, 4).map(Number);
    return major > 0 || minor > 0 || patch >= minimumPatch;
  }

  /** Background request fields first ship in Desktop 0.0.22. */
  export function supportsImageBackground(desktopVersion?: string): boolean {
    return supportsVersion(desktopVersion, 22);
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
    // GRIDA-GG: desktop — hosted admission comes from the service operation.
    const hosted = models.image.hostedBinding(card);
    if (
      state.hosted &&
      hosted &&
      (!transparent ||
        models.image.supportsTransparentBackground(card, hosted.provider))
    ) {
      // Existing native clients can submit only their original Vercel-compatible
      // shape. The server may switch that request's provider independently.
      if (
        supportsHostedMedia(state.desktopVersion) ||
        (models.image.binding(card, "vercel") &&
          (!transparent ||
            models.image.supportsTransparentBackground(card, "vercel")))
      )
        return { available: true };
      return { available: false, reason: imageUpdateMessage };
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

  /** Text-to-video readiness, including the installed native route contract. */
  export function video(
    card: models.video.VideoModelCard | undefined,
    state: VideoProviderState
  ): ImageAccess {
    if (!card?.listed)
      return { available: false, reason: "Choose a video model" };
    if (
      card.id === "google/gemini-omni-1.1-flash" &&
      !supportsHostedMedia(state.desktopVersion)
    ) {
      return { available: false, reason: imageUpdateMessage };
    }
    if (!state.loaded)
      return { available: false, reason: "Checking connected providers…" };
    if (!state.video)
      return {
        available: false,
        reason: "Video generation is unavailable in this Desktop version",
      };
    const eligible = byokProvidersFor("video").filter((provider) => {
      const id = provider.id as models.video.VideoProvider;
      if (supportsHostedMedia(state.desktopVersion))
        return !!models.video.textToVideoBinding(card, id);
      const mode = models.video.input(card, id);
      return mode === "text" || mode === "text-or-image";
    });
    if (
      eligible.some((provider) =>
        state.configured.includes(provider.id as models.video.VideoProvider)
      )
    ) {
      return { available: true };
    }
    // GRIDA-GG: desktop — a hosted session does not supply native adapter code.
    if (state.hosted && models.video.hostedBinding(card)) {
      const legacy = models.video.input(card, "vercel");
      if (
        supportsHostedMedia(state.desktopVersion) ||
        legacy === "text" ||
        legacy === "text-or-image"
      ) {
        return { available: true };
      }
      return { available: false, reason: imageUpdateMessage };
    }
    if (
      !supportsHostedMedia(state.desktopVersion) &&
      state.configured.some((id) => models.video.textToVideoBinding(card, id))
    ) {
      return { available: false, reason: imageUpdateMessage };
    }
    return {
      available: false,
      reason: eligible.length
        ? `Connect a ${eligible.map((provider) => provider.label).join(" or ")} key to use this model`
        : "Text-to-video is unavailable for this model's connected routes",
    };
  }

  /** Refreshable, secret-free key presence and hosted-session readiness. */
  class ProviderStore<Card, State extends ProviderState> {
    private generation = 0;
    private listeners = new Set<() => void>();

    constructor(
      private readonly bridge: DesktopBridge | null,
      private readonly refreshHosted: () => Promise<boolean>,
      private readonly supported: boolean,
      private readonly providers: readonly models.image.ImageProvider[],
      private readonly access: (
        card: Card,
        state: State,
        transparent: boolean
      ) => ImageAccess,
      private current: State
    ) {}

    readonly getSnapshot = (): State => this.current;

    readonly subscribe = (listener: () => void): (() => void) => {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    };

    async refresh(card?: Card, transparent = false): Promise<State> {
      const generation = ++this.generation;
      const bridge = this.bridge;
      const hosted = this.supported
        ? Promise.resolve()
            .then(() => this.refreshHosted())
            .catch(() => false)
        : Promise.resolve(false);
      const presence =
        this.supported && bridge
          ? await Promise.all(
              this.providers.map(async (id) => ({
                id,
                connected: await Promise.resolve()
                  .then(() => bridge.secrets.has(id))
                  .catch(() => false),
              }))
            )
          : [];
      const next: State = {
        ...this.current,
        loaded: true,
        configured: presence
          .filter((provider) => provider.connected)
          .map((provider) => provider.id),
        hosted: false,
      };
      const publish = (state: State): State => {
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
        (this.access(card, keyState, transparent).available ||
          !this.access(card, { ...keyState, hosted: true }, transparent)
            .available)
      ) {
        return keyState;
      }
      return hostedState;
    }

    /** Settings uses another window; recheck when the media surface regains focus. */
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

  export class ImageProviders extends ProviderStore<
    models.image.ImageModelCard,
    ImageProviderState
  > {
    constructor(
      bridge: DesktopBridge | null,
      refreshHosted: () => Promise<boolean>
    ) {
      super(
        bridge,
        refreshHosted,
        !!bridge?.images,
        models.image.providers,
        image,
        {
          loaded: false,
          images: !!bridge?.images,
          desktopVersion: bridge?.app.version,
          configured: [],
          hosted: false,
        }
      );
    }
  }

  export class VideoProviders extends ProviderStore<
    models.video.VideoModelCard,
    VideoProviderState
  > {
    constructor(
      bridge: DesktopBridge | null,
      refreshHosted: () => Promise<boolean>
    ) {
      super(
        bridge,
        refreshHosted,
        !!bridge?.video,
        models.video.providers,
        video,
        {
          loaded: false,
          video: !!bridge?.video,
          desktopVersion: bridge?.app.version,
          configured: [],
          hosted: false,
        }
      );
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
