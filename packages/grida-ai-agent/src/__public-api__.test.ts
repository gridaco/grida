/**
 * Public-API guard test. Pins the shape and presence of every symbol
 * the root plus retained host, media transport and fs subpaths export.
 *
 * This is intentionally separate from the behavioural tests in
 * `fs/fs.test.ts`.
 * Those exercise behaviour; this one exercises the **contract**. A
 * rename, signature change, or accidental drop here = a breaking change
 * for consumers — the test should fail until the README / CHANGELOG has
 * been updated to advertise it.
 *
 * `AgentFs` is a class + same-named namespace. New public additions go
 * inside that namespace.
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
import { AgentFs } from "./fs";
import { OpfsBackend } from "./fs/backends/opfs";

describe("@grida/agent public API", () => {
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

  describe("AgentFs (class + namespace)", () => {
    it("is constructible with a Backend", () => {
      expectTypeOf(AgentFs).toBeConstructibleWith(new AgentFs.MemoryBackend());
    });

    it("exposes Backend, LiveBinding, Event, Listener", () => {
      const backend: AgentFs.Backend = new AgentFs.MemoryBackend();
      const binding: AgentFs.LiveBinding = {
        serialize: () => "",
        load: () => {},
        getVersion: () => 0,
      };
      const ev: AgentFs.Event = { type: "write", path: "/x", version: 0 };
      const listener: AgentFs.Listener = () => {};

      // Runtime check anchors the type-only assertions above.
      expect(backend).toBeInstanceOf(AgentFs.MemoryBackend);
      expect(typeof binding.serialize).toBe("function");
      expect(ev.type).toBe("write");
      expect(typeof listener).toBe("function");
    });

    it("exposes result + arg types", () => {
      // Pure-type guard: the file must compile against every public
      // result/arg alias. A drop or rename trips the build.
      type _R = AgentFs.ReadResult;
      type _WA = AgentFs.WriteArgs;
      type _W = AgentFs.WriteResult;
      type _WS = AgentFs.WriteSuccess;
      type _WF = AgentFs.WriteFailure;
      type _EA = AgentFs.EditArgs;
      type _E = AgentFs.EditResult;
      type _ES = AgentFs.EditSuccess;
      type _EF = AgentFs.EditFailure;
      type _D = AgentFs.DeleteResult;
      type _GA = AgentFs.GrepArgs;
      type _GM = AgentFs.GrepMatch;
      type _GR = AgentFs.GrepResult;
      type _O = AgentFs.Options;

      // Sample value lives on the result-success union — runtime
      // anchor for the otherwise type-only block.
      const ok: AgentFs.WriteSuccess = { ok: true, version: 1 };
      expect(ok.ok).toBe(true);
    });

    it("exposes failure-reason vocabularies (zod + TS share a source)", () => {
      // The const tuples are the source of the `*FailureReason` TS unions.
      // Const tuples — readonly arrays of literal-typed strings.
      expect(Array.isArray(AgentFs.WRITE_FAILURE_REASONS)).toBe(true);
      expect(Array.isArray(AgentFs.EDIT_FAILURE_REASONS)).toBe(true);
      expect(Array.isArray(AgentFs.DELETE_FAILURE_REASONS)).toBe(true);
      expectTypeOf<AgentFs.WriteFailureReason>().toEqualTypeOf<
        (typeof AgentFs.WRITE_FAILURE_REASONS)[number]
      >();
      expectTypeOf<AgentFs.EditFailureReason>().toEqualTypeOf<
        (typeof AgentFs.EDIT_FAILURE_REASONS)[number]
      >();
      expectTypeOf<AgentFs.DeleteFailureReason>().toEqualTypeOf<
        (typeof AgentFs.DELETE_FAILURE_REASONS)[number]
      >();

      // Spot-check membership so a typo in the const ARRAY (not the
      // type alias) is caught at runtime.
      expect(AgentFs.WRITE_FAILURE_REASONS).toContain("stale");
      expect(AgentFs.EDIT_FAILURE_REASONS).toContain("ambiguous");
      expect(AgentFs.DELETE_FAILURE_REASONS).toContain("mounted");
    });

    it("exposes MemoryBackend as the default in-process backend", () => {
      expectTypeOf(AgentFs.MemoryBackend).toBeConstructibleWith();
      const b: AgentFs.Backend = new AgentFs.MemoryBackend();
      void b;
    });

    it("does NOT re-export internal match helpers under the namespace", () => {
      // `findMatches` etc. live in `./internal/match` and are NOT
      // public-facing. Catching a leak here = catching it before it
      // turns into accidental contract.
      //
      // We assert that the *intersection* of public keys with the
      // internal names is `never`, so any single leaked name trips
      // the guard (a `not.toEqualTypeOf<A | B | C>` check would only
      // fail if all three leaked simultaneously).
      type LeakedInternalKeys = Extract<
        keyof typeof AgentFs,
        "findMatches" | "collapseWhitespace" | "applyReplacements"
      >;
      expectTypeOf<LeakedInternalKeys>().toEqualTypeOf<never>();
    });
  });

  describe("AgentFs subpath backends", () => {
    it("OpfsBackend (./fs/backends/opfs) implements AgentFs.Backend", () => {
      expectTypeOf(OpfsBackend).toBeConstructibleWith(["x"]);
      const b: AgentFs.Backend = new OpfsBackend(["x"]);
      void b;
    });
  });
});
