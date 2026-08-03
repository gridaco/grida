// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: gateway — see docs/wg/platform/hosted-ai.md
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/openai-compat/limits", () => ({
  allowAiRequest: async () => ({ success: true }),
}));

const generateMusic =
  vi.fn<
    (org: number, model: string, input: unknown) => Promise<{ url: string }>
  >();
vi.mock("@/lib/ai/server", () => ({
  methods: {
    generateMusic: (org: number, model: string, input: unknown) =>
      generateMusic(org, model, input),
  },
}));

import { POST } from "./route";
import { signGgToken } from "@/lib/auth/gg-token";

const SECRET = "music-secret-0123456789abcdef0123456789abcdef";

function request(body: unknown, token?: string): Request {
  return new Request("http://grida.test/api/v1/ai/music/generations", {
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
  generateMusic.mockReset();
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/v1/ai/music/generations", () => {
  it("returns bounded MP3 bytes and never the Replicate URL", async () => {
    const bytes = new Uint8Array([0x49, 0x44, 0x33, 0x03]);
    generateMusic.mockResolvedValue({
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
    expect(generateMusic).toHaveBeenCalledWith(7, "google/lyria-3", {
      prompt: "Clockwork forest percussion",
      seed: 42,
    });
  });

  it("rejects non-MP3 bytes from the trusted delivery host", async () => {
    generateMusic.mockResolvedValue({
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
    expect(generateMusic).not.toHaveBeenCalled();
  });

  it("does not follow an untrusted provider output URL", async () => {
    generateMusic.mockResolvedValue({
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
    generateMusic.mockResolvedValue({
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

  it("uses one bounded deadline across trusted redirects and the response body", async () => {
    const bytes = new Uint8Array([0x49, 0x44, 0x33, 0x03]);
    const signal = new AbortController().signal;
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(signal);
    generateMusic.mockResolvedValue({
      url: "https://replicate.delivery/pbxt/test/redirect.mp3",
    });
    const fetchMock = vi.fn<typeof globalThis.fetch>();
    fetchMock
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: {
            location: "https://replicate.delivery/pbxt/test/music.mp3",
          },
        })
      )
      .mockResolvedValueOnce(new Response(bytes, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { token } = await signGgToken("user-1", 7);

    const response = await POST(
      request({ model_id: "google/lyria-3", prompt: "Ambient strings" }, token)
    );

    expect(response.status).toBe(200);
    expect(timeout).toHaveBeenCalledOnce();
    expect(timeout).toHaveBeenCalledWith(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.signal).toBe(signal);
    }
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
    expect(generateMusic).not.toHaveBeenCalled();
  });
});
