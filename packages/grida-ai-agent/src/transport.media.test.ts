import { describe, expect, it } from "vitest";
import { AgentTransport } from "./transport";

describe("AgentTransport media generation routes", () => {
  it("owns the 3D, music, and sound-effect POST paths", async () => {
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
        return Response.json({
          model_id:
            path === "/audio/music/generate"
              ? "google/lyria-3"
              : "eleven_text_to_sound_v2",
          provider_id: path === "/audio/music/generate" ? "gg" : "elevenlabs",
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

    expect(seen.map(({ path }) => path)).toEqual([
      "/three-d/generate",
      "/audio/music/generate",
      "/audio/sound-effects/generate",
    ]);
    expect(seen[0]?.body).toMatchObject({ model_id: "fal-ai/trellis-2" });
  });
});
