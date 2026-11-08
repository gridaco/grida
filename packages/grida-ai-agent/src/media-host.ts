import { supportsGGPromptOperation } from "@grida/ai/discovery";
// GRIDA-SEC-004 — shared media routes consume only daemon-owned services.
// GRIDA-SEC-006 / GRIDA-GG: provider — one per-launch GG store and catalogue.
import type { Hono } from "hono";
import type { DaemonServices } from "@grida/daemon/server";
import {
  GridaGatewaySessionStore,
  GGDiscoveryStore,
  ModelCatalogStore,
  ProviderHttp,
} from "@grida/ai";
import { catalog as models } from "@grida/ai/catalogue";
import type { MediaTenantOptions } from "./media-server";
import type { EndpointProvidersStore } from "./providers/endpoints";
import { registerSecretsRoutes } from "./http/routes/secrets";
import { registerGridaAuthRoutes } from "./http/routes/gg-auth";
import { registerImagesRoutes } from "./http/routes/images";
import { registerVideoRoutes } from "./http/routes/video";
import { registerModelGenerationRoutes } from "./http/routes/model-generation";
import { registerRiggingRoutes } from "./http/routes/rigging";
import { registerThreeDRoutes } from "./http/routes/three-d";
import { registerMusicRoutes } from "./http/routes/music";
import { registerSoundEffectsRoutes } from "./http/routes/sound-effects";
import { registerTextToSpeechRoutes } from "./http/routes/text-to-speech";

/** Private composition shared by the media entry and the full agent tenant. */
export class MediaHost {
  readonly providerHttp: ProviderHttp;
  readonly gridaSession = new GridaGatewaySessionStore();
  readonly modelCatalog: ModelCatalogStore;
  readonly ggCatalog: GGDiscoveryStore;
  readonly gridaGatewayBaseUrl: string | undefined;
  readonly capabilities;

  constructor(
    private readonly services: DaemonServices,
    opts: MediaTenantOptions,
    private readonly agent: {
      endpoints?: EndpointProvidersStore;
      on_provider_ready?: () => void;
    } = {}
  ) {
    this.providerHttp = new ProviderHttp(opts.provider_http);
    this.gridaGatewayBaseUrl =
      typeof opts.gg_base_url === "string" && opts.gg_base_url.length > 0
        ? opts.gg_base_url
        : undefined;
    this.capabilities = {
      secrets: opts.capabilities?.secrets ?? true,
      images: opts.capabilities?.images ?? true,
      video: opts.capabilities?.video ?? true,
      three_d: opts.capabilities?.three_d ?? true,
      music: opts.capabilities?.music ?? true,
      sound_effects: opts.capabilities?.sound_effects ?? true,
      text_to_speech: opts.capabilities?.text_to_speech ?? true,
      gg: this.gridaGatewayBaseUrl !== undefined,
    };
    this.ggCatalog = new GGDiscoveryStore({
      fetch: this.providerHttp.request,
      on_change: agent.on_provider_ready,
      disabled: process.env.GRIDA_AGENT_DISABLE_MODELS_FETCH === "1",
    });
    this.modelCatalog = new ModelCatalogStore({
      // Native BYOK facts are the reviewed installed release. The schema-1
      // endpoint remains compatibility for old installations, not this store's authority.
      snapshot: models.snapshot.seed(),
      on_change: agent.on_provider_ready,
    });
  }

  register(app: Hono): void {
    const {
      services,
      providerHttp,
      gridaSession,
      gridaGatewayBaseUrl,
      modelCatalog,
    } = this;
    const caps = this.capabilities;
    if (caps.gg) {
      app.get("/providers/gg/models", async (c) => {
        const snapshot = await this.ggCatalog.ready();
        if (!snapshot)
          return c.json({ error: "model discovery is unavailable" }, 503);
        return c.json({
          revision: snapshot.revision,
          expires_at: snapshot.expires_at,
          endpoint_ids: snapshot.endpoints.map((endpoint) => endpoint.id),
          models: snapshot.models
            .filter(
              (model) =>
                model.interfaces.includes("chat.completions") ||
                snapshot.operations.some(
                  (item) =>
                    item.model_id === model.id &&
                    ((model.kind === "three-d" &&
                      model.id.startsWith("tripo/")) ||
                      supportsGGPromptOperation(item))
                )
            )
            .map(({ request_schemas: _schemas, ...model }) => {
              const operation = snapshot.operations.find(
                (item) =>
                  item.model_id === model.id &&
                  item.path === "/v1/images/generations" &&
                  item.variant === "text"
              );
              const properties = operation?.input_schema.properties as
                | Record<string, { enum?: unknown[] }>
                | undefined;
              const backgrounds = properties?.background?.enum?.filter(
                (value): value is string => typeof value === "string"
              );
              return {
                ...model,
                ...(backgrounds?.length
                  ? { client_supported_options: { background: backgrounds } }
                  : {}),
              };
            }),
          operations: snapshot.operations.map(
            ({ input_schema: _schema, ...operation }) => operation
          ),
        });
      });
      registerGridaAuthRoutes(app, {
        store: gridaSession,
        on_provider_ready: this.agent.on_provider_ready,
      });
    }
    if (caps.secrets) {
      registerSecretsRoutes(app, {
        store: services.secrets,
        endpoints: this.agent.endpoints,
        on_provider_ready: this.agent.on_provider_ready,
      });
    }
    if (caps.images) {
      registerImagesRoutes(app, {
        secrets: services.secrets,
        media: services.media,
        gg: gridaSession,
        gg_base_url: gridaGatewayBaseUrl,
        provider_http: providerHttp,
        catalog: modelCatalog,
        gg_catalog: this.ggCatalog,
      });
    }
    if (caps.video) {
      registerVideoRoutes(app, {
        secrets: services.secrets,
        media: services.media,
        gg: gridaSession,
        gg_base_url: gridaGatewayBaseUrl,
        provider_http: providerHttp,
        catalog: modelCatalog,
        gg_catalog: this.ggCatalog,
      });
    }
    if (caps.three_d) {
      registerRiggingRoutes(app, {
        gg_catalog: this.ggCatalog,
        gg: gridaSession,
        gg_base_url: gridaGatewayBaseUrl,
        secrets: services.secrets,
        media: services.media,
        provider_http: providerHttp,
      });
      registerModelGenerationRoutes(app, {
        gg_catalog: this.ggCatalog,
        gg: gridaSession,
        gg_base_url: gridaGatewayBaseUrl,
        secrets: services.secrets,
        media: services.media,
        provider_http: providerHttp,
      });
      registerThreeDRoutes(app, {
        secrets: services.secrets,
        media: services.media,
        provider_http: providerHttp,
      });
    }
    if (caps.music) {
      registerMusicRoutes(app, {
        gg_catalog: this.ggCatalog,
        media: services.media,
        gg: gridaSession,
        gg_base_url: gridaGatewayBaseUrl,
        provider_http: providerHttp,
      });
    }
    if (caps.sound_effects) {
      registerSoundEffectsRoutes(app, {
        secrets: services.secrets,
        media: services.media,
        provider_http: providerHttp,
      });
    }
    if (caps.text_to_speech) {
      registerTextToSpeechRoutes(app, {
        secrets: services.secrets,
        media: services.media,
        provider_http: providerHttp,
      });
    }
  }

  /** Start only after the full composition has installed its ready callback. */
  start(): void {
    this.modelCatalog.start();
    if (this.capabilities.gg) this.ggCatalog.start();
  }

  dispose(): void {
    this.modelCatalog.dispose();
    this.ggCatalog.dispose();
    this.gridaSession.clear();
  }
}
