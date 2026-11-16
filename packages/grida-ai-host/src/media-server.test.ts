// GRIDA-SEC-004 / GRIDA-SEC-006 — media-only daemon perimeter, shared custody and cleanup.
// GRIDA-GG: provider — per-launch GG mutation routes feed the actual media operation.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ggContractFixture } from "../../grida-ai/src/testing/gg-contract";
import { MediaStore } from "@grida/daemon/server";
import { DaemonTransport } from "@grida/daemon/transport";
import { createMediaDaemon, type MediaDaemonOptions } from "./media-server";

const PASSWORD = "synthetic-media-daemon-password";
const ORIGIN = "https://desktop.invalid";
const GG = "https://grida.invalid";
const TOKEN = "synthetic-scoped-media-token";
const KEY = "synthetic-elevenlabs-media-key";
const cleanups: Array<() => Promise<unknown>> = [];

async function start(options: Partial<MediaDaemonOptions> = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "grida-media-server-"));
  cleanups.push(() => fs.rm(base, { recursive: true, force: true }));
  const user_data_path = path.join(base, "state");
  const media_root = path.join(base, "media");
  const metadata = ggContractFixture([{ id: "google/lyria-3", kind: "music" }]);
  const request = vi.fn<typeof fetch>(async (input, init) => {
    const discovery = metadata.response(input);
    if (discovery) return discovery;
    const url = String(input);
    if (url === `${GG}/api/v1/models/catalog`)
      return new Response(null, { status: 404 });
    if (
      url === `${GG}/api/v1/ai/operations` ||
      url === `${GG}/api/v1/ai/jobs?request_id=req_music`
    ) {
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        `Bearer ${TOKEN}`
      );
      return Response.json({
        id: "req_music",
        request_id: "req_music",
        model: "google/lyria-3",
        status: "succeeded",
        result_status: "available",
        result: {
          audio: {
            url: "https://assets.example/music.mp3",
            media_type: "audio/mpeg",
          },
        },
      });
    }
    expect(url).toBe(
      "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128"
    );
    expect(new Headers(init?.headers).get("xi-api-key")).toBe(KEY);
    return new Response(new Uint8Array([73, 68, 51]), {
      headers: { "content-type": "audio/mpeg" },
    });
  });
  const download = vi.fn<typeof fetch>(async (url, init) => {
    expect(String(url)).toBe("https://assets.example/music.mp3");
    expect(new Headers(init?.headers).has("authorization")).toBe(false);
    return new Response(Buffer.from("ID3"), {
      headers: { "content-type": "audio/mpeg" },
    });
  });
  const configuration: MediaDaemonOptions = {
    password: PASSWORD,
    user_data_path,
    media_root,
    http_access: {
      allowed_origins: [ORIGIN],
      allowed_referer_paths: ["/desktop"],
    },
    provider_http: { request, download },
    ...options,
  };
  const daemon = createMediaDaemon(configuration);
  cleanups.push(() => daemon.stop());
  await daemon.start({ listen: false });
  return {
    base,
    daemon,
    request,
    download,
    configuration,
    user_data_path,
    media_root,
  };
}

function call(
  daemon: ReturnType<typeof createMediaDaemon>,
  route: string,
  input?: unknown,
  headers: Record<string, string> = {},
  method: "POST" | "GET" = "POST"
) {
  const requestHeaders = new Headers({
    authorization: DaemonTransport.buildBasicAuthHeader(PASSWORD),
    origin: ORIGIN,
    referer: `${ORIGIN}/desktop/media`,
    "content-type": "application/json",
    ...headers,
  });
  if (headers.authorization === "") requestHeaders.delete("authorization");
  return daemon.fetch(
    new Request(`http://127.0.0.1${route}`, {
      method,
      headers: requestHeaders,
      ...(method === "POST" ? { body: JSON.stringify(input ?? {}) } : {}),
    })
  );
}
async function entries(directory: string): Promise<string[]> {
  try {
    return await fs.readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
async function setGg(daemon: ReturnType<typeof createMediaDaemon>) {
  expect(
    (
      await call(daemon, "/auth/gg/set", {
        access_token: TOKEN,
        expires_at: Date.now() + 900_000,
        organization: { id: 1, name: "synthetic-org" },
      })
    ).status
  ).toBe(200);
}
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.restoreAllMocks();
});

