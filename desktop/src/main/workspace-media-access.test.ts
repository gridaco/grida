// GRIDA-SEC-004 / GRIDA-SEC-014 — purpose-scoped ordinary document access.
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { DesktopProfile } from "./desktop-profile";
import {
  nativeWorkspaceMedia,
  ordinarySelectedSvgFiles,
} from "./workspace-media-access";

const host = vi.hoisted(() => ({
  events: {} as EventEmitter,
}));

vi.mock("electron", () => ({
  app: {
    once: (name: string, callback: () => void) =>
      host.events.once(name, callback),
  },
}));
vi.mock("./native-desktop-profile", () => ({
  NativeDesktopProfile: {
    installedRootsForDevelopment: () => undefined,
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
    host.events = new EventEmitter();
    const userHome = path.join(root, "home");
    const gridaHome = path.join(root, "grida");
    const userData = path.join(root, "userData");
    const sessionData = path.join(root, "sessionData");
    const temp = path.join(root, "temp");
    const mediaRoot = path.join(root, "media");
    const agentData = path.join(root, "agent");
    const documentsRoot = path.join(root, "documents");
    const profile: DesktopProfile = {
      ...DesktopProfile.launch(true, false),
      nativeChat: "ordinary",
      agentDisabled: false,
      userHome,
      userData,
      sessionData,
      gridaHome,
      configHome: agentData,
      providerHome: agentData,
      agentData,
      agentDataOverride: agentData,
      mediaRoot,
      temp,
      documents: documentsRoot,
      projectsRoot: path.join(documentsRoot, "Grida Projects"),
      resourcesPath: resources!,
      catalogueDirectory: path.join(userData, "model-catalogue"),
    };
    try {
      for (const directory of [
        userHome,
        gridaHome,
        userData,
        sessionData,
        temp,
        mediaRoot,
        agentData,
        documentsRoot,
      ])
        await fs.mkdir(directory);
      expect(ordinarySelectedSvgFiles(profile)).toBeUndefined();
      const selected = path.join(temp, "drawing.svg");
      await fs.writeFile(selected, "<svg>Original</svg>");
      const owner = { signal: new AbortController().signal, check() {} };
      const chatState = path.join(userData, "chats");
      await fs.mkdir(chatState, { mode: 0o700 });
      const identities = path.join(chatState, "document-identities");
      const insidersProfile = path.join(root, "Grida Insiders");
      const defaultGridaHome = path.join(userHome, ".grida");
      await fs.mkdir(insidersProfile);
      await fs.mkdir(defaultGridaHome);
      const protectedPaths = [insidersProfile, defaultGridaHome];
      const chatFiles = ordinarySelectedSvgFiles(
        profile,
        identities,
        protectedPaths
      )!;
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
        profile,
        identities,
        protectedPaths
      )!;
      const reopenedId = await reopenedFiles.register(selected);
      expect(await reopenedFiles.chatIdentity(reopenedId, owner)).toBe(chatKey);
      reopenedFiles.release(reopenedId);
      await fs.writeFile(selected, "<svg>Original</svg>");
      const disabled: DesktopProfile = {
        ...profile,
        nativeChat: "disabled",
        agentDisabled: true,
      };
      expect(
        ordinarySelectedSvgFiles({ ...disabled, isPackaged: false })
      ).toBeDefined();
      const documents = ordinarySelectedSvgFiles(disabled)!;
      expect(nativeWorkspaceMedia(disabled)).toBeUndefined();
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
      expect(await fs.readdir(userData)).toEqual(["chats"]);
      const secret = path.join(agentData, "secret.svg");
      const alias = path.join(root, "alias.svg");
      await fs.writeFile(secret, "<svg>Protected</svg>");
      await fs.symlink(secret, alias);
      await expect(documents.register(alias)).rejects.toThrow(
        "The selected document is unavailable"
      );
      const chatStateFile = path.join(chatState, "retained.svg");
      await fs.writeFile(chatStateFile, "<svg>Retained</svg>");
      await expect(documents.register(chatStateFile)).rejects.toThrow(
        "The selected document is unavailable"
      );
      documents.release(id);
      await expect(documents.read(id, owner)).rejects.toThrow(
        "The selected document is unavailable"
      );
    } finally {
      host.events.emit("will-quit");
      await fs.rm(root, { recursive: true, force: true });
    }
  }
);
