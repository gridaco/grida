// GRIDA-SEC-004 / GRIDA-SEC-005 — native role-scoped IPC capability pins.
import { describe, expect, it } from "vitest";
import { IPC_CHANNELS, type IpcChannel } from "../bridge/contract";
import { ipc_admission } from "./ipc-admission";

const allChannels = Object.values(IPC_CHANNELS) as IpcChannel[];

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

  it("admits every registered bridge channel on the exact Tools route", () => {
    expect(allowedFor("main", "/desktop/tools")).toEqual(allChannels);
  });

  it("keeps durable media capabilities exclusive to the exact Tools route", () => {
    const mediaChannels = [
      IPC_CHANNELS.MEDIA_LIST,
      IPC_CHANNELS.MEDIA_READ,
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
});

function allowedFor(
  role: Parameters<typeof ipc_admission.allows>[0]["role"],
  pathname: string
): IpcChannel[] {
  return allChannels.filter((channel) =>
    ipc_admission.allows({ role, channel, pathname })
  );
}
