// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: gateway — see docs/wg/platform/hosted-ai.md
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/openai-compat/limits", () => ({
  allowAiRequest: async () => ({ success: true }),
}));

const generateAudio =
  vi.fn<
    (org: number, model: string, input: unknown) => Promise<{ url: string }>
  >();
vi.mock("@/lib/ai/server", () => ({
  methods: {
    generateAudio: (org: number, model: string, input: unknown) =>
      generateAudio(org, model, input),
  },
}));

import { POST } from "./route";
import { signGgToken } from "@/lib/auth/gg-token";

const SECRET = "audio-secret-0123456789abcdef0123456789abcdef";

function request(body: unknown, token?: string): Request {
  return new Request("http://grida.test/api/v1/ai/audio/generations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
  process.env.GG_TOKEN_SECRET = SECRET;
  generateAudio.mockReset();
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/v1/ai/audio/generations", () => {
  it("returns bounded MP3 bytes and never the Replicate URL", async () => {
    const bytes = new Uint8Array([0x49, 0x44, 0x33, 0x03]);
    generateAudio.mockResolvedValue({
      url: "https://replicate.delivery/pbxt/test/music.mp3",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(bytes, {
            status: 200,
            headers: {
              "content-type": "audio/mpeg",
              "content-length": String(bytes.byteLength),
            },
          })
      )
    );

    const { token } = await signGgToken("user-1", 7);
    const response = await POST(
      request(
        {
          model_id: "google/lyria-3",
          prompt: "Clockwork forest percussion",
          seed: 42,
        },
        token
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const result = await response.json();
    expect(result).toEqual({
      model_id: "google/lyria-3",
      provider_id: "gg",
      audio: {
        base64: Buffer.from(bytes).toString("base64"),
        media_type: "audio/mpeg",
        file_name: "lyria-3.mp3",
      },
    });
    expect(JSON.stringify(result)).not.toContain("replicate.delivery");
    expect(generateAudio).toHaveBeenCalledWith(7, "google/lyria-3", {
      prompt: "Clockwork forest percussion",
      seed: 42,
    });
  });

  it("rejects non-MP3 bytes from the trusted delivery host", async () => {
    generateAudio.mockResolvedValue({
      url: "https://replicate.delivery/pbxt/test/music.mp3",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<html>provider error</html>", {
            status: 200,
            headers: { "content-type": "audio/mpeg" },
          })
      )
    );
    const { token } = await signGgToken("user-1", 7);

    const response = await POST(
      request({ model_id: "google/lyria-3", prompt: "Ambient strings" }, token)
    );

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain(
      "provider error"
    );
  });

  it("rejects non-music model ids before billing", async () => {
    const { token } = await signGgToken("user-1", 7);
    const response = await POST(
      request(
        {
          model_id: "eleven_text_to_sound_v2",
          prompt: "Thunder",
        },
        token
      )
    );
    expect(response.status).toBe(404);
    expect(generateAudio).not.toHaveBeenCalled();
  });

  it("does not follow an untrusted provider output URL", async () => {
    generateAudio.mockResolvedValue({
      url: "https://example.test/private.mp3",
    });
    const fetchMock = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const { token } = await signGgToken("user-1", 7);

    const response = await POST(
      request(
        { model_id: "google/lyria-3-pro", prompt: "Ambient strings" },
        token
      )
    );

    expect(response.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).not.toContain("example.test");
  });

  it("does not follow a trusted output URL that redirects off-domain", async () => {
    generateAudio.mockResolvedValue({
      url: "https://replicate.delivery/pbxt/test/music.mp3",
    });
    const fetchMock = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://example.test/private.mp3" },
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    const { token } = await signGgToken("user-1", 7);

    const response = await POST(
      request({ model_id: "google/lyria-3", prompt: "Ambient strings" }, token)
    );

    expect(response.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(await response.json())).not.toContain("example.test");
  });

  it("requires a scoped token and a non-empty prompt", async () => {
    expect(
      (await POST(request({ model_id: "google/lyria-3", prompt: "no token" })))
        .status
    ).toBe(401);
    const { token } = await signGgToken("user-1", 7);
    expect(
      (await POST(request({ model_id: "google/lyria-3", prompt: "" }, token)))
        .status
    ).toBe(400);
    expect(generateAudio).not.toHaveBeenCalled();
  });
});
