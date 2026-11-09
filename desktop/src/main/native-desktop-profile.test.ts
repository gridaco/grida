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
    const root = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "grida-native-profile-")
    );
    const browser = path.join(root, "browser");
    const agent = path.join(root, "agent");
    const argv = process.argv;
    const setPath = vi.fn<App["setPath"]>();
    const app = {
      commandLine: { getSwitchValue: () => browser },
      getPath: (name: Parameters<App["getPath"]>[0]) =>
        name === "temp" ? os.tmpdir() : browser,
      setPath,
    };
    try {
      vi.stubGlobal("INSIDERS", 1);
      vi.stubEnv("GRIDA_AGENT_USER_DATA", agent);
      process.argv = [...argv, "--native-chat"];
      await fs.mkdir(browser, { mode: 0o700 });
      await expect(NativeDesktopProfile.configure(app)).resolves.toBe(
        "gateway"
      );
      expect(NativeDesktopProfile.mediaRoot()).toBe(path.join(root, "media"));
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
      await fs.rm(root, { recursive: true, force: true });
    }
  }
);
