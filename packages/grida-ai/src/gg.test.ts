// GRIDA-SEC-004 / GRIDA-SEC-006 — GG URL admission before scoped credential access.
// GRIDA-GG: token — synthetic transport only; no live credentials or services.
import { describe, expect, it, vi } from "vitest";
import {
  ImageClient,
  MediaOperations,
  MusicClient,
  ProviderHttp,
  VideoClient,
} from "./index";
import { gridaGatewayApiBase, joinApi, postHosted } from "./gg";
import { liveGgMediaDeps } from "./gg-session";

const refused = [
  "http://gg.example",
  "http://10.0.0.1",
  "http://192.168.0.1",
  "http://localhost.example",
  "http://localhost.",
  "http://127.0.0.1.example",
  "http://127.0.0.2",
  "http://[::ffff:127.0.0.1]",
  "ftp://gg.example",
  "https://user:private-value@gg.example",
  "https://gg.example?private-value",
  "https://gg.example#private-value",
  "invalid-url-private-value",
];
const admitted = [
  ["https://gg.example/ignored/path", "https://gg.example"],
  ["http://localhost:3000/path", "http://localhost:3000"],
  ["http://127.0.0.1:3041", "http://127.0.0.1:3041"],
  ["http://[::1]:3041", "http://[::1]:3041"],
] as const;

function authority() {
  const request = vi.fn<typeof fetch>(async () => Response.json({ ok: true }));
  const download = vi.fn<typeof fetch>();
  const read = vi.fn<() => string | null>(() => "synthetic-scoped-token");
  const get = vi.fn<ImageClient.Keys["get"]>(() => null);
  return {
    request,
    download,
    read,
    get,
    options: {
      http: new ProviderHttp({ request, download }),
      gg: { getAccessToken: read },
      keys: { get },
    },
  };
}

const clients = [
  [
    "image",
    (options: ImageClient.Options) => new ImageClient(options),
    new MediaOperations().list({ kind: "image", provider: "gg" })[0].model_id,
    { images: [{ base64: "iVBORw0KGgo=" }] },
    "images",
  ],
  [
    "video",
    (options: VideoClient.Options) => new VideoClient(options),
    "google/veo-3.1",
    { videos: [{ base64: "AQID", media_type: "video/mp4" }] },
    "videos",
  ],
  [
    "music",
    (options: ImageClient.Options & { gg_base_url: string }) =>
      new MusicClient({
        http: options.http,
        gg: options.gg!,
        gg_base_url: options.gg_base_url,
      }),
    "google/lyria-3",
    {
      model_id: "google/lyria-3",
      provider_id: "gg",
      audio: {
        base64: "SUQz",
        media_type: "audio/mpeg",
        file_name: "lyria-3.mp3",
      },
    },
    "music",
  ],
] as const;

describe("GG destination admission", () => {
  describe.each(clients)(
    "%s client",
    (_name, create, model_id, response, route) => {
      it.each(refused)(
        "rejects %s before credential access or transport",
        (gg_base_url) => {
          const { options, read, get, request, download } = authority();
          expect(() => create({ ...options, gg_base_url })).toThrow(
            "invalid_input"
          );
          expect(read).not.toHaveBeenCalled();
          expect(get).not.toHaveBeenCalled();
          expect(request).not.toHaveBeenCalled();
          expect(download).not.toHaveBeenCalled();
        }
      );

      it.each(admitted)(
        "generates through admitted origin %s",
        async (gg_base_url, origin) => {
          const { options, read, get, request, download } = authority();
          const client = create({ ...options, gg_base_url });
          expect(read).not.toHaveBeenCalled();
          expect(request).not.toHaveBeenCalled();
          request.mockResolvedValue(Response.json(response));
          const operation = await client.resolve({ model_id, provider: "gg" });
          await operation.generate({ prompt: "Synthetic GG URL test" });
          expect(request).toHaveBeenCalledOnce();
          expect(request.mock.calls[0][0]).toBe(
            `${origin}/api/v1/ai/${route}/generations`
          );
          expect(
            new Headers(request.mock.calls[0][1]?.headers).get("authorization")
          ).toBe("Bearer synthetic-scoped-token");
          expect(get).not.toHaveBeenCalled();
          expect(download).not.toHaveBeenCalled();
        }
      );
    }
  );

  it.each(refused)(
    "refuses %s through every shared provider helper",
    async (url) => {
      const { options, read, request } = authority();
      expect(() => gridaGatewayApiBase(url)).toThrow("gg_invalid_url");
      expect(() => joinApi(url, "/api/v1/ai/images/generations")).toThrow(
        "gg_invalid_url"
      );
      expect(() =>
        liveGgMediaDeps({ gg: options.gg, gg_base_url: url })
      ).toThrow("gg_invalid_url");
      await expect(
        postHosted({
          session: options.gg,
          url,
          body: {},
          scope: "test",
          provider_http: options.http,
        })
      ).rejects.toThrow("gg_invalid_url");
      expect(read).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    }
  );

  it.each(admitted)(
    "keeps the scoped request on admitted origin %s",
    async (base, origin) => {
      const { options, read, request, download } = authority();
      expect(gridaGatewayApiBase(base)).toBe(`${origin}/api/v1/ai`);
      expect(
        liveGgMediaDeps({ gg: options.gg, gg_base_url: base })?.base_url
      ).toBe(origin);
      const url = joinApi(base, "/api/v1/ai/images/generations");
      expect(url).toBe(`${origin}/api/v1/ai/images/generations`);
      await expect(
        postHosted({
          session: options.gg,
          url,
          body: { model_id: "synthetic-model" },
          scope: "test",
          provider_http: options.http,
        })
      ).resolves.toEqual({ ok: true });
      expect(request).toHaveBeenCalledOnce();
      expect(request.mock.calls[0][0]).toBe(url);
      expect(
        new Headers(request.mock.calls[0][1]?.headers).get("authorization")
      ).toBe("Bearer synthetic-scoped-token");
      expect(read).toHaveBeenCalledTimes(2);
      expect(download).not.toHaveBeenCalled();
    }
  );

  it.each([
    "https://other.example/ai",
    "//other.example/ai",
    "/ai?private-value",
    "/ai#private-value",
    "http://[invalid-private-value",
  ])(
    "does not let a relative API path grant another destination: %s",
    (path) => {
      expect(() => joinApi("https://gg.example", path)).toThrow(
        "gg_invalid_url"
      );
    }
  );
});
