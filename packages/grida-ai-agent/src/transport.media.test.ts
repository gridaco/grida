import { describe, expect, it } from "vitest";
import { AgentTransport } from "./transport";
import type {
  VideoGenerateRequest,
  VideoGenerateResult,
} from "./protocol/video";

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
