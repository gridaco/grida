import fs from "node:fs";
import { describe, expect, it } from "vitest";

// GRIDA-SEC-004 / GRIDA-SEC-008 — renderer bridge source contract pins.
const preloadSource = fs.readFileSync(
  new URL("./preload.ts", import.meta.url),
  "utf8"
);

describe("Desktop preload agent seam", () => {
  it("keeps native selected-file reads and saves separate from the chat offer", () => {
    expect(preloadSource).toContain(
      "files: response.capabilities.files || selectedDocumentRoute()"
    );
    expect(preloadSource).toContain(
      "nativeDocumentChatId === nativeDocumentId"
    );
    expect(preloadSource).toMatch(
      /selectedDocumentChatRoute\(\)\s*\?\s*{ document: true as const }/
    );
    expect(preloadSource).toMatch(
      /nativeDocumentId !== undefined\s*\? ipcRenderer.invoke\(IPC_CHANNELS.DOCUMENT_READ, docId\)/
    );
    expect(preloadSource).toMatch(
      /nativeDocumentId !== undefined\s*\? ipcRenderer.invoke\(IPC_CHANNELS.DOCUMENT_WRITE, docId, content\)/
    );
  });
  it("delegates media-service HTTP routes to the chat-free MediaTransport.Client", () => {
    expect(preloadSource).toContain("new MediaTransport.Client");
    expect(preloadSource).not.toContain("@grida/agent/transport");
    expect(preloadSource).not.toContain('"/agent/run"');
    expect(preloadSource).not.toContain('"/secrets/has"');
    expect(preloadSource).not.toContain('"/sessions"');
    expect(preloadSource).not.toContain('"/workspaces/list"');
  });

  it("exposes a versioned Electron-specific bridge protocol", () => {
    expect(preloadSource).toContain("protocol: DESKTOP_BRIDGE_PROTOCOL");
    expect(preloadSource).toContain("native:");
    expect(preloadSource).not.toContain("scratch_seed_base64");
    expect(preloadSource).not.toContain("agentServer:");
  });

  it("forwards the native ChatGPT connect result without translating errors", () => {
    expect(preloadSource).toMatch(
      /chatgpt:\s*{\s*connect:\s*\(\)\s*=>\s*ipcRenderer\.invoke\(IPC_CHANNELS\.CHATGPT_CONNECT\)\s*[,}]/
    );
  });

  it("delegates media generation through the media transport", () => {
    expect(preloadSource).toContain("rigging: true");
    expect(preloadSource).toContain(
      "check: (req) => mediaClient.rigging.check(req)"
    );
    expect(preloadSource).toContain(
      "generate: (req) => mediaClient.rigging.generate(req)"
    );
    expect(preloadSource).toContain(
      "generate: (req) => mediaClient.threeD.generate(req)"
    );
    expect(preloadSource).toContain(
      "generate: (req) => mediaClient.audio.music.generate(req)"
    );
    expect(preloadSource).toContain(
      "generate: (req) => mediaClient.audio.soundEffects.generate(req)"
    );
    expect(preloadSource).toContain(
      "listVoices: () => mediaClient.audio.textToSpeech.listVoices()"
    );
    expect(preloadSource).toContain(
      "generate: (req) => mediaClient.audio.textToSpeech.generate(req)"
    );
  });

  it("routes durable media only through purpose-scoped native IPC", () => {
    expect(preloadSource).toContain(
      "ipcRenderer.invoke(IPC_CHANNELS.MEDIA_LIST)"
    );
    expect(preloadSource).toContain(
      "ipcRenderer.invoke(IPC_CHANNELS.MEDIA_READ, id)"
    );
    expect(preloadSource).toContain(
      "ipcRenderer.invoke(IPC_CHANNELS.MEDIA_SAVE_COPY, id)"
    );
    expect(preloadSource).toContain(
      "ipcRenderer.invoke(IPC_CHANNELS.MEDIA_REVEAL, id)"
    );
    expect(preloadSource).toContain(
      "ipcRenderer.invoke(IPC_CHANNELS.MEDIA_OPEN_FOLDER)"
    );
    expect(preloadSource).not.toContain("mediaClient.media");
  });

  it("routes the existing recents bridge through Main", () => {
    for (const channel of [
      "RECENT_LIST",
      "RECENT_TOUCH",
      "RECENT_PIN",
      "RECENT_FORGET",
    ]) {
      expect(preloadSource).toMatch(
        new RegExp(`ipcRenderer\\.invoke\\(\\s*IPC_CHANNELS\\.${channel}`)
      );
    }
    expect(preloadSource).not.toContain("mediaClient.recent");
  });

  it("delivers native chat updates only to the matching preload subscription", () => {
    expect(preloadSource).toContain(
      "nativeChatHandlers.get(payload.subscriptionId)"
    );
    expect(preloadSource).toContain(
      "subscriber.attachmentId !== payload.attachmentId"
    );
    expect(preloadSource).toContain("subscriber.onUpdate(payload.update)");
    expect(preloadSource).toContain(
      'window.addEventListener("pagehide", clearNativeChatDelivery)'
    );
  });

  it("preserves the optional effort slot when forwarding an SVG target", () => {
    const submission = preloadSource.match(
      /submitInRegime:\s*\(([^)]*)\)\s*=>\s*ipcRenderer\.invoke\(([\s\S]*?)\),/
    );
    expect(submission?.[1]).toMatch(/\beffort,\s*editorSvgTargetId\s*$/);
    expect(submission?.[2]).toMatch(
      /editorSvgTargetId !== undefined\s*\?\s*\[effort, editorSvgTargetId\]\s*:\s*effort === undefined\s*\?\s*\[\]\s*:\s*\[effort\]/
    );
  });

  it("forwards only the reviewed external run identity and text", () => {
    const external = preloadSource.match(
      /nativeExternalAgent:\s*\{([\s\S]*?)\},/
    );
    expect(external?.[1]).toContain(
      "ipcRenderer.invoke(IPC_CHANNELS.NATIVE_EXTERNAL_STATUS)"
    );
    expect(external?.[1]).toContain(
      "ipcRenderer.invoke(IPC_CHANNELS.NATIVE_EXTERNAL_START, id, text)"
    );
    expect(external?.[1]).toContain(
      "ipcRenderer.invoke(IPC_CHANNELS.NATIVE_EXTERNAL_STOP, id)"
    );
  });
});
