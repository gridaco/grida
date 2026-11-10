// GRIDA-SEC-004 — the native and compatibility launchers fail independently.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { app } from "electron";
import { expect, it, vi } from "vitest";
import { AgentSidecarSupervisor } from "./agent-sidecar-supervisor";
import { NativeDesktopProfile } from "./native-desktop-profile";
import { RetainedMediaLaunch } from "./retained-media-launch";

const fixture = vi.hoisted(() => {
  const sandboxUnavailable = new Error("fixture sandbox package unavailable");
  return {
    sandboxUnavailable,
    loadSandbox: vi.fn<() => never>(() => {
      throw sandboxUnavailable;
    }),
  };
});

vi.mock("@anthropic-ai/sandbox-runtime", () => fixture.loadSandbox());
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

it("selects the native media launcher even when the compatibility runtime cannot load", async () => {
  const root = await fs.mkdtemp(
    path.join(await fs.realpath(os.tmpdir()), "grida-retained-start-")
  );
  try {
    const agent = path.join(root, "agent");
    const temp = path.join(root, "temp");
    const media = path.join(root, "media");
    const settings = path.join(agent, "retained-settings");
    await fs.mkdir(agent, { mode: 0o700 });
    await fs.mkdir(temp, { mode: 0o700 });
    vi.spyOn(NativeDesktopProfile, "agentData").mockReturnValue(agent);
    vi.spyOn(NativeDesktopProfile, "mediaRoot").mockReturnValue(media);
    const selected = vi
      .spyOn(NativeDesktopProfile, "selected")
      .mockReturnValue(true);
    const mediaOnly = vi
      .spyOn(NativeDesktopProfile, "mediaOnly")
      .mockReturnValue(true);
    vi.mocked(app.getPath).mockReturnValue(temp);
    vi.spyOn(RetainedMediaLaunch, "prepareSettings").mockResolvedValue(
      settings
    );
    const launchObserved = new Error("fixture reached native launcher");
    const launch = vi
      .spyOn(RetainedMediaLaunch, "start")
      .mockImplementation(() => {
        throw launchObserved;
      });
    const retained = new AgentSidecarSupervisor({ agent: false });

    await expect(retained.startRetainedMedia()).rejects.toBe(launchObserved);
    expect(launch).toHaveBeenCalledExactlyOnceWith({
      executable: process.execPath,
      settings,
      providerHome: agent,
      media,
      temporary: path.join(temp, "retained-media"),
      editorBaseUrl: "https://grida.co",
      mediaOnly: true,
    });
    expect(fixture.loadSandbox).not.toHaveBeenCalled();

    selected.mockReturnValue(false);
    mediaOnly.mockReturnValue(false);
    vi.mocked(app.getPath).mockClear();
    const ordinary = new AgentSidecarSupervisor();
    await expect(ordinary.start()).rejects.toMatchObject({
      cause: fixture.sandboxUnavailable,
    });
    expect(fixture.loadSandbox).toHaveBeenCalledOnce();
    expect(app.getPath).not.toHaveBeenCalledWith("temp");
    expect(spawn).not.toHaveBeenCalled();
    expect(ordinary.getInfo()).toBeNull();
  } finally {
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  }
});
