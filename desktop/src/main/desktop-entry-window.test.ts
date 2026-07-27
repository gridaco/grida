// GRIDA-SEC-004 / GRIDA-SEC-005 — canonical entry-window authority pins.
import { beforeEach, describe, expect, it, vi } from "vitest";

const windowFactory = vi.fn<(...args: unknown[]) => unknown>();
const applyPresentation = vi.fn<(...args: unknown[]) => unknown>();
vi.mock("../window", () => ({
  create_desktop_window: (...args: unknown[]) => windowFactory(...args),
  set_desktop_window_presentation: (...args: unknown[]) =>
    applyPresentation(...args),
}));

import {
  DesktopEntryWindow,
  type DesktopEntryRole,
} from "./desktop-entry-window";
import type { DesktopAccountState } from "./account-session";

beforeEach(() => {
  windowFactory.mockReset();
  applyPresentation.mockReset();
});

describe("DesktopEntryWindow.roleFor", () => {
  it.each([
    ["unavailable", false, null],
    ["unavailable", true, null],
    ["signed-out", false, "sign-in"],
    ["signed-out", true, "sign-in"],
    ["signed-in", false, "onboarding"],
    ["signed-in", true, "main"],
  ] as const)(
    "derives account=%s onboarding=%s as %s",
    (account, onboarding, expected) => {
      expect(DesktopEntryWindow.roleFor(account, onboarding)).toBe(expected);
    }
  );
});

describe("DesktopEntryWindow.authControlPathForUrl", () => {
  it.each([
    [
      "https://grida.test/desktop/auth/sign-in?next=%2Fdesktop%2Fwelcome",
      "sign-in",
    ],
    ["https://grida.test/desktop/auth/complete", "complete"],
  ] as const)("recognizes contained auth control %s", (url, expected) => {
    expect(
      DesktopEntryWindow.authControlPathForUrl(url, "https://grida.test")
    ).toBe(expected);
  });

  it.each([
    "not a url",
    "https://evil.test/desktop/auth/sign-in",
    "https://grida.test/desktop/auth/callback",
  ])("rejects non-control URL %s", (url) => {
    expect(
      DesktopEntryWindow.authControlPathForUrl(url, "https://grida.test")
    ).toBeNull();
  });
});

