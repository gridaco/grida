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
  type DaemonTenantHandle,
} from "@grida/daemon/server";
import type { AudioRoutesDeps } from "./http/routes/audio";
import type { ImagesRoutesDeps } from "./http/routes/images";
import type { ThreeDRoutesDeps } from "./http/routes/three-d";
import type { VideoRoutesDeps } from "./http/routes/video";

const registrations = vi.hoisted(() => ({
  images: vi.fn<(app: Hono, deps: ImagesRoutesDeps) => void>(),
  video: vi.fn<(app: Hono, deps: VideoRoutesDeps) => void>(),
  threeD: vi.fn<(app: Hono, deps: ThreeDRoutesDeps) => void>(),
  audio: vi.fn<(app: Hono, deps: AudioRoutesDeps) => void>(),
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
vi.mock("./http/routes/audio", () => ({
  registerAudioRoutes: registrations.audio,
}));

import { createAgentTenant } from "./server";

const cleanup: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  vi.clearAllMocks();
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

describe("agent tenant generated-media wiring", () => {
  it("forwards the same host media service to every generation route group", async () => {
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
    let handle: DaemonTenantHandle | undefined;
    cleanup.push(() => {
      handle?.drain?.();
      handle?.cleanup?.();
    });

    handle = createAgentTenant({
      capabilities: {
        secrets: false,
        agent: false,
        sessions: false,
        providers: false,
        images: true,
        video: true,
        three_d: true,
        audio: true,
      },
      scratch_base: scratchBase,
    }).register(new Hono(), services);

    for (const register of [
      registrations.images,
      registrations.video,
      registrations.threeD,
      registrations.audio,
    ]) {
      expect(register).toHaveBeenCalledOnce();
      expect(register.mock.calls[0]?.[1]).toEqual(
        expect.objectContaining({ media })
      );
    }
  });
});
