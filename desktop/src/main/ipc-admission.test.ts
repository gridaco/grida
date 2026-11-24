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
const workbenchPublication: readonly IpcChannel[] = [
  IPC_CHANNELS.WORKSPACE_PUBLISH_EDITOR_SURFACES,
  IPC_CHANNELS.WORKSPACE_PUBLISH_AUTOMATION_SURFACES,
  IPC_CHANNELS.WORKSPACE_RETIRE_VIEW,
];
const documentFiles = [IPC_CHANNELS.DOCUMENT_READ, IPC_CHANNELS.DOCUMENT_WRITE];

describe("ipc_admission", () => {
  it("admits opening native Settings only in the authenticated main role", () => {
    const channel = IPC_CHANNELS.WINDOW_OPEN_SETTINGS;
    for (const pathname of [
      "/desktop/welcome",
      "/desktop/workspace",
      "/desktop/file",
      "/desktop/settings",
    ]) {
      expect(allowedFor("main", pathname)).toContain(channel);
    }
    expect(allowedFor("onboarding", "/desktop/onboarding")).not.toContain(
      channel
    );
    expect(allowedFor("sign-in", "/desktop/auth/sign-in")).not.toContain(
      channel
    );
  });
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
          !channel.startsWith("grida:browser:") &&
          !channel.startsWith("grida:provider:endpoint:") &&
          !channel.startsWith("grida:hooks:") &&
          !channel.startsWith("grida:composer-predictions:") &&
          !channel.startsWith("grida:personalization:") &&
          !channel.startsWith("grida:voice:") &&
          !channel.startsWith("grida:archives:") &&
          !channel.startsWith("grida:chat-catalog:") &&
          !nativeChat.includes(channel) &&
          !nativeExternal.includes(channel) &&
          !workbenchPublication.includes(channel) &&
          !channel.startsWith("grida:welcome:chat-") &&
          !(documentFiles as readonly IpcChannel[]).includes(channel)
      )
    );
  });

  it("separates Voice settings from composer recording", () => {
    const voice = (pathname: string) =>
      allowedFor("main", pathname).filter((channel) =>
        channel.startsWith("grida:voice:")
      );
    const read = [
      IPC_CHANNELS.VOICE_SETTINGS_GET,
      IPC_CHANNELS.VOICE_SETTINGS_CHANGED,
    ];
    expect(voice("/desktop/settings")).toEqual([
      IPC_CHANNELS.VOICE_SETTINGS_GET,
      IPC_CHANNELS.VOICE_SETTINGS_UPDATE,
      IPC_CHANNELS.VOICE_SETTINGS_CHANGED,
      IPC_CHANNELS.VOICE_KEY_SAVE,
      IPC_CHANNELS.VOICE_KEY_REMOVE,
    ]);
    for (const route of [
      "/desktop/welcome",
      "/desktop/workspace",
      "/desktop/file",
    ]) {
      expect(voice(route)).toEqual([
        ...read,
        IPC_CHANNELS.VOICE_TRANSCRIBE,
        IPC_CHANNELS.VOICE_CANCEL,
      ]);
    }
    expect(voice("/desktop/tools")).toEqual([]);
  });

  it("admits browser control only from the main workspace shell", () => {
    const browser = allChannels.filter(
      (channel) =>
        channel.startsWith("grida:browser:") &&
        channel !== IPC_CHANNELS.BROWSER_CLEAR_BROWSING_DATA &&
        channel !== IPC_CHANNELS.BROWSER_HISTORY_QUERY &&
        channel !== IPC_CHANNELS.BROWSER_HISTORY_REMOVE &&
        channel !== IPC_CHANNELS.BROWSER_CLEAR_HISTORY &&
        channel !== IPC_CHANNELS.BROWSER_CLEAR_CACHE &&
        channel !== IPC_CHANNELS.BROWSER_RESET_PERMISSIONS &&
        channel !== IPC_CHANNELS.BROWSER_DOWNLOAD_PREFERENCES &&
        channel !== IPC_CHANNELS.BROWSER_SET_DOWNLOAD_PROMPT &&
        channel !== IPC_CHANNELS.BROWSER_CHOOSE_DOWNLOAD_DIRECTORY &&
        channel !== IPC_CHANNELS.BROWSER_OPEN_PAGE
    );
    expect(browser.length).toBeGreaterThan(0);
    for (const channel of browser) {
      expect(allowedFor("main", "/desktop/workspace")).toContain(channel);
      for (const route of [
        "/desktop/settings",
        "/desktop/welcome",
        "/desktop/tools",
        "/desktop/file",
        "/desktop/auth/sign-in",
      ]) {
        expect(allowedFor("main", route)).not.toContain(channel);
      }
      expect(allowedFor("sign-in", "/desktop/auth/sign-in")).not.toContain(
        channel
      );
      expect(allowedFor("onboarding", "/desktop/onboarding")).not.toContain(
        channel
      );
    }
  });

  it("admits global browser clearing only from Main workspace or Settings", () => {
    const channel = IPC_CHANNELS.BROWSER_CLEAR_BROWSING_DATA;
    expect(allowedFor("main", "/desktop/settings")).toContain(channel);
    expect(allowedFor("main", "/desktop/workspace")).toContain(channel);
    for (const pathname of [
      "/desktop/welcome",
      "/desktop/file",
      "/desktop/tools",
      "/desktop/settings/other",
    ])
      expect(allowedFor("main", pathname)).not.toContain(channel);
    expect(allowedFor("sign-in", "/desktop/auth/sign-in")).not.toContain(
      channel
    );
    expect(allowedFor("onboarding", "/desktop/onboarding")).not.toContain(
      channel
    );
  });

  it("allows FX preview and file operations only in the main workbench", () => {
    for (const channel of [
      IPC_CHANNELS.BROWSER_PREPARE_FX_FILE,
      IPC_CHANNELS.BROWSER_RESOLVE_FX_PREVIEW,
    ]) {
      expect(allowedFor("main", "/desktop/workspace")).toContain(channel);
      for (const route of [
        "/desktop/file",
        "/desktop/settings",
        "/desktop/tools",
        "/desktop/welcome",
      ])
        expect(allowedFor("main", route)).not.toContain(channel);
      expect(allowedFor("sign-in", "/desktop/auth/sign-in")).not.toContain(
        channel
      );
      expect(allowedFor("onboarding", "/desktop/onboarding")).not.toContain(
        channel
      );
    }
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

  it("keeps archived-chat metadata and restoration in Settings", () => {
    for (const channel of [
      IPC_CHANNELS.ARCHIVES_LIST,
      IPC_CHANNELS.ARCHIVES_UNARCHIVE,
      IPC_CHANNELS.ARCHIVES_OPEN_RESTORED,
    ]) {
      expect(allowedFor("main", "/desktop/settings")).toContain(channel);
      for (const route of [
        "/desktop/workspace",
        "/desktop/tools",
        "/desktop/welcome",
        "/desktop/file",
      ]) {
        expect(allowedFor("main", route)).not.toContain(channel);
      }
    }
  });

  it("keeps workspace archive undo in the workbench", () => {
    const channel = IPC_CHANNELS.NATIVE_CHAT_UNDO_ARCHIVE;
    expect(allowedFor("main", "/desktop/workspace")).toContain(channel);
    for (const route of [
      "/desktop/settings",
      "/desktop/file",
      "/desktop/welcome",
    ])
      expect(allowedFor("main", route)).not.toContain(channel);
  });

  it("admits subscription feature discovery only for ordinary workspace chat", () => {
    const channel = IPC_CHANNELS.NATIVE_CHAT_TURN_CAPABILITIES;
    expect(allowedFor("main", "/desktop/workspace")).toContain(channel);
    for (const route of [
      "/desktop/welcome",
      "/desktop/settings",
      "/desktop/file",
    ])
      expect(allowedFor("main", route)).not.toContain(channel);
    expect(allowedFor("onboarding", "/desktop/onboarding")).not.toContain(
      channel
    );
  });

  it("admits exact selected-file SVG chat without project settings or presentation", () => {
    const document = allowedFor("main", "/desktop/file", true);
    expect(document).toEqual(
      expect.arrayContaining([
        IPC_CHANNELS.NATIVE_CHAT_STATUS,
        IPC_CHANNELS.NATIVE_CHAT_SUBMIT,
        IPC_CHANNELS.NATIVE_CHAT_PUBLISH_EDITOR_SURFACES,
        IPC_CHANNELS.NATIVE_CHAT_EDITOR_SVG_TEXT_RESULT,
        IPC_CHANNELS.NATIVE_CHAT_EDITOR_SVG_SELECTION_RESULT,
      ])
    );
    for (const channel of [
      IPC_CHANNELS.NATIVE_CHAT_EDITOR_SURFACE_OPEN,
      IPC_CHANNELS.NATIVE_CHAT_SELECT_PROFILE,
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
    expect(deck).not.toContain(IPC_CHANNELS.NATIVE_CHAT_START_WORKSPACE);
    expect(deck).toContain(IPC_CHANNELS.NATIVE_CHAT_SUBMIT);
    for (const channel of [
      IPC_CHANNELS.NATIVE_CHAT_PUBLISH_EDITOR_SURFACES,
      IPC_CHANNELS.NATIVE_CHAT_EDITOR_SVG_TEXT,
      IPC_CHANNELS.NATIVE_CHAT_EDITOR_SVG_TEXT_RESULT,
      IPC_CHANNELS.NATIVE_CHAT_EDITOR_SVG_SELECTION,
      IPC_CHANNELS.NATIVE_CHAT_EDITOR_SVG_SELECTION_RESULT,
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

  it.each([
    IPC_CHANNELS.WELCOME_CHAT_PROFILES,
    IPC_CHANNELS.WELCOME_CHAT_TURN_CAPABILITIES,
    IPC_CHANNELS.WELCOME_CHAT_PREPARE_FULL_ACCESS,
    IPC_CHANNELS.WELCOME_CHAT_PREPARE_AUTOMATIC_REVIEW,
    IPC_CHANNELS.WELCOME_CHAT_ANSWER_FULL_ACCESS,
    IPC_CHANNELS.WELCOME_CHAT_START_FULL_ACCESS,
  ])("admits %s only on the exact Welcome route", (channel) => {
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
    ).toEqual([IPC_CHANNELS.NATIVE_CHAT_ACCEPTS_AUTOMATIC_REVIEW]);
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

  it("admits saved chat discovery only in Home and the main workbench", () => {
    const list = IPC_CHANNELS.CHAT_CATALOG_LIST;
    expect(allowedFor("main", "/desktop/welcome")).toContain(list);
    expect(allowedFor("main", "/desktop/workspace")).toContain(list);
    for (const path of [
      "/desktop/file",
      "/desktop/tools",
      "/desktop/settings",
      "/desktop/workspace/extra",
    ])
      expect(allowedFor("main", path)).not.toContain(list);
    expect(allowedFor("sign-in", "/desktop/auth/sign-in")).not.toContain(list);
    expect(allowedFor("onboarding", "/desktop/onboarding")).not.toContain(list);
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
        IPC_CHANNELS.NATIVE_CHAT_EDITOR_SVG_SELECTION_RESULT,
      ])
    );
    for (const channel of [
      IPC_CHANNELS.NATIVE_CHAT_SELECT_PROFILE,
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
    for (const channel of workbenchPublication) {
      expect(allowedFor("main", "/desktop/workspace")).toContain(channel);
      for (const route of [
        "/desktop/file",
        "/desktop/settings",
        "/desktop/workspace/extra",
      ]) {
        expect(allowedFor("main", route)).not.toContain(channel);
      }
      expect(allowedFor("onboarding", "/desktop/onboarding")).not.toContain(
        channel
      );
    }
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

it("admits history metadata operations only from current Main workspace and Settings routes", () => {
  for (const channel of [
    IPC_CHANNELS.BROWSER_HISTORY_QUERY,
    IPC_CHANNELS.BROWSER_HISTORY_REMOVE,
  ]) {
    expect(allowedFor("main", "/desktop/workspace")).toContain(channel);
    expect(allowedFor("main", "/desktop/settings")).toContain(channel);
    for (const pathname of [
      "/desktop/tools",
      "/desktop/welcome",
      "/desktop/file",
      "/desktop/settings/other",
    ])
      expect(allowedFor("main", pathname)).not.toContain(channel);
    expect(allowedFor("sign-in", "/desktop/auth/sign-in")).not.toContain(
      channel
    );
  }
});
