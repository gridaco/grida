import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
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
import type { ThreeDRoutesDeps } from "./http/routes/three-d";
import type { VideoRoutesDeps } from "./http/routes/video";

const registrations = vi.hoisted(() => ({
  images: vi.fn<(app: Hono, deps: ImagesRoutesDeps) => void>(),
  video: vi.fn<(app: Hono, deps: VideoRoutesDeps) => void>(),
  threeD: vi.fn<(app: Hono, deps: ThreeDRoutesDeps) => void>(),
  music: vi.fn<(app: Hono, deps: MusicRoutesDeps) => void>(),
  soundEffects: vi.fn<(app: Hono, deps: SoundEffectsRoutesDeps) => void>(),
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
vi.mock("./http/routes/music", () => ({
  registerMusicRoutes: registrations.music,
}));
vi.mock("./http/routes/sound-effects", () => ({
  registerSoundEffectsRoutes: registrations.soundEffects,
}));

import { createAgentTenant } from "./server";

const cleanup: Array<() => void | Promise<void>> = [];

type MediaRouteCapabilities = {
  images: boolean;
  video: boolean;
  three_d: boolean;
  music: boolean;
  sound_effects: boolean;
};

async function registerMediaTenant(capabilities: MediaRouteCapabilities) {
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
  const handle = createAgentTenant({
    capabilities: {
      secrets: false,
      agent: false,
      sessions: false,
      providers: false,
      ...capabilities,
    },
    scratch_base: scratchBase,
  }).register(new Hono(), services);
  cleanup.push(() => {
    handle.drain?.();
    handle.cleanup?.();
  });

  return { media };
}

afterEach(async () => {
  vi.clearAllMocks();
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

describe("agent tenant generated-media wiring", () => {
  it("forwards the same host media service to every generation route group", async () => {
    const { media } = await registerMediaTenant({
      images: true,
      video: true,
      three_d: true,
      music: true,
      sound_effects: true,
    });

    for (const register of [
      registrations.images,
      registrations.video,
      registrations.threeD,
      registrations.music,
      registrations.soundEffects,
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
  });

  it("mounts music and Sound Effects from independent capability bits", async () => {
    await registerMediaTenant({
      images: false,
      video: false,
      three_d: false,
      music: true,
      sound_effects: false,
    });
    expect(registrations.music).toHaveBeenCalledOnce();
    expect(registrations.soundEffects).not.toHaveBeenCalled();

    vi.clearAllMocks();
    await registerMediaTenant({
      images: false,
      video: false,
      three_d: false,
      music: false,
      sound_effects: true,
    });
    expect(registrations.music).not.toHaveBeenCalled();
    expect(registrations.soundEffects).toHaveBeenCalledOnce();
  });
});
