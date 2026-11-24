// GRIDA-SEC-004 / GRIDA-SEC-005 — keep source-run native profile effects contained.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, onTestFinished, vi } from "vitest";
import type { App } from "electron";
import VitePlugin from "@electron-forge/plugin-vite";
import type { ResolvedForgeConfig } from "@electron-forge/shared-types";
import { ProtectedRoots } from "@grida/daemon/server";
import { NativeDesktopProfile } from "./native-desktop-profile";
import { DesktopProfile } from "./desktop-profile";
import { NativeDevelopmentResources } from "./native-development-resources";
import { NativeAgentProcess } from "./native-agent-process";
import {
  stageNativeAgent,
  verifyNativeAgent,
} from "../../scripts/native-agent-package.mjs";

it("excludes packaged application resources while allowing source checkouts as workspaces", () => {
  const base = path.join(os.tmpdir(), "grida-native-profile-test");
  const home = path.join(base, "home");
  const configuredHome = path.join(base, "configured-home");
  const appData = path.join(home, "app-data");
  const checkout = path.join(home, "src", "grida");
  const resources = path.join(
    checkout,
    "node_modules",
    "electron",
    "Resources"
  );
  const getPath = (name: Parameters<App["getPath"]>[0]) =>
    name === "home" ? home : appData;
  const account = os.userInfo();
  const accountLookup = vi.spyOn(os, "userInfo").mockReturnValue({
    ...account,
    homedir: home,
  });
  vi.stubEnv("GRIDA_HOME", configuredHome);
  onTestFinished(() => {
    accountLookup.mockRestore();
    vi.unstubAllEnvs();
  });

  for (const isPackaged of [false, true]) {
    const protection = NativeDesktopProfile.ordinaryChatProtection(
      { getPath, isPackaged },
      resources
    );
    const workspace = new ProtectedRoots(protection.workspace);
    const launch = new ProtectedRoots(protection.launch);
    for (const protection of [workspace, launch]) {
      expect(protection.overlaps(checkout)).toBe(isPackaged);
      expect(protection.overlaps(path.join(home, ".aws"))).toBe(true);
      expect(protection.overlaps(path.join(appData, "Grida Dev"))).toBe(true);
    }
    expect(workspace.overlaps(path.join(home, ".grida"))).toBe(true);
    expect(launch.overlaps(path.join(home, ".grida"))).toBe(false);
    expect(workspace.overlaps(configuredHome)).toBe(true);
    expect(launch.overlaps(configuredHome)).toBe(false);
  }
  accountLookup.mockReturnValueOnce({ ...account, homedir: configuredHome });
  accountLookup.mockImplementationOnce(() => {
    throw new Error("account lookup unavailable");
  });
  for (let i = 0; i < 2; i++) {
    const protection = NativeDesktopProfile.ordinaryChatProtection({
      getPath,
      isPackaged: false,
    });
    const launch = new ProtectedRoots(protection.launch);
    expect(launch.overlaps(path.join(home, ".grida", "auth"))).toBe(true);
    expect(launch.overlaps(configuredHome)).toBe(false);
  }
});

it.skipIf(process.platform === "win32")(
  "preserves Forge build outputs and stages private development resources outside the checkout",
  async () => {
    const root = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), "grida-dev-resources-"))
    );
    try {
      const checkout = path.join(root, "source");
      const browser = path.join(root, "browser");
      const privateResources = path.join(browser, "native-resources");
      const resources = path.join(checkout, ".native-resources");
      const artifacts = path.join(root, "artifacts");
      const target = path.join(
        artifacts,
        `${process.platform}-${process.arch}`
      );
      await fs.mkdir(target, { recursive: true });
      await fs.mkdir(resources, { recursive: true });
      await fs.mkdir(browser, { mode: 0o700 });
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
      const programs = path.join(resources, "bundled-programs");
      await fs.mkdir(path.join(programs, "bin"), { recursive: true });
      await fs.writeFile(path.join(programs, "bin", "grida-fx"), binary, {
        mode: 0o755,
      });
      await fs.writeFile(path.join(programs, "fx-version"), "0.9.0\n");
      await fs.writeFile(path.join(programs, "FX-LICENSE"), "Test license.\n");
      const disposable = path.join(checkout, ".vite", "build");
      await fs.mkdir(disposable, { recursive: true });
      await fs.writeFile(path.join(disposable, "stale.js"), "stale");
      const plugin = new VitePlugin({ build: [], renderer: [] });
      plugin.setDirectories(checkout);
      const hooks = plugin.getHooks().preStart;
      if (!Array.isArray(hooks) || !hooks[0])
        throw new Error("Forge startup hook unavailable");
      await hooks[0].call(null, {} as ResolvedForgeConfig);
      await expect(fs.stat(path.join(checkout, ".vite"))).rejects.toMatchObject(
        { code: "ENOENT" }
      );

      const profile = DesktopProfile.resolve(
        { getAppPath: () => checkout, getPath: () => browser },
        DesktopProfile.launch(false, false, {
          platform: process.platform,
          argv: [],
        }),
        {
          platform: process.platform,
          home: root,
          environment: {},
          resourcesPath: "",
        }
      );
      const helper = path.join(
        resources,
        "native-agent",
        "agent-kit-sandbox-helper"
      );
      await fs.rename(helper, path.join(target, "helper-backup"));
      await fs.symlink(path.join(target, "helper-backup"), helper);
      await expect(NativeDevelopmentResources.prepare(profile)).rejects.toThrow(
        /ELOOP|native_development_resources_invalid/
      );
      await fs.unlink(helper);
      await fs.rename(path.join(target, "helper-backup"), helper);

      const runtime = await NativeDevelopmentResources.prepare(profile);
      expect(runtime.resourcesPath).toBe(privateResources);
      expect((await fs.stat(privateResources)).mode & 0o777).toBe(0o700);
      expect(NativeAgentProcess.executable(runtime.resourcesPath)).toBe(
        path.join(privateResources, "native-agent", "grida-agent")
      );
      verifyNativeAgent(privateResources, process.platform, process.arch);
      verifyNativeAgent(resources, process.platform, process.arch);
      for (const file of [
        "native-agent/grida-agent",
        "native-agent/agent-kit-sandbox-helper",
        "bundled-programs/bin/grida-fx",
        "bundled-programs/fx-version",
        "bundled-programs/FX-LICENSE",
      ]) {
        const source = path.join(resources, file);
        const destination = path.join(privateResources, file);
        expect(await fs.readFile(destination)).toEqual(
          await fs.readFile(source)
        );
        expect((await fs.stat(destination)).ino).not.toBe(
          (await fs.stat(source)).ino
        );
      }
      await expect(
        NativeDevelopmentResources.prepare(profile)
      ).resolves.toEqual(runtime);
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
      const launch = NativeDesktopProfile.launchProtectedRoots(app);
      expect(denials.overlaps(path.join(dotGrida, "agent"))).toBe(true);
      expect(launch.overlaps(path.join(dotGrida, "agent"))).toBe(true);
      expect(launch.overlaps(config)).toBe(false);
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
