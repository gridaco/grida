import { describe, expect, it } from "vitest";
import { AgentTransport } from "./transport";
import type {
  VideoGenerateRequest,
  VideoGenerateResult,
} from "./protocol/video";
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

describe("AgentTransport media generation routes", () => {
  it("preserves the video request and receipt wire through the fixed route", async () => {
    const request: VideoGenerateRequest = {
      model_id: "google/veo-3.1",
      provider: "fal",
      prompt: "a wave",
      aspect_ratio: "16:9",
      resolution: "1280x720",
      duration: 8,
      fps: 24,
      seed: 7,
      image_url: "https://inputs.example/start.png",
    };
    const result: VideoGenerateResult = {
      model_id: request.model_id,
      provider_id: "fal",
      videos: [
        {
          base64: "AAAY",
          media_type: "video/mp4",
          stored_media: {
            id: "7ccb8e68-a201-40d9-a793-44de9e6c6fc6",
            file_name: "video-1.mp4",
            media_type: "video/mp4",
            byte_size: 3,
            created_at: 1,
          },
        },
      ],
    };
    const client = new AgentTransport.Client({
      fetcher: async (path, init) => {
        expect(path).toBe("/video/generate");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual(request);
        return Response.json(result);
      },
    });
    expect(await client.video.generate(request)).toEqual(result);
  });

  it("preserves music seed zero and its root-level receipt through the fixed route", async () => {
    const request: MusicGenerateRequest = {
      model_id: "google/lyria-3-pro",
      prompt: "a quiet waltz",
      seed: 0,
    };
    const result: MusicGenerateResult = {
      model_id: request.model_id,
      provider_id: "gg",
      audio: {
        base64: "SUQz",
        media_type: "audio/mpeg",
        file_name: "lyria-3-pro.mp3",
      },
      stored_media: {
        id: "7ccb8e68-a201-40d9-a793-44de9e6c6fc6",
        file_name: "lyria-3-pro.mp3",
        media_type: "audio/mpeg",
        byte_size: 3,
        created_at: 1,
      },
    };
    const client = new AgentTransport.Client({
      fetcher: async (path, init) => {
        expect(path).toBe("/audio/music/generate");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual(request);
        return Response.json(result);
      },
    });
    expect(await client.audio.music.generate(request)).toEqual(result);
  });

  it("preserves sound-effect false/zero options and its root-level receipt", async () => {
    const request: SoundEffectGenerateRequest = {
      model_id: "eleven_text_to_sound_v2",
      prompt: "a door closing",
      duration_seconds: 2,
      loop: false,
      prompt_influence: 0,
    };
    const result: SoundEffectGenerateResult = {
      model_id: request.model_id,
      provider_id: "elevenlabs",
      audio: {
        base64: "SUQz",
        media_type: "audio/mpeg",
        file_name: "sound-effect.mp3",
      },
      stored_media: {
        id: "cbb1523d-e740-45fd-bbac-17610609d062",
        file_name: "sound-effect.mp3",
        media_type: "audio/mpeg",
        byte_size: 3,
        created_at: 2,
      },
    };
    const client = new AgentTransport.Client({
      fetcher: async (path, init) => {
        expect(path).toBe("/audio/sound-effects/generate");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual(request);
        return Response.json(result);
      },
    });
    expect(await client.audio.soundEffects.generate(request)).toEqual(result);
  });

  it("preserves voice-list and speech wire contracts with text tags and a root receipt", async () => {
    const request: TextToSpeechGenerateRequest = {
      model_id: "eleven_v3",
      voice_id: " voice-a ",
      text: "\n [whispers] Hello there. \t",
    };
    const voices: TextToSpeechListVoicesResult = {
      provider_id: "elevenlabs",
      voices: [{ voice_id: "voice-a", name: "Alice" }],
    };
    const result: TextToSpeechGenerateResult = {
      model_id: request.model_id,
      provider_id: "elevenlabs",
      voice_id: "voice-a",
      audio: {
        base64: "SUQz",
        media_type: "audio/mpeg",
        file_name: "speech.mp3",
      },
      stored_media: {
        id: "cbb1523d-e740-45fd-bbac-17610609d062",
        file_name: "speech.mp3",
        media_type: "audio/mpeg",
        byte_size: 3,
        created_at: 2,
      },
    };
    const seen: Array<{ path: string; method?: string; body: unknown }> = [];
    const client = new AgentTransport.Client({
      fetcher: async (path, init) => {
        seen.push({
          path,
          method: init?.method,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        if (path === "/audio/text-to-speech/voices") {
          return Response.json(voices);
        }
        return Response.json(result);
      },
    });
    expect(await client.audio.textToSpeech.listVoices()).toEqual(voices);
    expect(await client.audio.textToSpeech.generate(request)).toEqual(result);
    expect(seen.map(({ path }) => path)).toEqual([
      "/audio/text-to-speech/voices",
      "/audio/text-to-speech/generate",
    ]);
    expect(seen[0].body).toBeUndefined();
    expect(seen[1].method).toBe("POST");
    expect(seen[1].body).toEqual(request);
  });

  it("owns the 3D, music, sound-effect, and text-to-speech paths", async () => {
    const seen: Array<{ path: string; body: unknown }> = [];
    const client = new AgentTransport.Client({
      fetcher: async (path, init) => {
        seen.push({
          path,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        if (path === "/three-d/generate") {
          return Response.json({
            model_id: "fal-ai/trellis-2",
            provider_id: "fal",
            glb: {
              base64: "Z2xURg==",
              media_type: "model/gltf-binary",
              file_name: "model.glb",
            },
          });
        }
        if (path === "/audio/text-to-speech/voices") {
          return Response.json({
            provider_id: "elevenlabs",
            voices: [{ voice_id: "voice-a", name: "Alice" }],
          });
        }
        return Response.json({
          model_id:
            path === "/audio/music/generate"
              ? "google/lyria-3"
              : path === "/audio/sound-effects/generate"
                ? "eleven_text_to_sound_v2"
                : "eleven_v3",
          provider_id: path === "/audio/music/generate" ? "gg" : "elevenlabs",
          ...(path === "/audio/text-to-speech/generate"
            ? { voice_id: "voice-a" }
            : {}),
          audio: {
            base64: "SUQz",
            media_type: "audio/mpeg",
            file_name: "audio.mp3",
          },
        });
      },
    });

    await client.threeD.generate({
      model_id: "fal-ai/trellis-2",
      image: { base64: "AAAA", media_type: "image/png" },
    });
    await client.audio.music.generate({
      model_id: "google/lyria-3",
      prompt: "music",
    });
    await client.audio.soundEffects.generate({
      model_id: "eleven_text_to_sound_v2",
      prompt: "boom",
    });
    await client.audio.textToSpeech.listVoices();
    await client.audio.textToSpeech.generate({
      model_id: "eleven_v3",
      voice_id: "voice-a",
      text: "[happy] Hello!",
    });

    expect(seen.map(({ path }) => path)).toEqual([
      "/three-d/generate",
      "/audio/music/generate",
      "/audio/sound-effects/generate",
      "/audio/text-to-speech/voices",
      "/audio/text-to-speech/generate",
    ]);
    expect(seen[0]?.body).toMatchObject({ model_id: "fal-ai/trellis-2" });
    expect(seen[3]?.body).toBeUndefined();
    expect(seen[4]?.body).toEqual({
      model_id: "eleven_v3",
      voice_id: "voice-a",
      text: "[happy] Hello!",
    });
  });
});
