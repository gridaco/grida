// GRIDA-SEC-004 / GRIDA-SEC-005 — keep source-run native profile effects contained.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import type { App } from "electron";
import VitePlugin from "@electron-forge/plugin-vite";
import type { ResolvedForgeConfig } from "@electron-forge/shared-types";
import { NativeDesktopProfile } from "./native-desktop-profile";
import { NativeAgentProcess } from "./native-agent-process";
import {
  stageNativeAgent,
  verifyNativeAgent,
} from "../../scripts/native-agent-package.mjs";

it("selects native chat across Unix channels and isolated ordinary profiles, without a Windows fallback", async () => {
  vi.resetModules();
  const { NativeDesktopProfile: profile } =
    await import("./native-desktop-profile");
  const argv = process.argv;
  try {
    vi.stubEnv("GRIDA_AGENT_USER_DATA", undefined);
    process.argv = argv.slice(0, 2);
    for (const platform of ["darwin", "linux", "win32"]) {
      vi.stubGlobal("INSIDERS", 0);
      vi.stubGlobal("process", { ...process, platform });
      expect(profile.ordinaryChat()).toBe(platform !== "win32");
      vi.stubGlobal("INSIDERS", 1);
      expect(profile.ordinaryChat()).toBe(platform !== "win32");
      vi.unstubAllGlobals();
    }
    for (const flag of [
      "--native-chat",
      "--native-chat-provider=gateway",
      "--disable-agent",
    ]) {
      process.argv = [...argv.slice(0, 2), flag];
      expect(profile.ordinaryChat()).toBe(false);
    }
    process.argv = [...argv.slice(0, 2), "--user-data-dir=/fixture"];
    vi.stubEnv("GRIDA_AGENT_USER_DATA", "/fixture/isolated");
    expect(profile.ordinaryChat()).toBe(process.platform !== "win32");
  } finally {
    process.argv = argv;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  }
});

it("resolves development resources independently of the shared Electron installation", () => {
  expect(
    NativeDesktopProfile.resourcesPath({
      isPackaged: false,
      getAppPath: () => "/fixture/desktop",
    })
  ).toBe(path.join("/fixture/desktop", ".native-resources"));
  expect(
    NativeDesktopProfile.resourcesPath({
      isPackaged: true,
      getAppPath: () => "/fixture/desktop",
    })
  ).toBe(process.resourcesPath);
});

it.skipIf(process.platform === "win32")(
  "preserves staged development worker and helper through Forge startup cleanup",
  async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "grida-dev-resources-")
    );
    try {
      const resources = NativeDesktopProfile.resourcesPath({
        isPackaged: false,
        getAppPath: () => root,
      });
      const artifacts = path.join(root, "artifacts");
      const target = path.join(
        artifacts,
        `${process.platform}-${process.arch}`
      );
      await fs.mkdir(target, { recursive: true });
      await fs.mkdir(resources);
      const { fixtureBinary } = (await import(
        new URL(
          "../../../scripts/cli-release/native-fixture.mjs",
          import.meta.url
        ).href
      )) as { fixtureBinary(platform: { os: string; cpu: string }): Buffer };
      const binary = fixtureBinary({ os: process.platform, cpu: process.arch });
      for (const name of ["grida-agent", "agent-kit-sandbox-helper"])
        await fs.writeFile(path.join(target, name), binary);
      stageNativeAgent(resources, artifacts, process.platform, process.arch);
      const disposable = path.join(root, ".vite", "build");
      await fs.mkdir(disposable, { recursive: true });
      await fs.writeFile(path.join(disposable, "stale.js"), "stale");
      const plugin = new VitePlugin({ build: [], renderer: [] });
      plugin.setDirectories(root);
      const hooks = plugin.getHooks().preStart;
      if (!Array.isArray(hooks) || !hooks[0])
        throw new Error("Forge startup hook unavailable");
      await hooks[0].call(null, {} as ResolvedForgeConfig);
      await expect(fs.stat(path.join(root, ".vite"))).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(NativeAgentProcess.executable(resources)).toBe(
        path.join(resources, "native-agent", "grida-agent")
      );
      verifyNativeAgent(resources, process.platform, process.arch);
      expect(
        await fs.readFile(
          path.join(resources, "native-agent", "agent-kit-sandbox-helper")
        )
      ).toEqual(binary);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }
);

