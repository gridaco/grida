// GRIDA-SEC-004 / GRIDA-SEC-005 — keep source-run native profile effects contained.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import type { App } from "electron";
import VitePlugin from "@electron-forge/plugin-vite";
import type { ResolvedForgeConfig } from "@electron-forge/shared-types";
import { NativeDesktopProfile } from "./native-desktop-profile";
import { DesktopProfile } from "./desktop-profile";
import { NativeAgentProcess } from "./native-agent-process";
import {
  stageNativeAgent,
  verifyNativeAgent,
} from "../../scripts/native-agent-package.mjs";

it.skipIf(process.platform === "win32")(
  "preserves staged development worker and helper through Forge startup cleanup",
  async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "grida-dev-resources-")
    );
    try {
      const resources = path.join(root, ".native-resources");
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
    const config = path.join(root, "config");
    const argv = process.argv;
    const setPath = vi.fn<App["setPath"]>();
    const app = {
      getAppPath: () => fixture,
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
    const resolve = () =>
      DesktopProfile.resolve(app, DesktopProfile.launch(true, true));
    const configure = () => NativeDesktopProfile.configure(app, resolve());
    try {
      vi.stubEnv("GRIDA_AGENT_USER_DATA", agent);
      const dotGrida = path.join(home, ".grida");
      const configured = path.join(fixture, "configured");
      const alias = path.join(fixture, "configured-alias");
      vi.stubEnv("GRIDA_HOME", alias);
      process.argv = [...argv, "--native-chat"];
      await fs.mkdir(root, { mode: 0o700 });
      await fs.mkdir(browser, { mode: 0o700 });
      await fs.mkdir(dotGrida, { recursive: true, mode: 0o700 });
      await fs.mkdir(appData, { mode: 0o700 });
      await fs.mkdir(configured, { mode: 0o700 });
      await fs.symlink(configured, alias);
      await expect(configure()).rejects.toThrow(
        "native_desktop_profile_invalid"
      );
      vi.stubEnv("GRIDA_HOME", undefined);
      await expect(configure()).rejects.toThrow(
        "native_desktop_profile_invalid"
      );
      vi.stubEnv("GRIDA_HOME", config);
      await expect(configure()).resolves.toBe("gateway");
      expect(resolve().mediaRoot).toBe(path.join(root, "media"));
      const denials = NativeDesktopProfile.protectedRoots(app);
      expect(denials.overlaps(path.join(dotGrida, "agent"))).toBe(true);
      expect(denials.overlaps(path.join(config, "config.toml"))).toBe(true);
      expect(denials.metadataPaths()).toContain(config);
      expect(denials.overlaps(root)).toBe(true);
      expect(() =>
        NativeDesktopProfile.assertPreviewIsolation(app, root)
      ).not.toThrow();
      expect(() =>
        NativeDesktopProfile.assertPreviewIsolation(app, dotGrida)
      ).toThrow("native_desktop_profile_invalid");
      expect((await fs.stat(config)).mode & 0o777).toBe(0o700);
      expect(
        denials.overlaps(path.join(appData, "Grida Insiders", "Media"))
      ).toBe(true);
      expect(denials.overlaps(agent)).toBe(false);
      expect(setPath.mock.calls).toEqual([
        ["temp", path.join(root, "temp")],
        ["documents", path.join(root, "projects")],
      ]);
      process.argv.push("--native-chat-provider=chatgpt");
      await expect(configure()).resolves.toBe("chatgpt");
      process.argv.push("--native-chat-provider=gateway");
      await expect(configure()).rejects.toThrow(
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
        await expect(configure()).resolves.toMatchObject(choice);
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
        await expect(configure()).rejects.toThrow(
          "native_desktop_profile_invalid"
        );
      }
      process.argv = [
        ...argv,
        "--native-chat",
        "--native-chat-provider=chatgpt",
      ];
      vi.stubEnv("GRIDA_HOME", root);
      await expect(configure()).rejects.toThrow(
        "native_desktop_profile_invalid"
      );
      vi.stubEnv("GRIDA_HOME", path.join(root, "symlink"));
      await fs.symlink(configured, process.env.GRIDA_HOME!);
      await expect(configure()).rejects.toThrow(
        "native_desktop_profile_invalid"
      );
      vi.stubEnv("GRIDA_HOME", config);
      await fs.rmdir(agent);
      await fs.symlink(browser, agent);
      await expect(configure()).rejects.toThrow(
        "native_desktop_profile_invalid"
      );
      vi.stubEnv("GRIDA_AGENT_USER_DATA", path.dirname(root));
      await expect(configure()).rejects.toThrow(
        "native_desktop_profile_invalid"
      );
      process.argv = [...argv, "--native-chat", "--disable-agent"];
      expect(resolve().nativeChat).toBe("disabled");
      await expect(configure()).rejects.toThrow(
        "native_desktop_profile_invalid"
      );
    } finally {
      process.argv = argv;
      vi.unstubAllEnvs();
      await fs.rm(fixture, { recursive: true, force: true });
    }
  }
);
