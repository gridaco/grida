import type { ImageClient } from "../image-client";
import type { VideoClient } from "../video-client";
import { byokProvidersFor } from "../provider-ids";
import type {
  CatalogueVisualKind,
  CatalogueVisualBinding,
  CatalogueVisualModel,
  CatalogueVisualOptions,
  ModelCatalogueSnapshot,
} from "./public-models.mjs";

/** Grida's installed visual adapters over a public Models V2 snapshot. */
export namespace VisualModels {
  export type Kind = CatalogueVisualKind;
  export type Provider = ImageClient.ByokProvider;
  export type Choice = Readonly<{
    id: string;
    label: string;
    options?: CatalogueVisualOptions;
    vendor?: string;
    short_description?: string;
    release_date?: string;
    providers: Readonly<
      Partial<
        Record<
          Provider,
          Readonly<{
            text?: true;
            image?: true;
            transparent?: true;
          }>
        >
      >
    >;
  }>;
  export type Read = () => Promise<ModelCatalogueSnapshot>;

  // Some exact bindings are URL path components in the installed adapters.
  function validBinding(id: string): boolean {
    return (
      id.length <= 256 &&
      id
        .split("/")
        .every((part) => /^[A-Za-z0-9_-][A-Za-z0-9_.:-]*$/.test(part))
    );
  }

  export function providers(kind: Kind): Provider[] {
    return byokProvidersFor(kind)
      .map(({ id }) => id)
      .filter(
        (id): id is Provider =>
          id === "fal" || id === "openrouter" || id === "vercel"
      );
  }

  function card(snapshot: ModelCatalogueSnapshot, kind: Kind, id: string) {
    const models = snapshot.visual?.[kind];
    if (!models || !Object.hasOwn(models, id)) return;
    const model = models[id];
    if (!model.deprecated && validBinding(id)) return model;
  }

  function inputMode(binding: CatalogueVisualBinding): string | undefined {
    return (
      binding.input ??
      binding.endpoints.find((endpoint) => endpoint.id === binding.id)?.input
    );
  }

  function binding(
    model: CatalogueVisualModel | undefined,
    provider: Provider
  ): CatalogueVisualBinding | undefined {
    const route = model?.bindings[provider];
    if (route && !route.deprecated && validBinding(route.id)) return route;
  }

  export function image(
    snapshot: ModelCatalogueSnapshot,
    id: string,
    provider: Provider,
    references = false,
    background?: ImageClient.Background
  ): ImageClient.Descriptor | null {
    const model = card(snapshot, "image", id);
    const route = binding(model, provider);
    if (
      !route ||
      !(
        route.pricingType === "per_image_flat" ||
        route.pricingType === "per_image_tiered" ||
        (route.pricingType === "per_token" && route.scalarTokenPricing)
      )
    )
      return null;

    const input = inputMode(route);
    if (
      !references &&
      input !== undefined &&
      input !== "text" &&
      input !== "text-or-image"
    )
      return null;
    const reference = route.references;
    if (references && (!reference || !validBinding(reference.id))) return null;
    const transparent =
      route.transparentBackground ?? model?.transparentBackground;
    if (background && background !== "auto" && !transparent) return null;
    return {
      model_id: id,
      provider_id: provider,
      binding_id: references ? reference!.id : route.id,
      ...(references && { references_max: reference!.max }),
      ...(transparent && { native_background: true as const }),
    };
  }

  export function video(
    snapshot: ModelCatalogueSnapshot,
    id: string,
    provider: Provider,
    withImage = false
  ): VideoClient.Descriptor | null {
    const route = binding(card(snapshot, "video", id), provider);
    if (
      !route ||
      (route.pricingType !== "per_second" &&
        route.pricingType !== "provider_skus")
    )
      return null;
    const mode = inputMode(route);
    if (!(mode === "text-or-image" || mode === (withImage ? "image" : "text")))
      return null;
    return {
      model_id: id,
      provider_id: provider,
      binding_id: route.id,
      input: mode,
    };
  }

  export function list(snapshot: ModelCatalogueSnapshot, kind: Kind): Choice[] {
    const choices: Choice[] = [];
    const installedProviders = providers(kind);
    for (const model of Object.values(snapshot.visual?.[kind] ?? {})) {
      const routes: Partial<Record<Provider, Choice["providers"][Provider]>> =
        {};
      for (const provider of installedProviders) {
        const text =
          kind === "image"
            ? image(snapshot, model.id, provider)
            : video(snapshot, model.id, provider);
        const input =
          kind === "image"
            ? image(snapshot, model.id, provider, true)
            : video(snapshot, model.id, provider, true);
        if (!text && !input) continue;
        routes[provider] = {
          ...(text && { text: true as const }),
          ...(input && { image: true as const }),
          ...(text &&
            "native_background" in text &&
            text.native_background && { transparent: true as const }),
        };
      }
      if (!Object.keys(routes).length) continue;
      choices.push({
        id: model.id,
        label: model.label,
        vendor: model.vendor,
        short_description: model.shortDescription,
        release_date: model.releaseDate,
        options: model.options,
        providers: routes,
      });
    }
    return choices;
  }
}