it.skipIf(process.platform === "win32")(
  "isolates browser, source, project, temp and media paths for an explicit native profile",
  async () => {
    const fixture = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "grida-native-profile-")
    );
    const root = path.join(fixture, "preview");
    const home = path.join(fixture, "home");
    const appData = path.join(fixture, "app-data");
    const browser = path.join(root, "browser");
    const agent = path.join(root, "agent");
    const argv = process.argv;
    const setPath = vi.fn<App["setPath"]>();
    const app = {
      commandLine: { getSwitchValue: () => browser },
      getPath: (name: Parameters<App["getPath"]>[0]) =>
        name === "temp"
          ? os.tmpdir()
          : name === "home"
            ? home
            : name === "appData"
              ? appData
              : browser,
      setPath,
    };
    try {
      vi.stubGlobal("INSIDERS", 1);
      vi.stubEnv("GRIDA_AGENT_USER_DATA", agent);
      const oldHome = path.join(home, ".grida");
      const configured = path.join(fixture, "configured");
      const alias = path.join(fixture, "legacy-alias");
      vi.stubEnv("GRIDA_HOME", alias);
      process.argv = [...argv, "--native-chat"];
      await fs.mkdir(root, { mode: 0o700 });
      await fs.mkdir(browser, { mode: 0o700 });
      await fs.mkdir(oldHome, { recursive: true, mode: 0o700 });
      await fs.mkdir(appData, { mode: 0o700 });
      await fs.mkdir(configured, { mode: 0o700 });
      await fs.symlink(configured, alias);
      await expect(NativeDesktopProfile.configure(app)).resolves.toBe(
        "gateway"
      );
      expect(NativeDesktopProfile.mediaRoot()).toBe(path.join(root, "media"));
      const denials = NativeDesktopProfile.legacyRoots(app);
      expect(denials.overlaps(path.join(oldHome, "agent"))).toBe(true);
      expect(denials.overlaps(path.join(configured, "agent"))).toBe(true);
      expect(denials.metadataPaths()).toContain(alias);
      expect(denials.canonicalPaths()).toContain(configured);
      expect(denials.canonicalPaths()).not.toContain(alias);
      expect(
        denials.overlaps(path.join(appData, "Grida Insiders", "Media"))
      ).toBe(true);
      expect(denials.overlaps(agent)).toBe(false);
      expect(setPath.mock.calls).toEqual([
        ["temp", path.join(root, "temp")],
        ["documents", path.join(root, "projects")],
      ]);
      process.argv.push("--native-chat-provider=chatgpt");
      await expect(NativeDesktopProfile.configure(app)).resolves.toBe(
        "chatgpt"
      );
      process.argv.push("--native-chat-provider=gateway");
      await expect(NativeDesktopProfile.configure(app)).rejects.toThrow(
        "native_desktop_profile_invalid"
      );
      for (const [flags, choice] of [
        [
          [
            "--native-chat-provider=openrouter",
            "--native-chat-model=openai/gpt-5.5",
          ],
          { kind: "byok", id: "openrouter", model: "openai/gpt-5.5" },
        ],
        [
          ["--native-chat-provider=endpoint:local"],
          { kind: "endpoint", id: "local" },
        ],
      ] as const) {
        process.argv = [...argv, "--native-chat", ...flags];
        await expect(
          NativeDesktopProfile.configure(app)
        ).resolves.toMatchObject(choice);
      }
      for (const flags of [
        ["--native-chat-provider=openrouter"],
        ["--native-chat-provider=endpoint:gg"],
        [
          "--native-chat-provider=endpoint:local",
          "--native-chat-model=a",
          "--native-chat-model=b",
        ],
        ["--native-chat-model=openai/gpt-5.5"],
      ]) {
        process.argv = [...argv, "--native-chat", ...flags];
        await expect(NativeDesktopProfile.configure(app)).rejects.toThrow(
          "native_desktop_profile_invalid"
        );
      }
      process.argv = [
        ...argv,
        "--native-chat",
        "--native-chat-provider=chatgpt",
      ];
      vi.stubEnv("GRIDA_HOME", root);
      await expect(NativeDesktopProfile.configure(app)).rejects.toThrow(
        "native_desktop_profile_invalid"
      );
      vi.stubEnv("GRIDA_HOME", alias);
      await fs.rmdir(agent);
      await fs.symlink(browser, agent);
      await expect(NativeDesktopProfile.configure(app)).rejects.toThrow(
        "native_desktop_profile_invalid"
      );
      vi.stubEnv("GRIDA_AGENT_USER_DATA", path.dirname(root));
      await expect(NativeDesktopProfile.configure(app)).rejects.toThrow(
        "native_desktop_profile_invalid"
      );
      process.argv = [...argv, "--native-chat", "--disable-agent"];
      expect(NativeDesktopProfile.selected()).toBe(false);
      expect(NativeDesktopProfile.mediaRoot()).toBeUndefined();
    } finally {
      process.argv = argv;
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
      await fs.rm(fixture, { recursive: true, force: true });
    }
  }
);
