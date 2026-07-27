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

  it("admits every registered bridge channel in main", () => {
    expect(allowedFor("main", "/desktop/settings")).toEqual(allChannels);
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
