// GRIDA-SEC-004 / GRIDA-SEC-005 — keep source-run native profile effects contained.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import type { App } from "electron";
import { defaultScratchBase } from "@grida/agent/sandbox";
import { ProtectedRoots } from "@grida/daemon/server";
import { NativeDesktopProfile } from "./native-desktop-profile";
import { NativeFirstProfile } from "./native-first-profile";

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
  ).toBe(path.join("/fixture/desktop", ".vite", "native-resources"));
});

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

it.runIf(process.platform === "darwin" && process.arch === "arm64")(
  "enrolls only when known legacy Desktop, Grida home, and scratch paths are absent",
  async () => {
    const fixture = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "grida-native-first-install-")
    );
    const home = path.join(fixture, "home");
    const appData = path.join(home, "Library", "Application Support");
    const gridaHome = path.join(home, ".grida");
    const ordinary = path.join(appData, "Grida");
    const configured = path.join(fixture, "configured-grida");
    const setPath = vi.fn<App["setPath"]>();
    const app = {
      commandLine: { getSwitchValue: () => "" },
      getPath: (name: Parameters<App["getPath"]>[0]) =>
        name === "appData" ? appData : name === "home" ? home : fixture,
      setPath,
    };
    try {
      vi.resetModules();
      const { NativeDesktopProfile: profile } =
        await import("./native-desktop-profile");
      vi.stubEnv("GRIDA_HOME", configured);
      vi.stubEnv("GRIDA_AGENT_USER_DATA", undefined);
      await fs.mkdir(appData, { recursive: true, mode: 0o700 });

      for (const location of [
        ordinary,
        path.join(appData, "Grida Insiders"),
        gridaHome,
        configured,
        defaultScratchBase(path.join(gridaHome, "agent"), fixture),
      ]) {
        await fs.mkdir(location, { mode: 0o700 });
        const data = path.join(location, "retained");
        await fs.writeFile(data, "legacy material");
        profile.prepareFirst(app, true);
        expect(profile.firstSelected()).toBe(false);
        expect(setPath).not.toHaveBeenCalled();
        expect(await fs.readFile(data, "utf8")).toBe("legacy material");
        await expect(
          fs.lstat(path.join(appData, "Grida Native"))
        ).rejects.toMatchObject({ code: "ENOENT" });
        await fs.rm(location, { recursive: true });
      }

      await fs.symlink(path.join(fixture, "missing"), configured);
      profile.prepareFirst(app, true);
      expect(profile.firstSelected()).toBe(false);
      expect(await fs.readlink(configured)).toBe(path.join(fixture, "missing"));
      await fs.unlink(configured);

      profile.prepareFirst(app, true);
      expect(profile.firstSelected()).toBe(true);
      expect(setPath).toHaveBeenCalledWith(
        "userData",
        path.join(appData, "Grida Native", "browser")
      );
    } finally {
      vi.unstubAllEnvs();
      await fs.rm(fixture, { recursive: true, force: true });
    }
  }
);

it.runIf(process.platform === "darwin" && process.arch === "arm64")(
  "preserves ordinary launch overrides before enrollment and refuses them after enrollment",
  async () => {
    const fixture = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "grida-native-enrollment-")
    );
    const home = path.join(fixture, "home");
    const appData = path.join(home, "Library", "Application Support");
    const setPath = vi.fn<App["setPath"]>();
    const getSwitchValue = vi.fn<App["commandLine"]["getSwitchValue"]>(
      () => ""
    );
    const app = {
      commandLine: { getSwitchValue },
      getPath: (name: Parameters<App["getPath"]>[0]) =>
        name === "appData" ? appData : name === "home" ? home : fixture,
      setPath,
    };
    const argv = process.argv;
    try {
      vi.resetModules();
      const { NativeDesktopProfile: profile } =
        await import("./native-desktop-profile");
      vi.stubEnv("GRIDA_HOME", path.join(home, ".grida"));
      await fs.mkdir(appData, { recursive: true, mode: 0o700 });

      vi.stubEnv("GRIDA_AGENT_USER_DATA", path.join(fixture, "agent"));
      profile.prepareFirst(app, true);
      expect(() => profile.prepareFirst(app, false, true)).toThrow(
        "native_first_profile_invalid"
      );
      vi.stubEnv("GRIDA_AGENT_USER_DATA", undefined);

      getSwitchValue.mockReturnValueOnce(path.join(fixture, "browser"));
      profile.prepareFirst(app, true);
      process.argv = [
        ...argv,
        "--user-data-dir",
        path.join(fixture, "browser"),
      ];
      profile.prepareFirst(app, true);
      process.argv = [...argv, "--native-chat"];
      profile.prepareFirst(app, true);
      process.argv = argv;

      const arch = Object.getOwnPropertyDescriptor(process, "arch")!;
      Object.defineProperty(process, "arch", { ...arch, value: "x64" });
      try {
        profile.prepareFirst(app, true);
      } finally {
        Object.defineProperty(process, "arch", arch);
      }
      expect(profile.firstSelected()).toBe(false);
      expect(setPath).not.toHaveBeenCalled();
      expect(await fs.readdir(appData)).toEqual([]);

      profile.prepareFirst(app, true);
      expect(profile.firstSelected()).toBe(true);
      const record = path.join(appData, "Grida Native", "profile.json");
      const original = await fs.readFile(record);

      vi.resetModules();
      const { NativeDesktopProfile: reopen } =
        await import("./native-desktop-profile");
      getSwitchValue.mockReturnValueOnce(path.join(fixture, "browser"));
      setPath.mockClear();
      expect(() => reopen.prepareFirst(app, true)).toThrow(
        "native_first_profile_invalid"
      );
      expect(setPath).not.toHaveBeenCalled();
      expect(await fs.readFile(record)).toEqual(original);
    } finally {
      process.argv = argv;
      vi.unstubAllEnvs();
      await fs.rm(fixture, { recursive: true, force: true });
    }
  }
);