describe("DesktopEntryWindow lifecycle", () => {
  it("shows signed-out startup as one compact sign-in window", async () => {
    const window = makeWindow();
    const account = makeAccount(["signed-out"]);
    windowFactory.mockReturnValue(window);
    const entry = makeController(account, { onboarding_complete: true });

    await entry.open();

    expect(windowFactory).toHaveBeenCalledTimes(1);
    expect(windowFactory).toHaveBeenCalledWith(
      expect.objectContaining({ show: false, urlPath: null })
    );
    expect(applyPresentation).toHaveBeenCalledWith(
      window,
      "compact",
      undefined
    );
    expect(window.loadURL).toHaveBeenCalledWith(
      "https://grida.test/desktop/auth/sign-in"
    );
    expect(window.webContents.navigationHistory.clear).toHaveBeenCalled();
    expect(entry.role).toBe("sign-in");
    expect(entry.ipcRoleFor(window as never)).toBe("sign-in");
  });

  it("shows sign-in without waiting for authenticated backend readiness", async () => {
    const window = makeWindow();
    const backend = deferred<void>();
    windowFactory.mockReturnValue(window);
    const entry = makeController(makeAccount(["signed-out"]), {
      onboarding_complete: true,
      before_authenticated_entry: () => backend.promise,
    });

    await entry.open();

    expect(entry.role).toBe("sign-in");
    expect(window.loadURL).toHaveBeenCalledOnce();
  });

  it("does not present onboarding/main until the authenticated backend is ready", async () => {
    const window = makeWindow();
    const backend = deferred<void>();
    windowFactory.mockReturnValue(window);
    const entry = makeController(makeAccount(["signed-in"]), {
      onboarding_complete: true,
      before_authenticated_entry: () => backend.promise,
    });

    const opening = entry.open();
    await Promise.resolve();
    expect(window.loadURL).not.toHaveBeenCalled();
    expect(entry.role).toBe("booting");

    backend.resolve();
    await opening;

    expect(entry.role).toBe("main");
  });

  it("keeps BrowserWindow identity through sign-in, onboarding, and main", async () => {
    const window = makeWindow();
    const account = makeAccount(["signed-out", "signed-in", "signed-in"]);
    const markComplete = vi.fn<() => Promise<void>>(async () => undefined);
    windowFactory.mockReturnValue(window);
    const entry = makeController(account, {
      onboarding_complete: false,
      mark_onboarding_complete: markComplete,
    });

    await entry.open();
    await entry.handleAuthCallback(
      "https://grida.test/desktop/auth/callback?code=one"
    );
    expect(entry.role).toBe("onboarding");
    expect(entry.ipcRoleFor(window as never)).toBe("onboarding");
    expect(window.loadURL).toHaveBeenLastCalledWith(
      "https://grida.test/desktop/onboarding"
    );

    await entry.completeOnboarding(window as never, "workspace-1");

    expect(markComplete).toHaveBeenCalledOnce();
    expect(entry.role).toBe("main");
    expect(window.loadURL).toHaveBeenLastCalledWith(
      "https://grida.test/desktop/welcome?onboardingWorkspace=workspace-1"
    );
    expect(windowFactory).toHaveBeenCalledTimes(1);
  });

  it("does not complete onboarding after the Grida session expires", async () => {
    const window = makeWindow();
    const account = makeAccount(["signed-in", "signed-out"]);
    const markComplete = vi.fn<() => Promise<void>>(async () => undefined);
    windowFactory.mockReturnValue(window);
    const entry = makeController(account, {
      onboarding_complete: false,
      mark_onboarding_complete: markComplete,
    });
    await entry.open();

    await entry.completeOnboarding(window as never);

    expect(markComplete).not.toHaveBeenCalled();
    expect(entry.role).toBe("sign-in");
    expect(window.loadURL).toHaveBeenLastCalledWith(
      "https://grida.test/desktop/auth/sign-in"
    );
  });

  it("keeps onboarding intact when its account recheck is unavailable", async () => {
    const window = makeWindow();
    const account = makeAccount(["signed-in", "unavailable"]);
    const markComplete = vi.fn<() => Promise<void>>(async () => undefined);
    windowFactory.mockReturnValue(window);
    const entry = makeController(account, {
      onboarding_complete: false,
      mark_onboarding_complete: markComplete,
    });
    await entry.open();

    await expect(entry.completeOnboarding(window as never)).rejects.toThrow(
      "account session is unavailable"
    );

    expect(markComplete).not.toHaveBeenCalled();
    expect(entry.role).toBe("onboarding");
  });

  it("recovers an onboarding-to-main load after completion is persisted", async () => {
    const window = makeWindow();
    const account = makeAccount(["signed-in", "signed-in", "signed-in"]);
    const markComplete = vi.fn<() => Promise<void>>(async () => undefined);
    windowFactory.mockReturnValue(window);
    const entry = makeController(account, {
      onboarding_complete: false,
      mark_onboarding_complete: markComplete,
    });
    await entry.open();
    window.loadURL.mockRejectedValueOnce(new Error("renderer unavailable"));

    await expect(entry.completeOnboarding(window as never)).rejects.toThrow(
      "renderer unavailable"
    );
    expect(entry.isMain).toBe(false);
    expect(applyPresentation).toHaveBeenLastCalledWith(
      window,
      "compact",
      undefined
    );
    expect(window.show).toHaveBeenCalledTimes(2);
    expect(window.focus).toHaveBeenCalledTimes(2);

    await entry.reconcile({ focus: true });

    expect(markComplete).toHaveBeenCalledOnce();
    expect(entry.role).toBe("main");
    expect(entry.isMain).toBe(true);
  });

  it("routes auth callbacks immediately without a sidecar or work gate", async () => {
    const window = makeWindow();
    const account = makeAccount(["signed-out", "signed-in"]);
    windowFactory.mockReturnValue(window);
    const entry = makeController(account, { onboarding_complete: true });
    await entry.open();

    await entry.handleAuthCallback(
      "https://grida.test/desktop/auth/callback?code=one"
    );

    expect(entry.role).toBe("main");
    expect(window.loadURL.mock.calls.map(([url]) => url)).toEqual([
      "https://grida.test/desktop/auth/sign-in",
      "https://grida.test/desktop/auth/callback?code=one",
      "https://grida.test/desktop/welcome",
    ]);
  });

  it("drops startup restoration once sign-in has been presented", async () => {
    const window = makeWindow();
    const account = makeAccount(["signed-out", "signed-in"]);
    windowFactory.mockReturnValue(window);
    const entry = makeController(account, {
      onboarding_complete: true,
      startup_main_path: "/desktop/welcome?startup=restore-last-workspace",
    });

    await entry.open();
    await entry.handleAuthCallback(
      "https://grida.test/desktop/auth/callback?code=one"
    );

    expect(window.loadURL).toHaveBeenLastCalledWith(
      "https://grida.test/desktop/welcome"
    );
  });

  it("ignores a world-invokable account callback while main is active", async () => {
    const window = makeWindow();
    const account = makeAccount(["signed-in"]);
    windowFactory.mockReturnValue(window);
    const entry = makeController(account, { onboarding_complete: true });
    await entry.open();

    await entry.handleAuthCallback(
      "https://grida.test/desktop/auth/callback?code=untrusted"
    );

    expect(window.loadURL).toHaveBeenCalledTimes(1);
    expect(window.loadURL).not.toHaveBeenCalledWith(
      expect.stringContaining("untrusted")
    );
    expect(entry.role).toBe("main");
  });

  it("does not retain a callback code when callback navigation fails", async () => {
    const window = makeWindow();
    const account = makeAccount(["signed-out"]);
    windowFactory.mockReturnValue(window);
    const entry = makeController(account, { onboarding_complete: true });
    await entry.open();
    window.loadURL.mockRejectedValueOnce(
      new Error(
        "ERR_FAILED https://grida.test/desktop/auth/callback?code=secret-code"
      )
    );

    const result = entry.handleAuthCallback(
      "https://grida.test/desktop/auth/callback?code=secret-code"
    );
    await expect(result).rejects.toThrow(
      "contained Grida account callback could not be loaded"
    );
    const error = await result.catch((value) => value);

    expect(JSON.stringify(error)).not.toContain("secret-code");
    expect(String(error)).not.toContain("secret-code");
    expect(entry.role).toBe("sign-in");
    expect(entry.isMain).toBe(false);
    expect(applyPresentation).toHaveBeenLastCalledWith(
      window,
      "compact",
      undefined
    );
    expect(window.show).toHaveBeenCalledTimes(2);
    expect(window.focus).toHaveBeenCalledTimes(2);
  });

  it("restores sign-in when the post-callback account probe is unavailable", async () => {
    const window = makeWindow();
    const account = makeAccount(["signed-out", "unavailable"]);
    windowFactory.mockReturnValue(window);
    const entry = makeController(account, { onboarding_complete: true });
    await entry.open();

    await expect(
      entry.handleAuthCallback(
        "https://grida.test/desktop/auth/callback?code=one"
      )
    ).rejects.toThrow("account session is unavailable");

    expect(entry.role).toBe("sign-in");
    expect(entry.isMain).toBe(false);
    expect(applyPresentation).toHaveBeenLastCalledWith(
      window,
      "compact",
      undefined
    );
    expect(window.show).toHaveBeenCalledTimes(2);
    expect(window.focus).toHaveBeenCalledTimes(2);
  });

  it("handles a cold-start callback before showing an ordinary role", async () => {
    const window = makeWindow();
    const account = makeAccount(["signed-in"]);
    windowFactory.mockReturnValue(window);
    const entry = makeController(account, { onboarding_complete: true });

    await entry.handleAuthCallback(
      "https://grida.test/desktop/auth/callback?code=one"
    );

    expect(windowFactory).toHaveBeenCalledTimes(1);
    expect(window.loadURL.mock.calls.map(([url]) => url)).toEqual([
      "https://grida.test/desktop/auth/callback?code=one",
      "https://grida.test/desktop/welcome",
    ]);
    expect(window.show).toHaveBeenCalledTimes(1);
    expect(entry.role).toBe("main");
  });

  it("never treats an unavailable account probe as signed-out", async () => {
    const window = makeWindow();
    windowFactory.mockReturnValue(window);
    const entry = makeController(makeAccount(["unavailable"]), {
      onboarding_complete: true,
    });

    await expect(entry.open()).rejects.toThrow(
      "the Grida account session is unavailable"
    );
    expect(entry.role).toBe("booting");
    expect(window.loadURL).not.toHaveBeenCalled();
    expect(applyPresentation).not.toHaveBeenCalled();
  });

  it("keeps auth navigation pending until a probe restores canonical main", async () => {
    const window = makeWindow();
    const account = makeAccount(["signed-in", "unavailable", "signed-in"]);
    windowFactory.mockReturnValue(window);
    const entry = makeController(account, { onboarding_complete: true });
    await entry.open();
    await window.loadURL("https://grida.test/desktop/auth/sign-in");

    await expect(
      entry.reconcileAuthControlNavigation(window as never, "sign-in")
    ).rejects.toThrow("account session is unavailable");
    expect(entry.role).toBe("main");
    expect(entry.isMain).toBe(false);

    entry.focus();
    expect(window.show).toHaveBeenCalledTimes(2);
    await entry.reconcile();

    expect(window.loadURL).toHaveBeenLastCalledWith(
      "https://grida.test/desktop/welcome"
    );
    expect(entry.role).toBe("main");
    expect(entry.isMain).toBe(true);
  });

  it("restores canonical main after its entry window reaches sign-in", async () => {
    const window = makeWindow();
    const account = makeAccount(["signed-in", "signed-in"]);
    windowFactory.mockReturnValue(window);
    const entry = makeController(account, { onboarding_complete: true });
    await entry.open();
    await window.loadURL("https://grida.test/desktop/auth/sign-in");

    const reconciliation = entry.reconcileAuthControlNavigation(
      window as never,
      "sign-in"
    );
    expect(entry.isMain).toBe(false);
    await reconciliation;

    expect(window.loadURL).toHaveBeenLastCalledWith(
      "https://grida.test/desktop/welcome"
    );
    expect(entry.role).toBe("main");
    expect(entry.isMain).toBe(true);
  });

  it("restores canonical sign-in after its entry window reaches auth complete", async () => {
    const window = makeWindow();
    const account = makeAccount(["signed-out", "signed-out"]);
    windowFactory.mockReturnValue(window);
    const entry = makeController(account, { onboarding_complete: true });
    await entry.open();
    await window.loadURL("https://grida.test/desktop/auth/complete");

    await entry.reconcileAuthControlNavigation(window as never, "complete");

    expect(window.loadURL).toHaveBeenLastCalledWith(
      "https://grida.test/desktop/auth/sign-in"
    );
    expect(entry.role).toBe("sign-in");
    expect(entry.isMain).toBe(false);
  });

  it("destroys an auxiliary auth surface without resetting signed-in main", async () => {
    const window = makeWindow();
    const auxiliary = makeWindow();
    const account = makeAccount(["signed-in", "signed-in"]);
    windowFactory.mockReturnValue(window);
    const entry = makeController(account, { onboarding_complete: true });
    await entry.open();
    expect(entry.registerSecondary(auxiliary as never)).toBe(true);
    window.loadURL.mockClear();

    await entry.reconcileAuthControlNavigation(auxiliary as never, "sign-in");

    expect(auxiliary.destroy).toHaveBeenCalledOnce();
    expect(window.loadURL).not.toHaveBeenCalled();
    expect(entry.role).toBe("main");
    expect(entry.isMain).toBe(true);
  });

  it("moves the entry to sign-in when an auxiliary auth signal confirms sign-out", async () => {
    const window = makeWindow();
    const auxiliary = makeWindow();
    const account = makeAccount(["signed-in", "signed-out"]);
    windowFactory.mockReturnValue(window);
    const entry = makeController(account, { onboarding_complete: true });
    await entry.open();
    expect(entry.registerSecondary(auxiliary as never)).toBe(true);

    await entry.reconcileAuthControlNavigation(auxiliary as never, "complete");

    expect(auxiliary.destroy).toHaveBeenCalledOnce();
    expect(window.loadURL).toHaveBeenLastCalledWith(
      "https://grida.test/desktop/auth/sign-in"
    );
    expect(entry.role).toBe("sign-in");
    expect(entry.isMain).toBe(false);
  });

  it("does not publish main work before newer auth navigation reconciles", async () => {
    const window = makeWindow();
    const account = makeAccount(["signed-in", "signed-in", "signed-out"]);
    const onRoleChange =
      vi.fn<(role: DesktopEntryRole, previous: DesktopEntryRole) => void>();
    windowFactory.mockReturnValue(window);
    const entry = makeController(account, {
      onboarding_complete: false,
      on_role_change: onRoleChange,
    });
    await entry.open();
    onRoleChange.mockClear();

    let authReconciliation: Promise<void> | undefined;
    window.loadURL.mockImplementationOnce(async () => {
      authReconciliation = entry.reconcileAuthControlNavigation(
        window as never,
        "sign-in"
      );
    });

    await entry.completeOnboarding(window as never);
    expect(entry.isMain).toBe(false);
    expect(onRoleChange).not.toHaveBeenCalledWith("main", "onboarding");

    await authReconciliation;

    expect(entry.role).toBe("sign-in");
    expect(entry.isMain).toBe(false);
    expect(onRoleChange).toHaveBeenCalledExactlyOnceWith(
      "sign-in",
      "onboarding"
    );
  });

  it("drops queued onboarding completion superseded by auth navigation", async () => {
    const window = makeWindow();
    const blockedProbe = deferred<DesktopAccountState>();
    const markComplete = vi.fn<() => Promise<void>>(async () => undefined);
    const onRoleChange =
      vi.fn<(role: DesktopEntryRole, previous: DesktopEntryRole) => void>();
    const status = vi.fn<() => Promise<DesktopAccountState>>();
    status
      .mockResolvedValueOnce("signed-in")
      .mockImplementationOnce(() => blockedProbe.promise)
      .mockResolvedValueOnce("signed-out");
    const account = {
      status,
      signOut: vi.fn<() => Promise<void>>(async () => undefined),
    };
    windowFactory.mockReturnValue(window);
    const entry = makeController(account, {
      onboarding_complete: false,
      mark_onboarding_complete: markComplete,
      on_role_change: onRoleChange,
    });
    await entry.open();
    onRoleChange.mockClear();

    const olderProbe = entry.reconcile();
    await vi.waitFor(() => expect(account.status).toHaveBeenCalledTimes(2));
    const completion = entry.completeOnboarding(window as never);
    const authReconciliation = entry.reconcileAuthControlNavigation(
      window as never,
      "sign-in"
    );
    blockedProbe.resolve("signed-in");

    await Promise.all([olderProbe, completion, authReconciliation]);

    expect(markComplete).not.toHaveBeenCalled();
    expect(onRoleChange).not.toHaveBeenCalledWith("main", "onboarding");
    expect(entry.role).toBe("sign-in");
    expect(entry.isMain).toBe(false);
  });

  it("retries a failed first load without admitting or losing startup state", async () => {
    const window = makeWindow();
    window.loadURL.mockRejectedValueOnce(new Error("renderer unavailable"));
    const account = makeAccount(["signed-in", "signed-in"]);
    windowFactory.mockReturnValue(window);
    const entry = makeController(account, {
      onboarding_complete: true,
      startup_main_path: "/desktop/welcome?startup=restore-last-workspace",
    });

    await expect(entry.open()).rejects.toThrow("renderer unavailable");
    expect(entry.role).toBe("booting");
    expect(entry.isMain).toBe(false);
    expect(window.show).not.toHaveBeenCalled();

    await entry.reconcile({ focus: true });

    expect(window.loadURL).toHaveBeenNthCalledWith(
      1,
      "https://grida.test/desktop/welcome?startup=restore-last-workspace"
    );
    expect(window.loadURL).toHaveBeenNthCalledWith(
      2,
      "https://grida.test/desktop/welcome?startup=restore-last-workspace"
    );
    expect(entry.role).toBe("main");
    expect(entry.isMain).toBe(true);
  });

  it("rejects a non-canonical callback before navigating", async () => {
    const window = makeWindow();
    windowFactory.mockReturnValue(window);
    const entry = makeController(makeAccount(["signed-out"]), {
      onboarding_complete: true,
    });
    await entry.open();

    await expect(
      entry.handleAuthCallback(
        "https://evil.test/desktop/auth/callback?code=one"
      )
    ).rejects.toThrow("refused non-canonical desktop auth callback");
    expect(window.loadURL).toHaveBeenCalledTimes(1);
  });

  it("blocks late secondary windows before main", async () => {
    const entryWindow = makeWindow();
    const secondary = makeWindow();
    windowFactory.mockReturnValue(entryWindow);
    const entry = makeController(makeAccount(["signed-out"]), {
      onboarding_complete: true,
    });
    await entry.open();

    expect(entry.registerSecondary(secondary as never)).toBe(false);
    expect(secondary.close).toHaveBeenCalled();
  });

  it("resolves IPC roles only for the active entry and admitted auxiliaries", async () => {
    const entryWindow = makeWindow();
    const secondary = makeWindow();
    const foreign = makeWindow();
    windowFactory.mockReturnValue(entryWindow);
    const entry = makeController(makeAccount(["signed-in"]), {
      onboarding_complete: true,
    });
    await entry.open();

    expect(entry.ipcRoleFor(entryWindow as never)).toBe("main");
    expect(entry.ipcRoleFor(foreign as never)).toBeNull();
    expect(entry.registerSecondary(secondary as never)).toBe(true);
    expect(entry.ipcRoleFor(secondary as never)).toBe("main");

    secondary.destroy();
    expect(entry.ipcRoleFor(secondary as never)).toBeNull();
  });

  it("aborts sign-out before cookies change when a dirty window stays open", async () => {
    const entryWindow = makeWindow();
    const dirty = makeWindow({ closeDestroys: false });
    const account = makeAccount(["signed-in"]);
    windowFactory.mockReturnValue(entryWindow);
    const entry = makeController(account, { onboarding_complete: true });
    await entry.open();
    expect(entry.registerSecondary(dirty as never)).toBe(true);
    await entryWindow.loadURL("https://grida.test/desktop/settings");

    await expect(entry.signOut(entryWindow as never)).rejects.toThrow(
      "sign-out was cancelled"
    );
    expect(account.signOut).not.toHaveBeenCalled();
    expect(entry.role).toBe("main");
  });

  it("confirms global sign-out then compacts the canonical window", async () => {
    const entryWindow = makeWindow();
    const secondary = makeWindow();
    const account = makeAccount(["signed-in"]);
    windowFactory.mockReturnValue(entryWindow);
    const entry = makeController(account, { onboarding_complete: true });
    await entry.open();
    entry.registerSecondary(secondary as never);
    await entryWindow.loadURL("https://grida.test/desktop/settings");

    await entry.signOut(entryWindow as never);

    expect(account.signOut).toHaveBeenCalledOnce();
    expect(secondary.close).toHaveBeenCalled();
    expect(entry.role).toBe("sign-in");
    expect(applyPresentation).toHaveBeenLastCalledWith(
      entryWindow,
      "compact",
      undefined
    );
    expect(entryWindow.webContents.navigationHistory.clear).toHaveBeenCalled();
  });

  it("blocks late auxiliary admission for the full sign-out mutation", async () => {
    const entryWindow = makeWindow();
    const lateWindow = makeWindow();
    const signOutGate = deferred<void>();
    const account = {
      status: vi.fn<() => Promise<DesktopAccountState>>(
        async () => "signed-in"
      ),
      signOut: vi.fn<() => Promise<void>>(() => signOutGate.promise),
    };
    windowFactory.mockReturnValue(entryWindow);
    const entry = makeController(account, { onboarding_complete: true });
    await entry.open();
    await entryWindow.loadURL("https://grida.test/desktop/settings");

    const signingOut = entry.signOut(entryWindow as never);
    await vi.waitFor(() => expect(account.signOut).toHaveBeenCalledOnce());

    expect(entry.isMain).toBe(false);
    expect(entry.ipcRoleFor(entryWindow as never)).toBeNull();
    expect(entry.registerSecondary(lateWindow as never)).toBe(false);
    expect(lateWindow.close).toHaveBeenCalledOnce();

    signOutGate.resolve(undefined);
    await signingOut;
    expect(entry.role).toBe("sign-in");
  });

  it("keeps failed sign-out admission closed until an authoritative probe", async () => {
    const entryWindow = makeWindow();
    const rejectedWindow = makeWindow();
    const recoveredWindow = makeWindow();
    const account = makeAccount(["signed-in", "signed-in"]);
    account.signOut.mockRejectedValueOnce(new Error("sign-out unavailable"));
    windowFactory.mockReturnValue(entryWindow);
    const entry = makeController(account, { onboarding_complete: true });
    await entry.open();
    await entryWindow.loadURL("https://grida.test/desktop/settings");

    await expect(entry.signOut(entryWindow as never)).rejects.toThrow(
      "sign-out unavailable"
    );
    expect(entry.isMain).toBe(false);
    expect(entry.registerSecondary(rejectedWindow as never)).toBe(false);
    expect(rejectedWindow.close).toHaveBeenCalledOnce();

    await entry.reconcile();

    expect(entry.isMain).toBe(true);
    expect(entry.registerSecondary(recoveredWindow as never)).toBe(true);
  });

  it("accepts sign-out only from an admitted Settings window", async () => {
    const entryWindow = makeWindow();
    const foreignWindow = makeWindow();
    const account = makeAccount(["signed-in"]);
    windowFactory.mockReturnValue(entryWindow);
    const entry = makeController(account, { onboarding_complete: true });
    await entry.open();

    await foreignWindow.loadURL("https://grida.test/desktop/settings");
    await expect(entry.signOut(foreignWindow as never)).rejects.toThrow(
      "not an admitted app window"
    );

    await expect(entry.signOut(entryWindow as never)).rejects.toThrow(
      "only available from Settings"
    );
    expect(account.signOut).not.toHaveBeenCalled();
  });

  it("keeps an admitted Settings sender alive until its IPC reply", async () => {
    const entryWindow = makeWindow();
    const settingsWindow = makeWindow();
    const account = makeAccount(["signed-in"]);
    windowFactory.mockReturnValue(entryWindow);
    const entry = makeController(account, { onboarding_complete: true });
    await entry.open();
    await settingsWindow.loadURL("https://grida.test/desktop/settings");
    entry.registerSecondary(settingsWindow as never);
    expect(entry.ipcRoleFor(settingsWindow as never)).toBe("main");

    const result = await entry.signOut(settingsWindow as never);

    expect(result.close_sender_after_reply).toBe(true);
    expect(settingsWindow.hide).toHaveBeenCalled();
    expect(settingsWindow.close).not.toHaveBeenCalled();
    expect(settingsWindow.isDestroyed()).toBe(false);
    expect(entry.ipcRoleFor(settingsWindow as never)).toBeNull();
    expect(entry.role).toBe("sign-in");
  });

  it("clears hosted account capacity and destroys every auxiliary on session loss", async () => {
    const entryWindow = makeWindow();
    const hiddenSecondary = makeWindow();
    const account = makeAccount(["signed-in", "signed-out"]);
    const clearHosted = vi.fn<() => Promise<void>>(async () => undefined);
    windowFactory.mockReturnValue(entryWindow);
    const entry = makeController(account, {
      onboarding_complete: true,
      clear_hosted_session: clearHosted,
    });
    await entry.open();
    entry.registerSecondary(hiddenSecondary as never);

    await entry.reconcile({ focus: true });

    expect(clearHosted).toHaveBeenCalledOnce();
    expect(hiddenSecondary.destroy).toHaveBeenCalledOnce();
    expect(hiddenSecondary.hide).not.toHaveBeenCalled();
    expect(entry.role).toBe("sign-in");
  });

  it("preserves main bounds when a compact transition fails and retries", async () => {
    const entryWindow = makeWindow();
    const account = makeAccount(["signed-in", "signed-out", "signed-in"]);
    windowFactory.mockReturnValue(entryWindow);
    const entry = makeController(account, { onboarding_complete: true });
    await entry.open();
    await entryWindow.loadURL("https://grida.test/desktop/settings");
    entryWindow.loadURL.mockRejectedValueOnce(
      new Error("renderer unavailable")
    );

    await expect(entry.signOut(entryWindow as never)).rejects.toThrow(
      "renderer unavailable"
    );
    expect(entry.isMain).toBe(false);
    expect(applyPresentation).toHaveBeenLastCalledWith(entryWindow, "main", {
      main_bounds: { x: 10, y: 10, width: 1200, height: 800 },
    });
    expect(entryWindow.show).toHaveBeenCalledTimes(2);
    entry.focus();
    expect(entryWindow.focus).toHaveBeenCalledTimes(3);
    await entry.reconcile();
    await entry.reconcile();

    expect(applyPresentation).toHaveBeenLastCalledWith(entryWindow, "main", {
      main_bounds: { x: 10, y: 10, width: 1200, height: 800 },
    });
    expect(entry.role).toBe("main");
  });

  it("serializes probes so an older check cannot land after a newer one", async () => {
    const window = makeWindow();
    const first = deferred<DesktopAccountState>();
    const status = vi.fn<() => Promise<DesktopAccountState>>();
    status
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce("signed-out");
    const account = { status, signOut: vi.fn<() => Promise<void>>() };
    windowFactory.mockReturnValue(window);
    const entry = makeController(account, { onboarding_complete: true });

    const open = entry.open();
    const newer = entry.reconcile();
    await Promise.resolve();
    expect(status).toHaveBeenCalledTimes(1);
    first.resolve("signed-in");
    await open;
    await newer;

    expect(status).toHaveBeenCalledTimes(2);
    expect(entry.role).toBe("sign-in");
  });
});