describe("media-only public composition", () => {
  it("advertises only mounted media and daemon capabilities without chat or scratch state", async () => {
    const { daemon, base, user_data_path, request } = await start();
    const response = await call(daemon, "/handshake");
    const handshake = await response.json();
    expect(response.status).toBe(200);
    expect(handshake.capabilities).toMatchObject({
      files: true,
      recent: true,
      workspaces: true,
      secrets: true,
      images: true,
      video: true,
      three_d: true,
      music: true,
      sound_effects: true,
      text_to_speech: true,
      providers: false,
    });
    for (const retired of ["agent", "sessions", "shell"])
      expect(handshake.capabilities).not.toHaveProperty(retired);
    for (const route of [
      "/agent/run",
      "/providers/endpoints/list",
      "/auth/chatgpt/status",
      "/auth/gg/status",
    ])
      expect((await call(daemon, route)).status).toBe(404);
    for (const route of ["/sessions", "/events"])
      expect((await call(daemon, route, undefined, {}, "GET")).status).toBe(
        404
      );
    expect(await entries(user_data_path)).not.toContain("sessions.db");
    expect(
      (await entries(base)).some((entry) => /scratch|skills/.test(entry))
    ).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it("retains custom endpoint settings and keys without starting chat", async () => {
    const { daemon, configuration, user_data_path, request } = await start({
      endpoint_settings: true,
    });
    const config = {
      id: "local-models",
      label: "Local models",
      base_url: "http://127.0.0.1:11434/v1",
      models: [{ id: "fixture-model", label: "Fixture Model" }],
    };
    expect(
      (await call(daemon, "/providers/endpoints/set", { config })).status
    ).toBe(200);
    expect(
      (await call(daemon, "/secrets/set", { provider_id: config.id, key: KEY }))
        .status
    ).toBe(200);
    expect(
      (
        await call(
          daemon,
          "/providers/endpoints/list",
          {},
          { authorization: "" }
        )
      ).status
    ).toBe(401);
    await daemon.stop();

    const restarted = createMediaDaemon(configuration);
    cleanups.push(() => restarted.stop());
    await restarted.start({ listen: false });
    const handshake = await (await call(restarted, "/handshake")).json();
    expect(handshake.capabilities).toMatchObject({ providers: true });
    expect(handshake.capabilities).not.toHaveProperty("agent");
    const response = await call(restarted, "/providers/endpoints/list");
    const text = await response.text();
    expect(JSON.parse(text)).toEqual([expect.objectContaining(config)]);
    expect(text).not.toContain(KEY);
    expect(
      await (
        await call(restarted, "/secrets/has", { provider_id: config.id })
      ).json()
    ).toEqual({ has: true });
    for (const route of [
      "/agent/run",
      "/providers/claude/detect",
      "/auth/chatgpt/status",
    ]) {
      expect((await call(restarted, route)).status).toBe(404);
    }
    expect(await entries(user_data_path)).not.toContain("sessions.db");
    expect(request).not.toHaveBeenCalled();
  });

  it("uses the shared secret store for real BYOK generation and path-free persistence", async () => {
    const { daemon, request, download, media_root, user_data_path } =
      await start();
    expect(
      (
        await call(daemon, "/secrets/set", {
          provider_id: "elevenlabs",
          key: KEY,
        })
      ).status
    ).toBe(200);
    expect(
      await (
        await call(daemon, "/secrets/has", { provider_id: "elevenlabs" })
      ).json()
    ).toEqual({ has: true });
    const response = await call(daemon, "/audio/sound-effects/generate", {
      model_id: "eleven_text_to_sound_v2",
      prompt: "clock ticking",
      loop: false,
      prompt_influence: 0,
    });
    expect(response.status).toBe(200);
    const generated = await response.json();
    expect(generated.audio).toEqual({
      base64: "SUQz",
      media_type: "audio/mpeg",
      file_name: "sound-effect.mp3",
    });
    expect(generated.stored_media).toMatchObject({
      media_type: "audio/mpeg",
      byte_size: 3,
      file_name: "sound-effect.mp3",
    });
    expect(JSON.stringify(generated)).not.toContain(KEY);
    expect(request).toHaveBeenCalledOnce();
    expect(download).not.toHaveBeenCalled();
    expect(await new MediaStore(media_root).list()).toEqual([
      generated.stored_media,
    ]);
    expect(
      (await entries(user_data_path)).every(
        (entry) => !/sessions\.db|scratch|skills/.test(entry)
      )
    ).toBe(true);
    expect(
      (await call(daemon, "/secrets/get", { provider_id: "elevenlabs" })).status
    ).toBe(404);
  });

  it("applies Basic Auth, Referer and no-query-credential rules before media authority", async () => {
    const { daemon, request } = await start();
    const payload = { provider_id: "elevenlabs", key: KEY };
    expect(
      (await call(daemon, "/secrets/set", payload, { authorization: "" }))
        .status
    ).toBe(401);
    expect(
      (
        await call(daemon, "/secrets/set", payload, {
          referer: `${ORIGIN}/untrusted`,
        })
      ).status
    ).toBe(403);
    const token = DaemonTransport.buildBasicAuthHeader(PASSWORD).slice(6);
    expect(
      (
        await call(
          daemon,
          `/secrets/set?auth_token=${encodeURIComponent(token)}`,
          payload,
          { authorization: "" }
        )
      ).status
    ).toBe(401);
    expect(
      await (
        await call(daemon, "/secrets/has", { provider_id: "elevenlabs" })
      ).json()
    ).toEqual({ has: false });
    expect(request).not.toHaveBeenCalled();
  });

  it("honors disabled route capabilities without accidentally enabling agent routes", async () => {
    const { daemon } = await start({
      capabilities: {
        images: false,
        music: false,
        text_to_speech: false,
        files: false,
      },
    });
    const handshake = await (await call(daemon, "/handshake")).json();
    expect(handshake.capabilities).toMatchObject({
      images: false,
      music: false,
      text_to_speech: false,
      files: false,
      video: true,
      three_d: true,
    });
    for (const route of [
      "/images/generate",
      "/audio/music/generate",
      "/audio/text-to-speech/generate",
      "/files/read",
      "/agent/run",
    ])
      expect((await call(daemon, route)).status).toBe(404);
  });

  it("keeps GG scoped custody per launch and clear blocks the next actual media submission", async () => {
    const first = await start({ gg_base_url: GG });
    const second = await start({ gg_base_url: GG });
    await setGg(first.daemon);
    expect(
      await (await call(first.daemon, "/auth/gg/status")).json()
    ).toMatchObject({
      active: true,
      organization: { id: 1, name: "synthetic-org" },
    });
    expect(await (await call(second.daemon, "/auth/gg/status")).json()).toEqual(
      { active: false }
    );
    const generated = await call(first.daemon, "/audio/music/generate", {
      model_id: "google/lyria-3",
      prompt: "gentle drums",
    });
    expect(generated.status).toBe(200);
    expect((await generated.json()).audio.file_name).toBe("lyria-3.mp3");
    const discovery = first.request.mock.calls.filter(([url]) =>
      String(url).startsWith("https://gateway.grida.ai/")
    );
    expect(discovery).toHaveLength(3);
    expect(
      discovery.map(([, init]) =>
        new Headers(init?.headers).has("authorization")
      )
    ).toEqual([false, false, false]);
    const submissions = first.request.mock.calls.filter(
      ([, init]) => init?.method === "POST"
    );
    expect(submissions).toHaveLength(1);
    expect(JSON.parse(String(submissions[0][1]?.body))).toEqual({
      operation_id: "music.google.lyria-3.generate",
      input: { prompt: "gentle drums" },
    });

    const beforeClear = first.request.mock.calls.length;
    expect((await call(first.daemon, "/auth/gg/clear")).status).toBe(200);
    expect(
      (
        await call(first.daemon, "/audio/music/generate", {
          model_id: "google/lyria-3",
          prompt: "gentle drums",
        })
      ).status
    ).toBe(401);
    expect(first.request).toHaveBeenCalledTimes(beforeClear);
    expect(
      JSON.stringify(await new MediaStore(first.media_root).list())
    ).not.toContain(TOKEN);
    await setGg(first.daemon);
    await first.daemon.stop();
    const restart = createMediaDaemon(first.configuration);
    cleanups.push(() => restart.stop());
    await restart.start({ listen: false });
    expect(await (await call(restart, "/auth/gg/status")).json()).toEqual({
      active: false,
    });
    await restart.stop();
    await restart.stop();
  });

  it("aborts in-flight media on daemon stop and never publishes a late provider result", async () => {
    let finish!: (response: Response) => void;
    let begin!: () => void;
    const started = new Promise<void>((resolve) => {
      begin = resolve;
    });
    const { daemon, media_root } = await start({
      provider_http: {
        request: async () => {
          begin();
          return new Promise<Response>((resolve) => {
            finish = resolve;
          });
        },
        download: async () => {
          throw new Error("Unexpected download");
        },
      },
    });
    await call(daemon, "/secrets/set", { provider_id: "elevenlabs", key: KEY });
    const pending = call(daemon, "/audio/sound-effects/generate", {
      model_id: "eleven_text_to_sound_v2",
      prompt: "clock ticking",
    }).catch(() => null);
    await started;
    await daemon.stop();
    const cancel = vi.fn<() => void>();
    finish(
      new Response(new ReadableStream<Uint8Array>({ cancel }), {
        headers: { "content-type": "audio/mpeg" },
      })
    );
    await pending;
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
    expect(await new MediaStore(media_root).list()).toEqual([]);
  });
});

it("projects native prompt-video eligibility separately from the broad video interface", async () => {
  const metadata = ggContractFixture([
    { id: "fixture/text-video", kind: "video", variants: ["text"] },
    { id: "fixture/image-video", kind: "video", variants: ["image"] },
  ]);
  const request = vi.fn<typeof fetch>(async (input) => {
    const response = metadata.response(input);
    if (!response) throw new Error("unexpected non-metadata request");
    return response;
  });
  const { daemon } = await start({
    gg_base_url: GG,
    provider_http: { request, download: vi.fn<typeof fetch>() },
  });
  const response = await call(
    daemon,
    "/providers/gg/models",
    undefined,
    {},
    "GET"
  );
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.models).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "fixture/text-video",
        interfaces: ["videos"],
        client_supported_options: { video_text: true },
      }),
      expect.objectContaining({
        id: "fixture/image-video",
        interfaces: ["videos"],
        client_supported_options: { video_text: false },
      }),
    ])
  );
  expect(
    data.models.every(
      (model: Record<string, unknown>) =>
        !Object.hasOwn(model, "request_schemas")
    )
  ).toBe(true);
  expect(JSON.stringify(data)).not.toContain(TOKEN);
  expect(
    request.mock.calls.every(
      ([, init]) =>
        init?.method === "GET" &&
        !new Headers(init?.headers).has("authorization")
    )
  ).toBe(true);
});
