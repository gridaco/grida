import fs from "node:fs";
import { describe, expect, it } from "vitest";

// GRIDA-SEC-004 / GRIDA-SEC-008 — renderer bridge source contract pins.
const preloadSource = fs.readFileSync(
  new URL("./preload.ts", import.meta.url),
  "utf8"
);

describe("Desktop preload agent seam", () => {
  it("adapts every native-chat invoke without wrapping the bridge object or synchronous registrations", () => {
    const native = preloadSource.slice(
      preloadSource.indexOf("  nativeChat: {"),
      preloadSource.indexOf("\n  archives: {")
    );
    expect(native).not.toContain("ipcRenderer.invoke(");
    expect(preloadSource).toMatch(
      /const nativeChatInvoke = \(channel: string, \.\.\.args: unknown\[\]\) =>\s*NativeChatInvoke\.invoke\(\s*\(name, \.\.\.input\) => ipcRenderer\.invoke\(name, \.\.\.input\),\s*channel,\s*\.\.\.args/
    );
    expect(native).toMatch(
      /inputReceipt: \(attachmentId, inputId\) =>\s*nativeChatInvoke\(\s*IPC_CHANNELS\.NATIVE_CHAT_INPUT_RECEIPT,\s*attachmentId,\s*inputId/
    );
    expect(native).toMatch(
      /subscribe: async[\s\S]*?nativeChatHandlers\.set\(id, \{ attachmentId, onUpdate \}\);\s*try \{\s*await nativeChatInvoke\(\s*IPC_CHANNELS\.NATIVE_CHAT_SUBSCRIBE/
    );
    expect(native).toMatch(/onEditorSurfaceOpen: \(attachmentId, open\) => \{/);
    expect(native).toMatch(/onEditorSvgText: \(attachmentId, invoke\) => \{/);
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld");
    expect(preloadSource).not.toContain("new Proxy(");
  });
  it("routes child activity and conversation through parent attachment channels", () => {
    expect(preloadSource).toMatch(
      /IPC_CHANNELS\.NATIVE_CHAT_SUBAGENT_ACTIVITY,\s*attachmentId,\s*afterChildId/
    );
    expect(preloadSource).toMatch(
      /IPC_CHANNELS\.NATIVE_CHAT_SUBAGENT_CONVERSATION,\s*attachmentId,\s*childId,\s*before/
    );
  });
  it("keeps queued inspection and queued image reads on their own observation-bound channels", () => {
    expect(preloadSource).toMatch(
      /acceptsQueuedTextReplacement:\s*\(\) =>\s*nativeChatInvoke\(\s*IPC_CHANNELS\.NATIVE_CHAT_ACCEPTS_QUEUED_TEXT_REPLACEMENT\s*\)/
    );
    expect(preloadSource).toMatch(
      /IPC_CHANNELS\.NATIVE_CHAT_QUEUED_MESSAGE,\s*attachmentId,\s*observationId,\s*inputId/
    );
    expect(preloadSource).toMatch(
      /IPC_CHANNELS\.NATIVE_CHAT_READ_QUEUED_ATTACHMENT_PREVIEW,\s*attachmentId,\s*observationId,\s*inputId,\s*previewId/
    );
  });
  it("keeps retained tool pixels on a dedicated token reader", () => {
    expect(preloadSource).toMatch(
      /readToolImage:\s*\(attachmentId, previewId\) =>\s*nativeChatInvoke\(\s*IPC_CHANNELS\.NATIVE_CHAT_READ_TOOL_IMAGE,\s*attachmentId,\s*previewId/
    );
  });
  it("publishes non-minting endpoint consent inspection and metadata operations through Main IPC", () => {
    expect(preloadSource).toMatch(
      /IPC_CHANNELS\.PROVIDER_ENDPOINT_AUTHORIZATION,\s*id,\s*baseUrl/
    );
    expect(preloadSource).toMatch(
      /IPC_CHANNELS\.PROVIDER_ENDPOINT_UPDATE_MODELS,\s*update/
    );
    expect(preloadSource).not.toContain("mediaClient.providers.set_endpoint");
    expect(preloadSource).not.toContain("mediaClient.providers.probe_endpoint");
  });
  it("requests the fixed native Settings action without a destination argument", () => {
    expect(preloadSource).toMatch(
      /open_settings:\s*\(\)\s*=>\s*ipcRenderer\.invoke\(IPC_CHANNELS\.WINDOW_OPEN_SETTINGS\)/
    );
  });
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
    expect(preloadSource).not.toContain("@grida/ai-host/transport");
    expect(preloadSource).not.toContain('"/agent/run"');
    expect(preloadSource).not.toContain('"/secrets/has"');
    expect(preloadSource).not.toContain('"/sessions"');
    expect(preloadSource).not.toContain('"/workspaces/list"');
  });

  it("exposes a versioned Electron-specific bridge protocol", () => {
    expect(preloadSource).toContain("protocol: DESKTOP_BRIDGE_PROTOCOL");
    expect(preloadSource).toContain("native:");
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

  it("preserves effort, SVG and selection slots when forwarding editor context", () => {
    const submission = preloadSource.match(
      /submitInRegime:\s*\(([^)]*)\)\s*=>\s*nativeChatInvoke\(([\s\S]*?)\),/
    );
    expect(submission?.[1]).toMatch(
      /\beffort,\s*editorSvgTargetId,\s*selectionRevision,\s*editorContextId\s*$/
    );
    expect(submission?.[2]).toMatch(
      /editorContextId !== undefined\s*\?\s*\[effort, editorSvgTargetId, selectionRevision, editorContextId\]/
    );
    expect(submission?.[2]).toMatch(
      /selectionRevision !== undefined\s*\?\s*\[effort, editorSvgTargetId, selectionRevision\]/
    );
    expect(submission?.[2]).toMatch(
      /editorSvgTargetId !== undefined\s*\?\s*\[effort, editorSvgTargetId\]\s*:\s*effort === undefined\s*\?\s*\[\]\s*:\s*\[effort\]/
    );
  });

  it("forwards a Library selection revision only when supplied, preserving the effort slot", () => {
    const submission = preloadSource.match(
      /submitWithLibrarySelection:\s*\(([^)]*)\)\s*=>\s*nativeChatInvoke\(([\s\S]*?)\),/
    );
    expect(submission?.[1]).toMatch(
      /effort,\s*selectionRevision,\s*editorContextId\s*$/
    );
    expect(submission?.[2]).toMatch(
      /IPC_CHANNELS\.NATIVE_CHAT_SUBMIT_LIBRARY_SELECTION,\s*attachmentId,\s*inputId,\s*text,\s*operatingRegime,\s*effort,\s*\.\.\.\(editorContextId !== undefined\s*\?\s*\[selectionRevision, editorContextId\]\s*:\s*selectionRevision === undefined\s*\?\s*\[\]\s*:\s*\[selectionRevision\]\)/
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
