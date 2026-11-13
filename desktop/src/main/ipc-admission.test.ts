// GRIDA-SEC-004 / GRIDA-SEC-005 — native role-scoped IPC capability pins.
import { describe, expect, it } from "vitest";
import { IPC_CHANNELS, type IpcChannel } from "../bridge/contract";
import { ipc_admission } from "./ipc-admission";

const allChannels = Object.values(IPC_CHANNELS) as IpcChannel[];
const nativeChat = allChannels.filter((channel) =>
  channel.startsWith("grida:native-chat:")
);
const nativeExternal = allChannels.filter((channel) =>
  channel.startsWith("grida:native-external:")
);
const workspacePublish = IPC_CHANNELS.WORKSPACE_PUBLISH_EDITOR_SURFACES;
const documentFiles = [IPC_CHANNELS.DOCUMENT_READ, IPC_CHANNELS.DOCUMENT_WRITE];

describe("ipc_admission", () => {
  it("gives sign-in only browser launch and read-only title-bar state", () => {
    expect(allowedFor("sign-in", "/desktop/auth/sign-in")).toEqual([
      IPC_CHANNELS.WINDOW_NAVIGATION_STATE,
      IPC_CHANNELS.SHELL_OPEN_EXTERNAL,
    ]);
  });

  it("rejects sign-in capabilities outside the exact sign-in route", () => {
    expect(allowedFor("sign-in", "/desktop/auth/complete")).toEqual([]);
    expect(allowedFor("sign-in", "/desktop/settings")).toEqual([]);
  });

  it("gives onboarding only ChatGPT, workspace setup, and completion", () => {
    expect(allowedFor("onboarding", "/desktop/onboarding")).toEqual([
      IPC_CHANNELS.WINDOW_COMPLETE_ONBOARDING,
      IPC_CHANNELS.ONBOARDING_WORKSPACE_DEFAULT,
      IPC_CHANNELS.ONBOARDING_WORKSPACE_CHOOSE,
      IPC_CHANNELS.CHATGPT_CONNECT,
      IPC_CHANNELS.CHATGPT_CANCEL,
      IPC_CHANNELS.CHATGPT_STATUS,
      IPC_CHANNELS.CHATGPT_SIGN_OUT,
    ]);
  });

  it("never gives onboarding the daemon bearer credential or a generic dialog", () => {
    const allowed = allowedFor("onboarding", "/desktop/onboarding");
    expect(allowed).not.toContain(IPC_CHANNELS.AGENT_SERVER_INFO);
    expect(allowed).not.toContain(IPC_CHANNELS.DIALOG_OPEN);
  });

  it("rejects onboarding capabilities outside the exact onboarding route", () => {
    expect(allowedFor("onboarding", "/desktop/welcome")).toEqual([]);
    expect(allowedFor("onboarding", "/desktop/auth/sign-in")).toEqual([]);
  });

  it("admits the Tools route with its separate native media capabilities", () => {
    expect(allowedFor("main", "/desktop/tools")).toEqual(
      allChannels.filter(
        (channel) =>
          !nativeChat.includes(channel) &&
          !nativeExternal.includes(channel) &&
          channel !== workspacePublish &&
          channel !== IPC_CHANNELS.WELCOME_CHAT_PROFILES &&
          !(documentFiles as readonly IpcChannel[]).includes(channel)
      )
    );
  });

  it("admits document I/O only from the main standalone file route", () => {
    for (const channel of documentFiles) {
      expect(allowedFor("main", "/desktop/file")).toContain(channel);
      for (const route of [
        "/desktop/file/other",
        "/desktop/workspace",
        "/desktop/welcome",
      ]) {
        expect(allowedFor("main", route)).not.toContain(channel);
      }
      expect(allowedFor("onboarding", "/desktop/onboarding")).not.toContain(
        channel
      );
    }
  });

  it("admits exact selected-file SVG chat without project settings or presentation", () => {
    const document = allowedFor("main", "/desktop/file", true);
    expect(document).toEqual(
      expect.arrayContaining([
        IPC_CHANNELS.NATIVE_CHAT_STATUS,
        IPC_CHANNELS.NATIVE_CHAT_SUBMIT,
        IPC_CHANNELS.NATIVE_CHAT_PUBLISH_EDITOR_SURFACES,
        IPC_CHANNELS.NATIVE_CHAT_EDITOR_SVG_TEXT_RESULT,
      ])
    );
    for (const channel of [
      IPC_CHANNELS.NATIVE_CHAT_EDITOR_SURFACE_OPEN,
      IPC_CHANNELS.NATIVE_CHAT_SELECT_PROFILE,
      IPC_CHANNELS.NATIVE_CHAT_CONTEXT_LIMIT,
      IPC_CHANNELS.NATIVE_CHAT_SAVE_CONTEXT_LIMIT,
      IPC_CHANNELS.NATIVE_CHAT_SUBMIT_CONFIGURATION,
      ...nativeExternal,
    ])
      expect(document).not.toContain(channel);
  });

  it("admits native chat on the exact workspace or a producer-checked root deck", () => {
    expect(
      allowedFor("main", "/desktop/workspace").filter((channel) =>
        nativeChat.includes(channel)
      )
    ).toEqual(nativeChat);
    const deck = allowedFor("main", "/desktop/file");
    expect(deck).toContain(IPC_CHANNELS.NATIVE_CHAT_STATUS);
    expect(deck).toContain(IPC_CHANNELS.NATIVE_CHAT_SUBMIT);
    for (const channel of [
      IPC_CHANNELS.NATIVE_CHAT_PUBLISH_EDITOR_SURFACES,
      IPC_CHANNELS.NATIVE_CHAT_EDITOR_SVG_TEXT,
      IPC_CHANNELS.NATIVE_CHAT_EDITOR_SVG_TEXT_RESULT,
    ])
      expect(deck).toContain(channel);
    for (const channel of [
      IPC_CHANNELS.NATIVE_CHAT_EDITOR_SURFACE_OPEN,
      ...nativeExternal,
    ]) {
      expect(deck).not.toContain(channel);
    }
    for (const route of [
      "/desktop",
      "/desktop/settings",
      "/desktop/file/extra",
      "/desktop/workspace/extra",
    ]) {
      expect(
        allowedFor("main", route).some((channel) =>
          nativeChat.includes(channel)
        )
      ).toBe(false);
    }
  });

  it("admits requested Library selection only in the main workspace", () => {
    for (const channel of [
      IPC_CHANNELS.NATIVE_CHAT_ACCEPTS_LIBRARY_SELECTION,
      IPC_CHANNELS.NATIVE_CHAT_SUBMIT_LIBRARY_SELECTION,
      IPC_CHANNELS.NATIVE_CHAT_LIBRARY_SELECTIONS,
      IPC_CHANNELS.NATIVE_CHAT_ANSWER_LIBRARY_SELECTION,
    ]) {
      expect(allowedFor("main", "/desktop/workspace")).toContain(channel);
      expect(allowedFor("main", "/desktop/file")).not.toContain(channel);
      expect(allowedFor("main", "/desktop/workspace/extra")).not.toContain(
        channel
      );
      expect(allowedFor("onboarding", "/desktop/onboarding")).not.toContain(
        channel
      );
    }
  });

  it("admits Welcome connection choices only on the exact Welcome route", () => {
    const channel = IPC_CHANNELS.WELCOME_CHAT_PROFILES;
    expect(allowedFor("main", "/desktop/welcome")).toContain(channel);
    for (const route of [
      "/desktop/welcome/extra",
      "/desktop/workspace",
      "/desktop/file",
      "/desktop/tools",
      "/desktop/settings",
    ])
      expect(allowedFor("main", route)).not.toContain(channel);
    expect(allowedFor("onboarding", "/desktop/onboarding")).not.toContain(
      channel
    );
    expect(allowedFor("sign-in", "/desktop/auth/sign-in")).not.toContain(
      channel
    );
    expect(
      allowedFor("main", "/desktop/welcome").filter((allowed) =>
        nativeChat.includes(allowed)
      )
    ).toEqual([]);
  });

  it("admits notification focus consumption only in the main workspace", () => {
    const channel = IPC_CHANNELS.NATIVE_CHAT_TAKE_NOTIFICATION_FOCUS;
    expect(allowedFor("main", "/desktop/workspace")).toContain(channel);
    expect(allowedFor("main", "/desktop/file")).not.toContain(channel);
    expect(allowedFor("main", "/desktop/settings")).not.toContain(channel);
    expect(allowedFor("onboarding", "/desktop/onboarding")).not.toContain(
      channel
    );
    expect(allowedFor("sign-in", "/desktop/auth/sign-in")).not.toContain(
      channel
    );
  });

  it("admits nested deck text edits within the file chat scope", () => {
    const deck = allChannels.filter((channel) =>
      ipc_admission.allows({
        role: "main",
        pathname: "/desktop/file",
        channel,
        nestedDeck: true,
      })
    );
    expect(deck).toEqual(
      expect.arrayContaining([
        IPC_CHANNELS.NATIVE_CHAT_STATUS,
        IPC_CHANNELS.NATIVE_CHAT_LIST,
        IPC_CHANNELS.NATIVE_CHAT_SUBMIT,
        IPC_CHANNELS.NATIVE_CHAT_PUBLISH_EDITOR_SURFACES,
        IPC_CHANNELS.NATIVE_CHAT_EDITOR_SVG_TEXT_RESULT,
      ])
    );
    for (const channel of [
      IPC_CHANNELS.NATIVE_CHAT_SELECT_PROFILE,
      IPC_CHANNELS.NATIVE_CHAT_CONTEXT_LIMIT,
      IPC_CHANNELS.NATIVE_CHAT_SAVE_CONTEXT_LIMIT,
      IPC_CHANNELS.NATIVE_CHAT_SUBMIT_CONFIGURATION,
      IPC_CHANNELS.NATIVE_CHAT_EDITOR_SURFACE_OPEN,
      ...nativeExternal,
    ])
      expect(deck).not.toContain(channel);
  });

  it("admits external agents only on the exact main workspace route", () => {
    expect(nativeExternal).toEqual([
      IPC_CHANNELS.NATIVE_EXTERNAL_STATUS,
      IPC_CHANNELS.NATIVE_EXTERNAL_START,
      IPC_CHANNELS.NATIVE_EXTERNAL_STOP,
    ]);
    for (const channel of nativeExternal) {
      expect(allowedFor("main", "/desktop/workspace")).toContain(channel);
      expect(allowedFor("main", "/desktop/workspace/extra")).not.toContain(
        channel
      );
      expect(allowedFor("main", "/desktop/settings")).not.toContain(channel);
      expect(allowedFor("onboarding", "/desktop/onboarding")).not.toContain(
        channel
      );
    }
  });

  it("admits independent workbench publication only from the main workspace route", () => {
    expect(allowedFor("main", "/desktop/workspace")).toContain(
      workspacePublish
    );
    for (const route of [
      "/desktop/file",
      "/desktop/settings",
      "/desktop/workspace/extra",
    ]) {
      expect(allowedFor("main", route)).not.toContain(workspacePublish);
    }
    expect(allowedFor("onboarding", "/desktop/onboarding")).not.toContain(
      workspacePublish
    );
  });

  it("keeps durable media capabilities exclusive to the exact Tools route", () => {
    const mediaChannels = [
      IPC_CHANNELS.MEDIA_LIST,
      IPC_CHANNELS.MEDIA_READ,
      IPC_CHANNELS.MEDIA_SAVE_COPY,
      IPC_CHANNELS.MEDIA_REVEAL,
      IPC_CHANNELS.MEDIA_OPEN_FOLDER,
    ];
    for (const pathname of [
      "/desktop/settings",
      "/desktop/welcome",
      "/desktop/tools/history",
      "/desktop/onboarding",
      "/desktop/auth/sign-in",
    ]) {
      const allowed = allowedFor("main", pathname);
      for (const channel of mediaChannels) {
        expect(allowed).not.toContain(channel);
      }
    }
  });

  it("rejects auth-control and onboarding paths even before main observes navigation", () => {
    expect(allowedFor("main", "/desktop/auth/sign-in")).toEqual([]);
    expect(allowedFor("main", "/desktop/auth/complete")).toEqual([]);
    expect(allowedFor("main", "/desktop/auth/future")).toEqual([]);
    expect(allowedFor("main", "/desktop/onboarding")).toEqual([]);
  });

  it("keeps recent file metadata within the authenticated main role", () => {
    const recent = [
      IPC_CHANNELS.RECENT_LIST,
      IPC_CHANNELS.RECENT_TOUCH,
      IPC_CHANNELS.RECENT_PIN,
      IPC_CHANNELS.RECENT_FORGET,
    ];
    for (const channel of recent) {
      expect(allowedFor("main", "/desktop/welcome")).toContain(channel);
      expect(allowedFor("sign-in", "/desktop/auth/sign-in")).not.toContain(
        channel
      );
      expect(allowedFor("onboarding", "/desktop/onboarding")).not.toContain(
        channel
      );
    }
  });
});

function allowedFor(
  role: Parameters<typeof ipc_admission.allows>[0]["role"],
  pathname: string,
  selectedDocument = false
): IpcChannel[] {
  return allChannels.filter((channel) =>
    ipc_admission.allows({ role, channel, pathname, selectedDocument })
  );
}
