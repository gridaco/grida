// GRIDA-SEC-004 / GRIDA-SEC-006 — full-agent and media routes share one authority owner.
// GRIDA-GG: provider — mutation and runtime execution use the same scoped custody.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelCatalogStore } from "@grida/ai";
import { AgentRuntime, type AgentRuntimeDeps } from "./runtime";
import {
  AuthStore,
  FileRegistry,
  MediaStore,
  RecentStore,
  SecretsStore,
  WorkspaceRegistry,
  type DaemonServices,
} from "@grida/daemon/server";
import type { ImagesRoutesDeps } from "./http/routes/images";
import type { MusicRoutesDeps } from "./http/routes/music";
import type { SoundEffectsRoutesDeps } from "./http/routes/sound-effects";
import type { TextToSpeechRoutesDeps } from "./http/routes/text-to-speech";
import type { ThreeDRoutesDeps } from "./http/routes/three-d";
import type { RiggingRoutesDeps } from "./http/routes/rigging";
import type { VideoRoutesDeps } from "./http/routes/video";

const registrations = vi.hoisted(() => ({
  images: vi.fn<(app: Hono, deps: ImagesRoutesDeps) => void>(),
  video: vi.fn<(app: Hono, deps: VideoRoutesDeps) => void>(),
  threeD: vi.fn<(app: Hono, deps: ThreeDRoutesDeps) => void>(),
  rigging: vi.fn<(app: Hono, deps: RiggingRoutesDeps) => void>(),
  music: vi.fn<(app: Hono, deps: MusicRoutesDeps) => void>(),
  soundEffects: vi.fn<(app: Hono, deps: SoundEffectsRoutesDeps) => void>(),
  textToSpeech: vi.fn<(app: Hono, deps: TextToSpeechRoutesDeps) => void>(),
  runtime: vi.fn<(deps: AgentRuntimeDeps) => void>(),
}));

vi.mock("./http/routes/images", () => ({
  registerImagesRoutes: registrations.images,
}));
vi.mock("./http/routes/video", () => ({
  registerVideoRoutes: registrations.video,
}));
vi.mock("./http/routes/three-d", () => ({
  registerThreeDRoutes: registrations.threeD,
}));
vi.mock("./http/routes/rigging", () => ({
  registerRiggingRoutes: registrations.rigging,
}));
vi.mock("./http/routes/music", () => ({
  registerMusicRoutes: registrations.music,
}));
vi.mock("./http/routes/sound-effects", () => ({
  registerSoundEffectsRoutes: registrations.soundEffects,
}));
vi.mock("./http/routes/text-to-speech", () => ({
  registerTextToSpeechRoutes: registrations.textToSpeech,
}));
vi.mock("./runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./runtime")>();
  return {
    ...actual,
    AgentRuntime: class extends actual.AgentRuntime {
      constructor(deps: AgentRuntimeDeps) {
        super(deps);
        registrations.runtime(deps);
      }
    },
  };
});

import { createAgentTenant } from "./server";

const cleanup: Array<() => void | Promise<void>> = [];

type MediaRouteCapabilities = {
  images: boolean;
  video: boolean;
  three_d: boolean;
  music: boolean;
  sound_effects: boolean;
  text_to_speech: boolean;
};

async function registerMediaTenant(
  capabilities: MediaRouteCapabilities,
  agent = false
) {
  const base = await fs.mkdtemp(
    path.join(os.tmpdir(), "grida-agent-media-wiring-")
  );
  const userData = path.join(base, "agent");
  const scratchBase = path.join(base, "scratch");
  cleanup.push(() => fs.rm(base, { recursive: true, force: true }));

  const auth = new AuthStore(userData);
  const media = new MediaStore(path.join(base, "media"));
  const services: DaemonServices = {
    user_data_path: userData,
    files: new FileRegistry(),
    recent: new RecentStore(userData),
    workspaces: new WorkspaceRegistry(userData),
    media,
    auth,
    secrets: new SecretsStore(auth),
  };
  const app = new Hono();
  const handle = createAgentTenant({
    capabilities: {
      secrets: agent,
      agent,
      sessions: false,
      providers: false,
      ...capabilities,
    },
    scratch_base: scratchBase,
    gg_base_url: agent ? "https://synthetic-grida.invalid" : undefined,
    provider_http: {
      request: async () => new Response(null, { status: 404 }),
      download: async () => {
        throw new Error("unexpected asset download");
      },
    },
  }).register(app, services);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    handle.drain?.();
    handle.cleanup?.();
  };
  cleanup.push(close);

  return { media, app, services, close };
}