it.runIf(process.platform === "darwin" && process.arch === "arm64")(
  "opens only a verified existing native profile for a disabled agent",
  async () => {
    const fixture = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "grida-native-media-profile-")
    );
    const home = path.join(fixture, "home");
    const appData = path.join(home, "Library", "Application Support");
    const oldAgent = path.join(home, ".grida", "agent");
    const oldBrowser = path.join(appData, "Grida");
    const argv = process.argv;
    const paths = new Map<string, string>([
      ["home", home],
      ["appData", appData],
      ["userData", oldBrowser],
      ["temp", fixture],
    ]);
    const setPath = vi.fn<App["setPath"]>((name, directory) => {
      paths.set(name, directory);
    });
    const app = {
      commandLine: { getSwitchValue: () => "" },
      getPath: (name: Parameters<App["getPath"]>[0]) => paths.get(name)!,
      setPath,
    };
    try {
      vi.resetModules();
      const { NativeDesktopProfile: profile } =
        await import("./native-desktop-profile");
      vi.stubEnv("GRIDA_HOME", path.join(home, ".grida"));
      vi.stubEnv("GRIDA_AGENT_USER_DATA", undefined);
      process.argv = [...argv, "--disable-agent"];
      await fs.mkdir(oldBrowser, { recursive: true, mode: 0o700 });
      await fs.mkdir(oldAgent, { recursive: true, mode: 0o700 });
      const oldChat = path.join(oldAgent, "sessions.db");
      await fs.writeFile(oldChat, "retained legacy chat", { mode: 0o600 });
      profile.prepareFirst(app, true);
      expect(profile.selected()).toBe(false);
      expect(setPath).not.toHaveBeenCalled();
      expect(await fs.readdir(appData)).toEqual(["Grida"]);

      const legacyRoots = () => new ProtectedRoots([oldBrowser, oldAgent]);
      const v2 = NativeFirstProfile.open(appData, legacyRoots, {
        supported: true,
        allowBirth: true,
        legacyPredecessor: true,
      })!;
      expect(() => profile.prepareFirst(app, false)).toThrow(
        "native_desktop_profile_invalid"
      );
      expect(setPath).not.toHaveBeenCalled();
      expect(await fs.readdir(v2.agent)).toEqual([]);
      const promoted = NativeFirstProfile.open(appData, legacyRoots, {
        supported: true,
        allowBirth: false,
      })!;
      const promotion = {
        sourceId: "a".repeat(64),
        scratchId: "b".repeat(64),
        claimId: "eac20941-e6a4-40aa-a2a2-0015ab53e80e",
      };
      NativeFirstProfile.beginPromotion(promoted, promotion);
      profile.prepareFirst(app, false);
      expect(profile.mediaOnly()).toBe(true);
      expect(profile.managedCutover()).toBe(true);
      expect(paths.get("userData")).toBe(promoted.browser);
      expect(() => profile.verifyPromotion(promotion)).not.toThrow();
      expect(() =>
        profile.verifyPromotion({ ...promotion, sourceId: "c".repeat(64) })
      ).toThrow("native_first_profile_invalid");
      await fs.rm(v2.root, { recursive: true, force: true });
      paths.set("temp", fixture);
      vi.resetModules();
      const { NativeDesktopProfile: freshProfile } =
        await import("./native-desktop-profile");

      const native = NativeFirstProfile.open(appData, legacyRoots, {
        supported: true,
        allowBirth: true,
      })!;
      const browserChat = path.join(native.browser, "native-chat");
      await fs.mkdir(browserChat, { mode: 0o700 });
      await fs.writeFile(path.join(browserChat, "retained"), "native chat");
      freshProfile.prepareFirst(app, false);
      await expect(freshProfile.configure(app)).resolves.toBe("gateway");
      expect(freshProfile.selected()).toBe(true);
      expect(freshProfile.mediaOnly()).toBe(true);
      expect(freshProfile.agentData()).toBe(native.agent);
      expect(freshProfile.mediaRoot()).toBe(native.media);
      expect(paths.get("userData")).toBe(native.browser);
      expect(paths.get("sessionData")).toBe(native.browser);
      expect(freshProfile.legacyRoots(app).overlaps(oldChat)).toBe(true);
      expect(await fs.readFile(oldChat, "utf8")).toBe("retained legacy chat");
      expect(
        await fs.readFile(path.join(browserChat, "retained"), "utf8")
      ).toBe("native chat");
      expect(await fs.readdir(native.agent)).toEqual([]);
    } finally {
      process.argv = argv;
      vi.unstubAllEnvs();
      await fs.rm(fixture, { recursive: true, force: true });
    }
  }
);
