// GRIDA-SEC-004 / GRIDA-SEC-014 — purpose-scoped ordinary document access.
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { defaultScratchBase } from "@grida/agent/sandbox";
import {
  nativeWorkspaceMedia,
  ordinarySelectedSvgFiles,
} from "./workspace-media-access";

const host = vi.hoisted(() => ({
  paths: new Map<string, string>(),
  events: {} as EventEmitter,
  packaged: true,
  managed: false,
  agent: "",
}));

vi.mock("electron", () => ({
  app: {
    get isPackaged() {
      return host.packaged;
    },
    getPath: (name: string) => host.paths.get(name)!,
    once: (name: string, callback: () => void) =>
      host.events.once(name, callback),
  },
}));
vi.mock("@grida/home", () => ({
  home: { dir: () => host.paths.get("grida")! },
}));
vi.mock("./media-root", () => ({
  DesktopMediaRoot: { current: () => host.paths.get("media")! },
}));
vi.mock("./native-desktop-profile", () => ({
  NativeDesktopProfile: {
    selected: () => false,
    firstSelected: () => host.managed,
    agentData: () => host.agent,
    resourcesPath: () => process.resourcesPath,
  },
}));

const resources = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;

it.runIf(
  Boolean(resources) &&
    process.platform === "darwin" &&
    process.arch === "arm64"
)(
  "opens and saves an ordinary agent-disabled SVG through the built file worker",
  async () => {
    const root = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "grida-ordinary-svg-")
    );
    const argv = process.argv;
    const resourceProperty = Object.getOwnPropertyDescriptor(
      process,
      "resourcesPath"
    );
    host.events = new EventEmitter();
    try {
      for (const name of [
        "home",
        "grida",
        "userData",
        "sessionData",
        "temp",
        "media",
        "agent",
      ]) {
        const folder = path.join(root, name);
        await fs.mkdir(folder);
        host.paths.set(name, folder);
      }
      host.agent = host.paths.get("agent")!;
      Object.defineProperty(process, "resourcesPath", {
        value: resources,
        configurable: true,
      });
      process.argv = argv.filter((arg) => arg !== "--disable-agent");
      expect(ordinarySelectedSvgFiles()).toBeUndefined();
      const temp = host.paths.get("temp")!;
      const selected = path.join(temp, "drawing.svg");
      await fs.writeFile(selected, "<svg>Original</svg>");
      const owner = { signal: new AbortController().signal, check() {} };
      const chatState = path.join(host.paths.get("userData")!, "native-chat");
      await fs.mkdir(chatState, { mode: 0o700 });
      const identities = path.join(chatState, "document-identities");
      const legacyProfile = path.join(root, "Grida Insiders");
      const defaultGridaHome = path.join(host.paths.get("home")!, ".grida");
      await fs.mkdir(legacyProfile);
      await fs.mkdir(defaultGridaHome);
      const protectedPaths = [legacyProfile, defaultGridaHome];
      const chatFiles = ordinarySelectedSvgFiles(identities, protectedPaths)!;
      for (const directory of protectedPaths) {
        const protectedSvg = path.join(directory, "retained.svg");
        await fs.writeFile(protectedSvg, "<svg>Protected</svg>");
        await expect(chatFiles.register(protectedSvg)).rejects.toThrow(
          "The selected document is unavailable"
        );
      }
      const chatId = await chatFiles.register(selected);
      const chatKey = await chatFiles.chatIdentity(chatId, owner);
      await chatFiles.read(chatId, owner);
      await chatFiles.write(chatId, "<svg>Saved</svg>", owner);
      expect(await chatFiles.chatIdentity(chatId, owner)).toBe(chatKey);
      chatFiles.release(chatId);
      const reopenedFiles = ordinarySelectedSvgFiles(
        identities,
        protectedPaths
      )!;
      const reopenedId = await reopenedFiles.register(selected);
      expect(await reopenedFiles.chatIdentity(reopenedId, owner)).toBe(chatKey);
      reopenedFiles.release(reopenedId);
      await fs.writeFile(selected, "<svg>Original</svg>");
      process.argv = [...process.argv, "--disable-agent"];
      host.packaged = false;
      expect(ordinarySelectedSvgFiles()).toBeDefined();
      host.packaged = true;
      host.managed = true;
      expect(ordinarySelectedSvgFiles()).toBeUndefined();
      host.managed = false;
      const documents = ordinarySelectedSvgFiles()!;
      expect(nativeWorkspaceMedia()).toBeUndefined();
      const id = await documents.register(selected);
      expect(await documents.register(selected)).toBe(id);
      expect((await documents.read(id, owner)).content).toBe(
        "<svg>Original</svg>"
      );
      await documents.write(id, "<svg>Saved</svg>", owner);
      expect(await fs.readFile(selected, "utf8")).toBe("<svg>Saved</svg>");
      await expect(documents.chatIdentity(id, owner)).rejects.toThrow(
        "The selected document is unavailable"
      );
      expect(await fs.readdir(host.paths.get("userData")!)).toEqual([
        "native-chat",
      ]);
      const secret = path.join(host.agent, "secret.svg");
      const alias = path.join(root, "alias.svg");
      await fs.writeFile(secret, "<svg>Protected</svg>");
      await fs.symlink(secret, alias);
      await expect(documents.register(alias)).rejects.toThrow(
        "The selected document is unavailable"
      );
      const scratch = defaultScratchBase(host.agent, temp);
      await fs.mkdir(scratch);
      const scratchFile = path.join(scratch, "retained.svg");
      await fs.writeFile(scratchFile, "<svg>Retained</svg>");
      await expect(documents.register(scratchFile)).rejects.toThrow(
        "The selected document is unavailable"
      );
      documents.release(id);
      await expect(documents.read(id, owner)).rejects.toThrow(
        "The selected document is unavailable"
      );
    } finally {
      host.events.emit("will-quit");
      process.argv = argv;
      if (resourceProperty)
        Object.defineProperty(process, "resourcesPath", resourceProperty);
      else Reflect.deleteProperty(process, "resourcesPath");
      await fs.rm(root, { recursive: true, force: true });
    }
  }
);