afterEach(async () => {
  vi.clearAllMocks();
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

describe("agent tenant generated-media wiring", () => {
  it("shares GG, catalogue, transport and credentials with the full runtime and disposes once", async () => {
    vi.stubEnv("GRIDA_AGENT_DISABLE_MODELS_FETCH", "1");
    const started = vi.spyOn(ModelCatalogStore.prototype, "start");
    const disposed = vi.spyOn(ModelCatalogStore.prototype, "dispose");
    const retried = vi.spyOn(AgentRuntime.prototype, "retryQueuedSessions");
    try {
      const { app, services, close } = await registerMediaTenant(
        {
          images: true,
          video: true,
          three_d: true,
          music: true,
          sound_effects: true,
          text_to_speech: true,
        },
        true
      );
      expect(registrations.runtime).toHaveBeenCalledOnce();
      const runtime = registrations.runtime.mock.calls[0][0];
      const image = registrations.images.mock.calls[0][1];
      const video = registrations.video.mock.calls[0][1];
      const music = registrations.music.mock.calls[0][1];
      expect(runtime.secrets).toBe(services.secrets);
      expect(image.secrets).toBe(services.secrets);
      expect(runtime.gg).toBe(image.gg);
      expect(video.gg).toBe(runtime.gg);
      expect(music.gg).toBe(runtime.gg);
      expect(runtime.catalog).toBe(image.catalog);
      expect(video.catalog).toBe(runtime.catalog);
      expect(runtime.catalog?.view().image.default_id).toBe(
        "openai/gpt-image-2.5-flare"
      );
      expect(runtime.provider_http).toBe(image.provider_http);
      expect(video.provider_http).toBe(runtime.provider_http);
      expect(registrations.rigging).toHaveBeenCalledOnce();
      expect(registrations.rigging.mock.calls[0][1].secrets).toBe(
        services.secrets
      );
      expect(registrations.rigging.mock.calls[0][1].media).toBe(services.media);
      expect(registrations.rigging.mock.calls[0][1].provider_http).toBe(
        runtime.provider_http
      );
      expect(music.provider_http).toBe(runtime.provider_http);
      expect(started).toHaveBeenCalledOnce();
      const set = await app.request("/auth/gg/set", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          access_token: "synthetic-shared-token",
          expires_at: Date.now() + 60_000,
        }),
      });
      expect(set.status).toBe(200);
      expect(runtime.gg?.status()).toMatchObject({ active: true });
      expect(image.gg?.status()).toMatchObject({ active: true });
      // Startup recovery performs the first retry; the GG mutation schedules
      // the second behind it. Join both before closing the real database.
      await vi.waitFor(() => expect(retried).toHaveBeenCalledTimes(2));
      await Promise.all(retried.mock.results.map((result) => result.value));
      close();
      expect(disposed).toHaveBeenCalledOnce();
      expect(runtime.gg?.status()).toEqual({ active: false });
    } finally {
      started.mockRestore();
      disposed.mockRestore();
      retried.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it("forwards the same host media service to every generation route group", async () => {
    const { media } = await registerMediaTenant({
      images: true,
      video: true,
      three_d: true,
      music: true,
      sound_effects: true,
      text_to_speech: true,
    });

    for (const register of [
      registrations.images,
      registrations.video,
      registrations.threeD,
      registrations.music,
      registrations.soundEffects,
      registrations.textToSpeech,
    ]) {
      expect(register).toHaveBeenCalledOnce();
      expect(register.mock.calls[0]?.[1]).toEqual(
        expect.objectContaining({ media })
      );
    }

    expect(registrations.music.mock.calls[0]?.[1]).not.toHaveProperty(
      "secrets"
    );
    expect(registrations.soundEffects.mock.calls[0]?.[1]).not.toHaveProperty(
      "gg"
    );
    expect(registrations.soundEffects.mock.calls[0]?.[1]).not.toHaveProperty(
      "gg_base_url"
    );
    expect(registrations.textToSpeech.mock.calls[0]?.[1]).not.toHaveProperty(
      "gg"
    );
    expect(registrations.textToSpeech.mock.calls[0]?.[1]).not.toHaveProperty(
      "gg_base_url"
    );
  });

  it("mounts music, Sound Effects, and Text to Speech independently", async () => {
    await registerMediaTenant({
      images: false,
      video: false,
      three_d: false,
      music: true,
      sound_effects: false,
      text_to_speech: false,
    });
    expect(registrations.music).toHaveBeenCalledOnce();
    expect(registrations.rigging).not.toHaveBeenCalled();
    expect(registrations.soundEffects).not.toHaveBeenCalled();

    vi.clearAllMocks();
    await registerMediaTenant({
      images: false,
      video: false,
      three_d: false,
      music: false,
      sound_effects: true,
      text_to_speech: false,
    });
    expect(registrations.music).not.toHaveBeenCalled();
    expect(registrations.soundEffects).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    await registerMediaTenant({
      images: false,
      video: false,
      three_d: false,
      music: false,
      sound_effects: false,
      text_to_speech: true,
    });
    expect(registrations.music).not.toHaveBeenCalled();
    expect(registrations.soundEffects).not.toHaveBeenCalled();
    expect(registrations.textToSpeech).toHaveBeenCalledOnce();
  });
});