function makeController(
  account:
    | ReturnType<typeof makeAccount>
    | {
        status: () => Promise<DesktopAccountState>;
        signOut: () => Promise<void>;
      },
  options: {
    onboarding_complete: boolean;
    mark_onboarding_complete?: () => Promise<void>;
    startup_main_path?: string;
    clear_hosted_session?: () => Promise<void>;
    before_authenticated_entry?: () => Promise<void>;
    on_role_change?: (
      role: "booting" | "sign-in" | "onboarding" | "main",
      previous: "booting" | "sign-in" | "onboarding" | "main"
    ) => void;
  }
) {
  return new DesktopEntryWindow({
    app: { getVersion: () => "0.0.14" } as never,
    base_url: "https://grida.test",
    account,
    onboarding_complete: options.onboarding_complete,
    mark_onboarding_complete:
      options.mark_onboarding_complete ?? (async () => undefined),
    startup_main_path: options.startup_main_path ?? "/desktop/welcome",
    clear_hosted_session: options.clear_hosted_session,
    before_authenticated_entry: options.before_authenticated_entry,
    on_role_change: options.on_role_change,
  });
}

function makeAccount(states: DesktopAccountState[]) {
  return {
    status: vi.fn<() => Promise<DesktopAccountState>>(async () => {
      const state = states.shift();
      if (!state) throw new Error("no account state queued");
      return state;
    }),
    signOut: vi.fn<() => Promise<void>>(async () => undefined),
  };
}

