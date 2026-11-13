/**
 * GRIDA-SEC-004 — the retained media service's HTTP client.
 *
 * Extends the daemon client (handshake, files, recents, workspaces) with the
 * media sidecar's route groups: provider secrets, endpoint settings, the
 * Grida hosted-AI session and media generation. It carries no chat, session,
 * lifecycle-event or directory-scope code, so a host that only talks to the
 * media service never bundles the chat transport.
 */

import { DaemonTransport } from "@grida/daemon/transport";
import type { GGModelsView } from "./protocol/gg-models";
import type {
  ImageGenerateRequest,
  ImageGenerateResult,
} from "./protocol/images";
// Type-only (erased): the wire shapes of /auth/gg/* — the store class
// itself never crosses to clients.
import type {
  GridaGatewaySession,
  GridaGatewaySessionStatus,
} from "./providers/gg-session";
import type {
  VideoGenerateRequest,
  VideoGenerateResult,
} from "./protocol/video";
import type {
  ThreeDGenerateRequest,
  ThreeDGenerateResult,
} from "./protocol/three-d";
import type {
  MusicGenerateRequest,
  MusicGenerateResult,
} from "./protocol/music";
import type {
  SoundEffectGenerateRequest,
  SoundEffectGenerateResult,
} from "./protocol/sound-effects";
import type {
  TextToSpeechGenerateRequest,
  TextToSpeechGenerateResult,
  TextToSpeechListVoicesResult,
} from "./protocol/text-to-speech";
import type {
  ModelGenerationGenerateRequest,
  ModelGenerationGenerateResult,
} from "./protocol/model-generation";
import type {
  RigCheckRequest,
  RigCheckResult,
  RiggingGenerateRequest,
  RiggingGenerateResult,
} from "./protocol/rigging";
import type {
  EndpointProviderConfig,
  ProbedEndpointModel,
} from "./protocol/endpoints";

export namespace MediaTransport {
  export const baseUrl = DaemonTransport.baseUrl;
  export const makeFetcher = DaemonTransport.makeFetcher;
  export type Fetcher = DaemonTransport.Fetcher;
  export type ClientOptions = DaemonTransport.ClientOptions;

  /** The daemon groups by inheritance plus the media service's groups. */
  export class Client extends DaemonTransport.Client {
    readonly secrets = {
      has: async (providerId: string): Promise<boolean> => {
        const res = await this.postJson<{ has: boolean }>("/secrets/has", {
          provider_id: providerId,
        });
        return res.has;
      },
      set: async (providerId: string, key: string): Promise<void> => {
        await this.postJson<unknown>("/secrets/set", {
          provider_id: providerId,
          key,
        });
      },
      delete: async (providerId: string): Promise<void> => {
        await this.postJson<unknown>("/secrets/delete", {
          provider_id: providerId,
        });
      },
    } as const;

    readonly providers = {
      gg_models: async (): Promise<GGModelsView> =>
        await this.getJson<GGModelsView>("/providers/gg/models"),
      /** Endpoint provider configs (issue #806) — readable plain config,
       *  unlike secrets. */
      list_endpoints: async (): Promise<EndpointProviderConfig[]> =>
        await this.postJson<EndpointProviderConfig[]>(
          "/providers/endpoints/list"
        ),
      set_endpoint: async (config: EndpointProviderConfig): Promise<void> => {
        await this.postJson<unknown>("/providers/endpoints/set", { config });
      },
      delete_endpoint: async (id: string): Promise<void> => {
        await this.postJson<unknown>("/providers/endpoints/delete", { id });
      },
      /** Where the endpoint config JSON lives on disk. */
      info: async (): Promise<{ path: string }> =>
        await this.postJson<{ path: string }>("/providers/endpoints/info"),
      /** Discover the models an endpoint serves (host-side fetch). */
      probe_endpoint: async (
        baseUrl: string
      ): Promise<{
        source: "ollama" | "openai";
        models: ProbedEndpointModel[];
      }> =>
        await this.postJson("/providers/endpoints/probe", {
          base_url: baseUrl,
        }),
    } as const;

    /** Grida hosted ("included") AI session (GRIDA-SEC-006). Push-only
     *  custody: the renderer mints and pushes the short-lived token;
     *  `status` never returns it. Gated by the `gg` capability. */
    readonly gg = {
      set_session: async (session: GridaGatewaySession): Promise<void> => {
        await this.postJson<unknown>("/auth/gg/set", session);
      },
      clear_session: async (): Promise<void> => {
        await this.postJson<unknown>("/auth/gg/clear");
      },
      status: async (): Promise<GridaGatewaySessionStatus> =>
        await this.postJson<GridaGatewaySessionStatus>("/auth/gg/status"),
    } as const;

    /** BYOK image generation (#908). Desktop-only; gated by the `images`
     *  capability. Returns base64 bytes — never the user's key. */
    readonly images = {
      generate: async (
        req: ImageGenerateRequest
      ): Promise<ImageGenerateResult> =>
        await this.postJson<ImageGenerateResult>("/images/generate", req),
    } as const;

    /** BYOK video generation (#908). Desktop-only; gated by the `video`
     *  capability. Returns base64 bytes only — never a provider URL or the
     *  user's key. */
    readonly video = {
      generate: async (
        req: VideoGenerateRequest
      ): Promise<VideoGenerateResult> =>
        await this.postJson<VideoGenerateResult>("/video/generate", req),
    } as const;

    /** fal BYOK 3D generation. Returns primary GLB bytes only. */
    readonly threeD = {
      generate: async (
        req: ThreeDGenerateRequest
      ): Promise<ThreeDGenerateResult> =>
        await this.postJson<ThreeDGenerateResult>("/three-d/generate", req),
    } as const;

    /** Explicit model-generation feature, with typed input variants. */
    readonly modelGeneration = {
      generate: async (
        req: ModelGenerationGenerateRequest
      ): Promise<ModelGenerationGenerateResult> =>
        await this.postJson<ModelGenerationGenerateResult>(
          "/model-generation/generate",
          req
        ),
    } as const;

    /** Eligibility is structured; explicit rigging returns portable GLB bytes. */
    readonly rigging = {
      check: async (req: RigCheckRequest): Promise<RigCheckResult> =>
        await this.postJson<RigCheckResult>("/rigging/check", req),
      generate: async (
        req: RiggingGenerateRequest
      ): Promise<RiggingGenerateResult> =>
        await this.postJson<RiggingGenerateResult>("/rigging/generate", req),
    } as const;

    /**
     * Output-format grouping only: hosted music, ElevenLabs Sound Effects, and
     * ElevenLabs Text to Speech remain independent provider/request contracts.
     */
    readonly audio = {
      music: {
        generate: async (
          req: MusicGenerateRequest
        ): Promise<MusicGenerateResult> =>
          await this.postJson<MusicGenerateResult>(
            "/audio/music/generate",
            req
          ),
      },
      soundEffects: {
        generate: async (
          req: SoundEffectGenerateRequest
        ): Promise<SoundEffectGenerateResult> =>
          await this.postJson<SoundEffectGenerateResult>(
            "/audio/sound-effects/generate",
            req
          ),
      },
      textToSpeech: {
        listVoices: async (): Promise<TextToSpeechListVoicesResult> =>
          await this.getJson<TextToSpeechListVoicesResult>(
            "/audio/text-to-speech/voices"
          ),
        generate: async (
          req: TextToSpeechGenerateRequest
        ): Promise<TextToSpeechGenerateResult> =>
          await this.postJson<TextToSpeechGenerateResult>(
            "/audio/text-to-speech/generate",
            req
          ),
      },
    } as const;
  }
}
