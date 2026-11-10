// GRIDA-SEC-004 / GRIDA-SEC-005 — keep source-run native profile effects contained.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import type { App } from "electron";
import { NativeDesktopProfile } from "./native-desktop-profile";

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
      process.argv.pop();
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
