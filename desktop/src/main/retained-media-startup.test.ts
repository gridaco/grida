// GRIDA-SEC-004 — the native and compatibility launchers fail independently.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { app } from "electron";
import { expect, it, vi } from "vitest";
import { AgentSidecarSupervisor } from "./agent-sidecar-supervisor";
import { DesktopMediaRoot } from "./media-root";
import { NativeDesktopProfile } from "./native-desktop-profile";
import { RetainedMediaLaunch } from "./retained-media-launch";
import { RetainedServiceSandbox } from "./retained-service-sandbox";

vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  spawn: vi.fn<typeof spawn>(() => {
    throw new Error("unexpected process launch");
  }),
}));
vi.mock("electron", () => ({
  app: {
    once: vi.fn<(event: string, callback: () => void) => void>(),
    getPath: vi.fn<(name: string) => string>(),
    hasSingleInstanceLock: () => true,
    isPackaged: true,
  },
}));
vi.mock("../env", () => ({ EDITOR_BASE_URL: "https://grida.co" }));

it.each(["managed", "split"])(
  "starts retained media with %s roots without loading the compatibility runtime",
  async (layout) => {
    const root = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "grida-retained-start-")
    );
    try {
      const providerHome = path.join(root, "grida");
      const agent =
        layout === "split" ? path.join(providerHome, "agent") : providerHome;
      const temp = path.join(root, "temp");
      const media = path.join(root, "media");
      const settings = path.join(agent, "retained-settings");
      await fs.mkdir(agent, { mode: 0o700, recursive: true });
      await fs.mkdir(temp, { mode: 0o700 });
      vi.stubEnv("GRIDA_HOME", providerHome);
      vi.spyOn(NativeDesktopProfile, "agentData").mockReturnValue(
        layout === "split" ? undefined : agent
      );
      vi.spyOn(DesktopMediaRoot, "current").mockReturnValue(media);
      const selected = vi
        .spyOn(NativeDesktopProfile, "selected")
        .mockReturnValue(true);
      const mediaOnly = vi
        .spyOn(NativeDesktopProfile, "mediaOnly")
        .mockReturnValue(false);
      vi.mocked(app.getPath).mockReturnValue(temp);
      const prepareSettings = vi
        .spyOn(RetainedMediaLaunch, "prepareSettings")
        .mockResolvedValue(settings);
      const prepareProviderHome = vi
        .spyOn(RetainedMediaLaunch, "prepareProviderHome")
        .mockResolvedValue(undefined);
      const launchObserved = new Error("fixture reached native launcher");
      const launch = vi
        .spyOn(RetainedMediaLaunch, "start")
        .mockImplementation(() => {
          throw launchObserved;
        });
      const retained = new AgentSidecarSupervisor();
      await expect(retained.startRetainedMedia()).rejects.toThrow(
        "retained_media_profile_unavailable"
      );
      expect(prepareSettings).not.toHaveBeenCalled();
      expect(prepareProviderHome).not.toHaveBeenCalled();
      if (layout === "split") {
        await retained.sealLegacyChatForColdStart();
      } else {
        mediaOnly.mockReturnValue(true);
      }

      await expect(retained.startRetainedMedia()).rejects.toBe(launchObserved);
      expect(launch).toHaveBeenCalledExactlyOnceWith({
        executable: process.execPath,
        agentData: agent,
        providerHome,
        media,
        temporary: path.join(temp, "retained-media"),
        editorBaseUrl: "https://grida.co",
        mediaOnly: layout === "managed",
      });
      expect(prepareSettings).toHaveBeenCalledExactlyOnceWith(agent);
      expect(prepareProviderHome).toHaveBeenCalledExactlyOnceWith(providerHome);
      expect(Reflect.get(retained, "nativeSandbox")).toBeUndefined();

      selected.mockReturnValue(false);
      mediaOnly.mockReturnValue(false);
      vi.mocked(app.getPath).mockClear();
      const ordinary = new AgentSidecarSupervisor();
      const prepare = vi
        .spyOn(RetainedServiceSandbox.prototype, "prepare")
        .mockImplementation(() => {
          throw new Error("fixture native scope unavailable");
        });
      await expect(ordinary.start()).rejects.toThrow(
        "fixture native scope unavailable"
      );
      expect(prepare).toHaveBeenCalledOnce();
      expect(app.getPath).not.toHaveBeenCalledWith("temp");
      expect(spawn).not.toHaveBeenCalled();
      expect(ordinary.getInfo()).toBeNull();
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      await fs.rm(root, { recursive: true, force: true });
    }
  }
);