function makeWindow({ closeDestroys = true } = {}) {
  let destroyed = false;
  let visible = false;
  let url = "";
  const closedListeners: Array<() => void> = [];
  const window = {
    webContents: {
      getURL: () => url,
      navigationHistory: { clear: vi.fn<() => void>() },
    },
    isDestroyed: () => destroyed,
    isVisible: () => visible,
    isMinimized: () => false,
    isMaximized: () => false,
    isFullScreen: () => false,
    restore: vi.fn<() => void>(),
    focus: vi.fn<() => void>(),
    hide: vi.fn<() => void>(() => {
      visible = false;
    }),
    show: vi.fn<() => void>(() => {
      visible = true;
    }),
    showInactive: vi.fn<() => void>(() => {
      visible = true;
    }),
    close: vi.fn<() => void>(() => {
      if (!closeDestroys) return;
      destroyed = true;
      for (const listener of closedListeners) listener();
    }),
    destroy: vi.fn<() => void>(() => {
      if (destroyed) return;
      destroyed = true;
      for (const listener of closedListeners) listener();
    }),
    once: vi.fn<(event: string, listener: () => void) => void>(
      (event, listener) => {
        if (event === "closed") closedListeners.push(listener);
      }
    ),
    loadURL: vi.fn<(target: string) => Promise<void>>(async (target) => {
      url = target;
    }),
    getNormalBounds: () => ({ x: 10, y: 10, width: 1200, height: 800 }),
    setTitle: vi.fn<(title: string) => void>(),
  };
  return window;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
