/**
 * Public-API guard test. Pins the shape and presence of every symbol
 * the root plus the retained host and media transport subpaths export.
 *
 * Behavioural tests live beside each module; this one exercises the
 * **contract**. A rename, signature change, or accidental drop here = a
 * breaking change for consumers.
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import type { MediaItem } from "@grida/daemon";

import * as root from ".";
import {
  BYOK_PROVIDER_METADATA,
  BYOK_PROVIDER_IDS,
  type ByokProviderId,
  type ImageGenerateResult,
  type VideoGenerateResult,
  type ThreeDGenerateRequest,
  type ThreeDGenerateResult,
  type MusicGenerateRequest,
  type MusicGenerateResult,
  type SoundEffectGenerateRequest,
  type SoundEffectGenerateResult,
  type TextToSpeechGenerateRequest,
  type TextToSpeechGenerateResult,
  type TextToSpeechListVoicesResult,
  type TextToSpeechVoice,
} from ".";
import {
  ChatGptSubscriptionHost,
  type ChatGptProviderConfig,
} from "./chatgpt-host";
import {
  createMediaDaemon,
  createMediaTenant,
  type MediaDaemonOptions,
} from "./media-server";
import { DaemonServer } from "@grida/daemon/server";
import { MediaTransport } from "./media-transport";

describe("@grida/ai-host public API", () => {
  describe("root protocol exports", () => {
    it("exposes no agent execution, tool or event vocabulary", () => {
      for (const name of [
        "createAgent",
        "createToolset",
        "composeSystemPrompt",
        "GRIDA_EVENTS_SSE_EVENT",
        "GRIDA_STATUS_SSE_EVENT",
        "RUN_COMMAND_TOOL_NAME",
        "QUESTION_TOOL_NAME",
        "SURFACE_OPEN_TOOL_NAME",
        "CHATGPT_AUTH_ROUTE_PATHS",
      ]) {
        expect(name in root).toBe(false);
      }
    });

    it("exposes BYOK provider identity and media shapes", () => {
      // Media-only providers remain excluded from the text resolver via their
      // modality markers while still joining the closed secrets vocabulary.
      expect(BYOK_PROVIDER_IDS).toEqual([
        "openrouter",
        "vercel",
        "fal",
        "elevenlabs",
        "tripo",
      ]);
      expect(BYOK_PROVIDER_METADATA.map((provider) => provider.label)).toEqual([
        "OpenRouter",
        "Vercel AI Gateway",
        "fal",
        "ElevenLabs",
        "Tripo",
      ]);
      // The modality matrix drives image/video resolver routing (via
      // byokProvidersFor) — pin it so a bad metadata edit can't silently
      // re-route provider selection.
      expect(
        BYOK_PROVIDER_METADATA.map(({ id, modalities }) => ({ id, modalities }))
      ).toEqual([
        { id: "openrouter", modalities: ["text", "image", "video"] },
        { id: "vercel", modalities: ["text", "image", "video"] },
        { id: "fal", modalities: ["image", "video"] },
        { id: "elevenlabs", modalities: [] },
        { id: "tripo", modalities: [] },
      ]);
      const byok: ByokProviderId = "vercel";
      expect(byok).toBe("vercel");
      expect(BYOK_PROVIDER_METADATA[0].id).toBe("openrouter");

      expectTypeOf<
        ImageGenerateResult["images"][number]["stored_media"]
      >().toEqualTypeOf<MediaItem | undefined>();
      expectTypeOf<
        VideoGenerateResult["videos"][number]["stored_media"]
      >().toEqualTypeOf<MediaItem | undefined>();

      const threeDRequest: ThreeDGenerateRequest = {
        model_id: "fal-ai/trellis-2",
        image: { base64: "AAAA", media_type: "image/png" },
      };
      expect(threeDRequest.model_id).toBe("fal-ai/trellis-2");
      expectTypeOf<
        ThreeDGenerateResult["glb"]["base64"]
      >().toEqualTypeOf<string>();
      expectTypeOf<ThreeDGenerateResult["stored_media"]>().toEqualTypeOf<
        MediaItem | undefined
      >();
      expectTypeOf<MusicGenerateRequest["prompt"]>().toEqualTypeOf<string>();
      expectTypeOf<
        MusicGenerateResult["audio"]["file_name"]
      >().toEqualTypeOf<string>();
      expectTypeOf<MusicGenerateResult["stored_media"]>().toEqualTypeOf<
        MediaItem | undefined
      >();
      expectTypeOf<
        SoundEffectGenerateRequest["prompt"]
      >().toEqualTypeOf<string>();
      expectTypeOf<
        SoundEffectGenerateResult["audio"]["file_name"]
      >().toEqualTypeOf<string>();
      expectTypeOf<SoundEffectGenerateResult["stored_media"]>().toEqualTypeOf<
        MediaItem | undefined
      >();
      expectTypeOf<TextToSpeechVoice>().toEqualTypeOf<{
        voice_id: string;
        name: string;
      }>();
      expectTypeOf<
        TextToSpeechListVoicesResult["voices"][number]
      >().toEqualTypeOf<TextToSpeechVoice>();
      expectTypeOf<
        TextToSpeechGenerateRequest["model_id"]
      >().toEqualTypeOf<"eleven_v3">();
      expectTypeOf<
        TextToSpeechGenerateResult["audio"]["file_name"]
      >().toEqualTypeOf<string>();
      expectTypeOf<TextToSpeechGenerateResult["stored_media"]>().toEqualTypeOf<
        MediaItem | undefined
      >();
    });

    it("exposes the endpoint-provider contract (issue #806)", () => {
      expect(root.OLLAMA_ENDPOINT_PRESET).toEqual({
        id: "ollama",
        label: "Ollama",
        base_url: "http://localhost:11434/v1",
      });
      expect(typeof root.isValidEndpointProviderId).toBe("function");
      expect(typeof root.validateEndpointProviderConfig).toBe("function");
      expect(typeof root.mergeProbedModels).toBe("function");
      const config: root.EndpointProviderConfig = {
        ...root.OLLAMA_ENDPOINT_PRESET,
        models: [{ id: "llama3.1:8b", tool_call: true }],
      };
      const model: root.EndpointModelSpec = config.models[0];
      expect(model.id).toBe("llama3.1:8b");
    });

    it("does not expose internal runtime/provider/server modules from the root", () => {
      expect("AgentRuntime" in root).toBe(false);
      expect("createAgentDaemon" in root).toBe(false);
      expect("StreamRegistry" in root).toBe(false);
      expect("buildServer" in root).toBe(false);
      expect("resolveProvider" in root).toBe(false);
      expect(`${"Agent"}${"Chunk"}` in root).toBe(false);
      // Daemon-owned DTOs (handshake, workspace/file resources) moved to
      // `@grida/daemon` (#927) — the agent root must not re-grow them.
      expect(`${"AGENT_SERVER"}_PROTOCOL` in root).toBe(false);
      expect(`${"AGENT_SERVER"}_DEFAULT_CAPABILITIES` in root).toBe(false);
    });
  });

  describe("retained Node host subpaths", () => {
    it("exposes media composition and native subscription configuration", () => {
      expectTypeOf(createMediaDaemon).returns.toEqualTypeOf<DaemonServer>();
      expect(typeof createMediaTenant().register).toBe("function");
      expect(typeof ChatGptSubscriptionHost).toBe("function");
      expectTypeOf<
        ConstructorParameters<
          typeof ChatGptSubscriptionHost
        >[0]["configuration"]
      >().toEqualTypeOf<ChatGptProviderConfig>();
      const options: Pick<MediaDaemonOptions, "endpoint_settings"> = {
        endpoint_settings: true,
      };
      expect(options.endpoint_settings).toBe(true);
    });
  });

  describe("media-transport subpath", () => {
    it("exposes a media client without the chat route groups", () => {
      const client = new MediaTransport.Client({
        base_url: MediaTransport.baseUrl(49152),
        password: "pw",
      });
      expect(typeof client.images.generate).toBe("function");
      expect(typeof client.providers.list_endpoints).toBe("function");
      expect(typeof client.gg.status).toBe("function");
      expect("sessions" in client).toBe(false);
      expect("agent" in client).toBe(false);
      expect("events" in client).toBe(false);
      expect("directory_scopes" in client).toBe(false);
    });
  });
});
