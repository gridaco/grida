// GRIDA-SEC-004 / GRIDA-SEC-005 — one owner for the privileged entry window.
import type { App, BrowserWindow, Rectangle } from "electron";
import {
  create_desktop_window,
  set_desktop_window_presentation,
} from "../window";
import type {
  DesktopAccountSession,
  DesktopAccountState,
} from "./account-session";
import type { DesktopPreferences } from "./desktop-preferences";
import type { DesktopIpcRole } from "./ipc-admission";

export type DesktopEntryRole = "booting" | "sign-in" | "onboarding" | "main";
export type DesktopAuthControlPath = "sign-in" | "complete";

const LEGACY_RENDERER_ONBOARDING_KEY = "grida.desktop.onboarding.completed.v1";
const LEGACY_RENDERER_ONBOARDING_MIGRATION_PATH =
  "/desktop/auth/migrate-onboarding";

type DesktopEntryWindowOptions = {
  app: App;
  base_url: string;
  account: Pick<DesktopAccountSession, "status" | "signOut">;
  preferences: Pick<
    DesktopPreferences,
    | "isOnboardingComplete"
    | "needsLegacyRendererOnboardingMigration"
    | "completeLegacyRendererOnboardingMigration"
    | "completeOnboarding"
    | "resetOnboarding"
  >;
  startup_main_path: string;
  before_authenticated_entry?: () => Promise<void>;
  clear_hosted_session?: () => Promise<void>;
  on_role_change?: (role: DesktopEntryRole, previous: DesktopEntryRole) => void;
};

/**
 * The canonical Desktop entry flow.
 *
 * Authentication, onboarding completion, and native window role remain three
 * separate authorities:
 *
 * - {@link DesktopAccountSession} projects the HttpOnly cookie session.
 * - {@link DesktopPreferences} owns native onboarding completion.
 * - this controller owns the exact BrowserWindow and turns those facts into a
 *   mutually exclusive full-window role.
 *
 * URLs and geometry are outputs of the role. No redirect or SPA navigation is
 * allowed to infer or mutate the role.
 */
export class DesktopEntryWindow {
  static authControlPathForUrl(
    rawUrl: string,
    baseUrl: string
  ): DesktopAuthControlPath | null {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return null;
    }
    if (url.origin !== new URL(baseUrl).origin) return null;
    if (url.pathname === "/desktop/auth/sign-in") return "sign-in";
    if (url.pathname === "/desktop/auth/complete") return "complete";
    return null;
  }

  static roleFor(
    account: DesktopAccountState,
    onboardingComplete: boolean
  ): Exclude<DesktopEntryRole, "booting"> | null {
    if (account === "unavailable") return null;
    if (account === "signed-out") return "sign-in";
    return onboardingComplete ? "main" : "onboarding";
  }

  readonly #options: DesktopEntryWindowOptions;
  readonly #secondaryWindows = new Set<BrowserWindow>();
  #window: BrowserWindow | null = null;
  #role: DesktopEntryRole = "booting";
  #startupMainPath: string;
  #hasPresentedMain = false;
  #transitioning = false;
  #admissionBlocked = false;
  #canonicalNavigationRequired = false;
  #authControlNavigationRevision = 0;
  #pendingAuthControlNavigation: {
    revision: number;
    entry_path: DesktopAuthControlPath | null;
  } | null = null;
  #expectedEntryAuthPaths: readonly DesktopAuthControlPath[] | null = null;
  #mainBounds: Rectangle | null = null;
  #operation: Promise<void> = Promise.resolve();

  constructor(options: DesktopEntryWindowOptions) {
    this.#options = options;
    this.#startupMainPath = options.startup_main_path;
  }

  get role(): DesktopEntryRole {
    return this.#role;
  }

  get window(): BrowserWindow | null {
    return this.#liveWindow();
  }

  get isMain(): boolean {
    return (
      this.#role === "main" && !this.#transitioning && !this.#admissionBlocked
    );
  }

  /**
   * Resolve the native IPC capability role of one exact BrowserWindow.
   *
   * Admission is revoked synchronously during every transition and sign-out
   * mutation. The canonical entry may then receive only its role's narrow
   * allowlist; registered auxiliaries receive main capabilities only while the
   * controller still presents an authenticated main role.
   */
  ipcRoleFor(sender: BrowserWindow): DesktopIpcRole | null {
    if (sender.isDestroyed() || this.#transitioning || this.#admissionBlocked) {
      return null;
    }
    if (sender === this.#liveWindow()) {
      return this.#role === "booting" ? null : this.#role;
    }
    if (this.#role === "main" && this.#secondaryWindows.has(sender)) {
      return "main";
    }
    return null;
  }

  /**
   * Create the one hidden native window, validate the shared cookie session,
   * then show exactly the derived role. No main-sized auth flash is possible.
   */
  open(): Promise<void> {
    this.#ensureWindow();
    const authControlRevision = this.#authControlNavigationRevision;
    const authControlPath =
      this.#pendingAuthControlNavigation?.revision === authControlRevision
        ? (this.#pendingAuthControlNavigation.entry_path ?? undefined)
        : undefined;
    return this.#enqueue(async () => {
      await this.#reconcile({
        main_path: this.#nextMainPath(),
        focus: true,
        auth_control_revision: authControlRevision,
        auth_control_path: authControlPath,
      });
    });
  }

  /**
   * Revalidate on activation/focus. A transport failure leaves the current
   * role untouched; it is never interpreted as signed-out.
   */
  reconcile({ focus = false }: { focus?: boolean } = {}): Promise<void> {
    const authControlRevision = this.#authControlNavigationRevision;
    const authControlPath =
      this.#pendingAuthControlNavigation?.revision === authControlRevision
        ? (this.#pendingAuthControlNavigation.entry_path ?? undefined)
        : undefined;
    return this.#enqueue(async () => {
      await this.#reconcile({
        main_path: this.#nextMainPath(),
        focus,
        auth_control_revision: authControlRevision,
        auth_control_path: authControlPath,
      });
    });
  }

  /**
   * Revalidate a renderer navigation to a contained auth-control route.
   *
   * The URL is only a signal, never role authority. Admission closes
   * synchronously before the asynchronous probe so a same-document redirect
   * cannot leave a main-role bridge open while account status is unavailable.
   * A navigation expected from the controller's own hidden callback/sign-in
   * load is already covered by that serialized operation and is ignored here.
   * Every other signal increments a revision that prevents an older transition
   * from committing Main before this reconciliation. A non-entry source is
   * destroyed; only navigation in the entry window requires its URL to be
   * restored after the account probe.
   */
  reconcileAuthControlNavigation(
    source: BrowserWindow,
    path: DesktopAuthControlPath
  ): Promise<void> {
    const sourceIsEntry = source === this.#liveWindow();
    if (sourceIsEntry && this.#expectedEntryAuthPaths?.includes(path)) {
      return Promise.resolve();
    }
    if (!sourceIsEntry && !source.isDestroyed()) source.destroy();

    const authControlRevision = ++this.#authControlNavigationRevision;
    this.#pendingAuthControlNavigation = {
      revision: authControlRevision,
      entry_path: sourceIsEntry ? path : null,
    };
    this.#admissionBlocked = true;
    return this.#enqueue(async () => {
      await this.#reconcile({
        main_path: this.#nextMainPath(),
        focus: true,
        auth_control_revision: authControlRevision,
        auth_control_path: sourceIsEntry ? path : undefined,
      });
    });
  }

  /**
   * Route a validated, fixed same-origin callback into the exact entry window.
   * While booting/sign-in, this control-plane event bypasses onboarding and
   * work-intent admission. Once authenticated entry is active, stale protocol
   * callbacks are ignored. The callback route performs the PKCE exchange;
   * afterwards the account session is re-probed and this controller chooses
   * the role.
   */
  handleAuthCallback(callbackUrl: string): Promise<void> {
    const authControlRevision = this.#authControlNavigationRevision;
    return this.#enqueue(async () => {
      this.#assertAuthCallbackUrl(callbackUrl);
      if (this.#isAuthControlSuperseded(authControlRevision)) return;
      // Grida account callbacks are meaningful only while entering the app.
      // A world-invokable stale/forged protocol URL must not be able to tear a
      // live workstation away from the user's current document.
      if (this.#role === "main" || this.#role === "onboarding") {
        this.focus();
        return;
      }

      const window = this.#ensureWindow();
      const previous = this.#role;
      this.#startupMainPath = "/desktop/welcome";
      this.#transitioning = true;
      window.hide();

      try {
        const previousUrl = window.webContents.getURL();
        let callbackLoadFailed = false;
        const expectedAuthPaths = ["sign-in", "complete"] as const;
        this.#expectedEntryAuthPaths = expectedAuthPaths;
        try {
          try {
            await window.loadURL(callbackUrl);
          } finally {
            if (this.#expectedEntryAuthPaths === expectedAuthPaths) {
              this.#expectedEntryAuthPaths = null;
            }
          }
        } catch {
          // A navigation can be superseded by the contained callback redirect.
          // Inspect only the fixed landing path; never retain or log a raw
          // navigation error that may contain the single-use callback code.
          callbackLoadFailed = true;
        }
        if (
          callbackLoadFailed &&
          (window.webContents.getURL() === previousUrl ||
            !this.#isContainedCallbackLanding(window.webContents.getURL()))
        ) {
          throw new DesktopEntryWindow.CallbackNavigationError();
        }

        const account = await this.#options.account.status();
        if (account === "unavailable") {
          throw new DesktopEntryWindow.AccountUnavailableError();
        }

        const role = await this.#roleForAccount(account);
        if (!role) throw new DesktopEntryWindow.AccountUnavailableError();
        if (this.#isAuthControlSuperseded(authControlRevision)) {
          this.#transitioning = false;
          return;
        }
        if (role !== "sign-in") {
          await this.#options.before_authenticated_entry?.();
        }
        if (this.#isAuthControlSuperseded(authControlRevision)) {
          this.#transitioning = false;
          return;
        }
        await this.#transition(role, {
          main_path: this.#nextMainPath(),
          sign_in_path:
            account === "signed-out"
              ? "/desktop/auth/sign-in?auth_error=sign_in_failed"
              : undefined,
          focus: true,
          auth_control_revision: authControlRevision,
        });
      } catch (error) {
        // Callback loading hides the entry before the account probe. Restore the
        // last earned presentation on every failure, including an unavailable
        // probe or authenticated-backend readiness failure.
        if (this.#transitioning) {
          this.#restorePresentation(window, previous, true);
        }
        throw error;
      }
    });
  }

  /**
   * Persist setup and promote this same BrowserWindow to the workstation.
   * Both the exact sender window and current route are checked in addition to
   * the guarded IPC sender validation.
   */
  completeOnboarding(
    sender: BrowserWindow,
    workspaceId?: string
  ): Promise<void> {
    const authControlRevision = this.#authControlNavigationRevision;
    return this.#enqueue(async () => {
      if (this.#isAuthControlSuperseded(authControlRevision)) return;
      const entry = this.#liveWindow();
      if (!entry || sender !== entry || this.#role !== "onboarding") {
        throw new Error(
          "onboarding completion is only available to the active entry window"
        );
      }
      const senderUrl = new URL(entry.webContents.getURL());
      if (
        senderUrl.origin !== new URL(this.#options.base_url).origin ||
        senderUrl.pathname !== "/desktop/onboarding"
      ) {
        throw new Error(
          "onboarding completion is only available from onboarding"
        );
      }

      // Onboarding can remain open while the app is backgrounded. Re-probe
      // inside the serialized completion operation so an expired account can
      // never persist setup and briefly admit the main app.
      const account = await this.#options.account.status();
      if (this.#isAuthControlSuperseded(authControlRevision)) return;
      if (account === "unavailable") {
        throw new DesktopEntryWindow.AccountUnavailableError();
      }
      if (account === "signed-out") {
        this.#admissionBlocked = true;
        this.#destroySecondaryWindows();
        await this.#clearHostedSession();
        await this.#transition("sign-in", {
          focus: true,
          auth_control_revision: authControlRevision,
        });
        return;
      }

      await this.#options.preferences.completeOnboarding();
      const query = workspaceId
        ? `?onboardingWorkspace=${encodeURIComponent(workspaceId)}`
        : "";
      await this.#transition("main", {
        main_path: `/desktop/welcome${query}`,
        focus: true,
        auth_control_revision: authControlRevision,
      });
    });
  }

  /**
   * One global sign-out transition.
   *
   * Auxiliary windows close before the shared cookie changes. Existing dirty
   * handlers may cancel a close; that aborts sign-out while the authenticated
   * session is still intact. After that close phase, admission remains blocked
   * for the complete asynchronous mutation. On success the initiating Settings
   * window can be closed by the IPC caller after its response has been
   * delivered.
   */
  signOut(
    sender: BrowserWindow
  ): Promise<{ close_sender_after_reply: boolean }> {
    const authControlRevision = this.#authControlNavigationRevision;
    return this.#enqueue(async () => {
      if (!this.isMain) {
        throw new Error("sign-out is only available from the main app");
      }
      const entry = this.#liveWindow();
      if (
        (sender !== entry && !this.#secondaryWindows.has(sender)) ||
        sender.isDestroyed()
      ) {
        throw new Error("sign-out sender is not an admitted app window");
      }
      const senderUrl = new URL(sender.webContents.getURL());
      if (
        senderUrl.origin !== new URL(this.#options.base_url).origin ||
        senderUrl.pathname !== "/desktop/settings"
      ) {
        throw new Error("sign-out is only available from Settings");
      }

      for (const window of this.#secondaryWindows) {
        if (window === sender || window.isDestroyed()) continue;
        window.close();
      }
      const blocked = [...this.#secondaryWindows].some(
        (window) =>
          window !== sender &&
          !window.isDestroyed() &&
          this.#secondaryWindows.has(window)
      );
      if (blocked) throw new DesktopEntryWindow.SignOutCancelledError();

      // The close sweep and cookie mutation are separated by network awaits.
      // Close admission first so an async file/menu/notification open cannot
      // register a new renderer after the sweep and survive global sign-out.
      this.#admissionBlocked = true;
      await this.#options.account.signOut();
      await this.#clearHostedSession();
      try {
        await this.#options.preferences.resetOnboarding();
      } catch (error) {
        // The cookie deletion remains authoritative. Onboarding is non-security
        // UX state and must not strand a successfully signed-out user.
        console.warn(
          "[grida] couldn't reset onboarding after sign-out:",
          error
        );
      }

      const closeSender = sender !== this.#liveWindow();
      if (closeSender && !sender.isDestroyed()) sender.hide();
      await this.#transition("sign-in", {
        focus: true,
        auth_control_revision: authControlRevision,
      });
      return { close_sender_after_reply: closeSender };
    });
  }

  /**
   * Register every non-entry BrowserWindow. Late async opens fail closed: if
   * auth/onboarding changed while the opener was doing IO, the new window is
   * immediately closed instead of escaping the admission gate.
   */
  registerSecondary(window: BrowserWindow): boolean {
    if (window === this.#liveWindow()) return true;
    if (!this.isMain) {
      window.close();
      this.focus();
      return false;
    }
    this.#secondaryWindows.add(window);
    window.once("closed", () => {
      this.#secondaryWindows.delete(window);
    });
    return true;
  }

  focus(): void {
    const window = this.#liveWindow();
    if (!window || this.#transitioning || this.#canonicalNavigationRequired) {
      return;
    }
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }

  async #reconcile({
    main_path: mainPath,
    focus,
    auth_control_revision: authControlRevision,
    auth_control_path: authControlPath,
    force_navigation: forceNavigation = false,
  }: {
    main_path: string;
    focus: boolean;
    auth_control_revision: number;
    auth_control_path?: DesktopAuthControlPath;
    force_navigation?: boolean;
  }): Promise<void> {
    const account = await this.#options.account.status();
    if (this.#isAuthControlSuperseded(authControlRevision)) return;
    const role = await this.#roleForAccount(account);
    if (!role) throw new DesktopEntryWindow.AccountUnavailableError();
    if (role !== "sign-in") {
      await this.#options.before_authenticated_entry?.();
    }
    if (this.#isAuthControlSuperseded(authControlRevision)) return;

    const restoreCanonicalRole =
      authControlPath !== undefined &&
      !(authControlPath === "sign-in" && role === "sign-in");
    if (
      role === this.#role &&
      this.#liveWindow() &&
      !this.#transitioning &&
      !this.#canonicalNavigationRequired &&
      !forceNavigation &&
      !restoreCanonicalRole
    ) {
      // A failed sign-out request remains fail-closed until an authoritative
      // probe confirms that the original signed-in role is still valid.
      this.#clearPendingAuthControlNavigation(authControlRevision);
      this.#admissionBlocked = false;
      if (focus) this.focus();
      return;
    }
    if (role !== "main") {
      // Once signed-out is authoritative, auxiliary renderers are destroyed,
      // not hidden. Hidden webContents retain preload/IPC/sidecar authority and
      // could otherwise survive into a different account session.
      this.#admissionBlocked = true;
      this.#destroySecondaryWindows();
      if (this.#role === "main" || this.#role === "onboarding") {
        await this.#clearHostedSession();
      }
    }
    await this.#transition(role, {
      main_path: mainPath,
      focus,
      auth_control_revision: authControlRevision,
    });
  }

  async #transition(
    role: Exclude<DesktopEntryRole, "booting">,
    {
      main_path: mainPath = "/desktop/welcome",
      sign_in_path: signInPath = "/desktop/auth/sign-in",
      focus = false,
      auth_control_revision: authControlRevision,
    }: {
      main_path?: string;
      sign_in_path?: string;
      focus?: boolean;
      auth_control_revision: number;
    }
  ): Promise<void> {
    if (this.#isAuthControlSuperseded(authControlRevision)) return;
    const window = this.#ensureWindow();
    const previous = this.#role;
    if (previous === "main" && role !== "main") {
      this.#mainBounds = window.getNormalBounds();
    }

    // Admission closes before geometry or navigation changes. A failed load
    // restores the previously earned presentation while leaving any explicit
    // fail-closed admission block intact for the caller's authoritative retry.
    this.#transitioning = true;
    window.hide();
    try {
      this.#applyPresentation(window, role);

      const path =
        role === "sign-in"
          ? signInPath
          : role === "onboarding"
            ? "/desktop/onboarding"
            : mainPath;
      const expectedAuthPaths =
        role === "sign-in" ? (["sign-in"] as const) : null;
      this.#expectedEntryAuthPaths = expectedAuthPaths;
      try {
        await window.loadURL(new URL(path, this.#options.base_url).toString());
      } finally {
        if (this.#expectedEntryAuthPaths === expectedAuthPaths) {
          this.#expectedEntryAuthPaths = null;
        }
      }
      if (this.#isAuthControlSuperseded(authControlRevision)) {
        // The navigation observer has already closed admission and enqueued the
        // newer authoritative probe. Do not publish this stale role or invoke
        // on_role_change; leave the canonical window hidden for that operation.
        this.#transitioning = false;
        return;
      }
      window.webContents.navigationHistory.clear();

      // A controller-owned role load is the only event that releases a window
      // quarantined after an off-surface in-page navigation. Clear the marker
      // only after the canonical document loaded and its transition generation
      // is still current.
      this.#canonicalNavigationRequired = false;
      this.#role = role;
      this.#transitioning = false;
      this.#clearPendingAuthControlNavigation(authControlRevision);
      this.#admissionBlocked = false;
      if (role === "main") {
        this.#hasPresentedMain = true;
        this.#startupMainPath = "/desktop/welcome";
      } else {
        // Startup restoration applies only to an already-authenticated cold
        // main bootstrap. Once entry presents sign-in/onboarding, the eventual
        // destination is the ordinary Welcome surface.
        this.#startupMainPath = "/desktop/welcome";
      }
      window.show();
      if (focus) window.focus();

      if (previous !== role) this.#options.on_role_change?.(role, previous);
    } catch (error) {
      this.#restorePresentation(window, previous, focus);
      throw error;
    }
  }

  #nextMainPath(): string {
    return this.#hasPresentedMain ? "/desktop/welcome" : this.#startupMainPath;
  }

  async #roleForAccount(
    account: DesktopAccountState
  ): Promise<Exclude<DesktopEntryRole, "booting"> | null> {
    if (account === "signed-in") {
      await this.#migrateLegacyRendererOnboarding();
    }
    return DesktopEntryWindow.roleFor(
      account,
      this.#options.preferences.isOnboardingComplete()
    );
  }

  /**
   * Consume the 0.0.13 renderer completion flag once, before selecting the
   * authenticated entry role. The fixed hidden same-origin page contributes
   * one boolean only; main durably records that the migration ran before the
   * flag can influence a role, then removes the obsolete renderer key.
   */
  async #migrateLegacyRendererOnboarding(): Promise<void> {
    if (!this.#options.preferences.needsLegacyRendererOnboardingMigration()) {
      return;
    }

    const window = this.#ensureWindow();
    this.#transitioning = true;
    window.hide();
    let completed: boolean;
    try {
      await window.loadURL(
        new URL(
          LEGACY_RENDERER_ONBOARDING_MIGRATION_PATH,
          this.#options.base_url
        ).toString()
      );
      completed =
        (await window.webContents.executeJavaScript(
          `window.localStorage.getItem(${JSON.stringify(LEGACY_RENDERER_ONBOARDING_KEY)}) === "1"`
        )) === true;
    } catch {
      throw new DesktopEntryWindow.LegacyOnboardingMigrationError();
    }

    await this.#options.preferences.completeLegacyRendererOnboardingMigration(
      completed
    );
    try {
      await window.webContents.executeJavaScript(
        `window.localStorage.removeItem(${JSON.stringify(LEGACY_RENDERER_ONBOARDING_KEY)})`
      );
    } catch {
      // The native migration marker is authoritative. Removing the obsolete
      // renderer key is cleanup only and must not undo a durable decision.
    }
  }

  #isAuthControlSuperseded(revision: number): boolean {
    return revision !== this.#authControlNavigationRevision;
  }

  #clearPendingAuthControlNavigation(revision: number): void {
    if (this.#pendingAuthControlNavigation?.revision === revision) {
      this.#pendingAuthControlNavigation = null;
    }
  }

  #ensureWindow(): BrowserWindow {
    const existing = this.#liveWindow();
    if (existing) return existing;

    const window = create_desktop_window({
      app: this.#options.app,
      base_url: this.#options.base_url,
      urlPath: null,
      presentation: "main",
      show: false,
      on_disallowed_in_page_navigation: () => {
        this.#recoverDisallowedInPageNavigation();
      },
    });
    this.#window = window;
    window.once("closed", () => {
      if (this.#window === window) this.#window = null;
    });
    return window;
  }

  #liveWindow(): BrowserWindow | null {
    if (!this.#window || this.#window.isDestroyed()) return null;
    return this.#window;
  }

  #recoverDisallowedInPageNavigation(): void {
    const window = this.#liveWindow();
    if (!window) return;
    // `did-navigate-in-page` fires after the URL has already changed. Revoke
    // admission and quarantine the exact window synchronously, then invalidate
    // any role transition whose load is still in flight. Only a later
    // controller-owned canonical role load may clear this marker.
    this.#canonicalNavigationRequired = true;
    this.#admissionBlocked = true;
    window.hide();
    const authControlRevision = ++this.#authControlNavigationRevision;
    this.#pendingAuthControlNavigation = null;
    void this.#enqueue(async () => {
      await this.#reconcile({
        main_path: this.#nextMainPath(),
        focus: true,
        auth_control_revision: authControlRevision,
        force_navigation: true,
      });
    }).catch(() => {
      // The off-surface document may still carry a path-scoped preload from
      // its original page. Keep it hidden and admission-blocked until a later
      // authoritative account reconciliation restores the exact role.
      const current = this.#liveWindow();
      if (current && !current.isDestroyed()) current.hide();
      console.warn("[grida] entry navigation recovery unavailable");
    });
  }

  #destroySecondaryWindows(): void {
    for (const window of this.#secondaryWindows) {
      if (!window.isDestroyed()) window.destroy();
    }
    this.#secondaryWindows.clear();
  }

  #applyPresentation(
    window: BrowserWindow,
    role: Exclude<DesktopEntryRole, "booting">
  ): void {
    set_desktop_window_presentation(
      window,
      role === "main"
        ? "main"
        : role === "onboarding"
          ? "onboarding"
          : "compact",
      role === "main" ? { main_bounds: this.#mainBounds } : undefined
    );
    window.setTitle(
      role === "sign-in"
        ? "Sign in to Grida"
        : role === "onboarding"
          ? "Welcome to Grida"
          : "Grida"
    );
  }

  #restorePresentation(
    window: BrowserWindow,
    role: DesktopEntryRole,
    focus: boolean
  ): void {
    this.#transitioning = false;
    if (role === "booting" || window.isDestroyed()) return;
    try {
      this.#applyPresentation(window, role);
    } catch {
      // Showing the last renderer is more useful than replacing the original
      // navigation error with a secondary native-geometry failure.
    }
    if (window.isDestroyed()) return;
    if (this.#canonicalNavigationRequired) {
      window.hide();
      return;
    }
    window.show();
    if (focus) window.focus();
  }

  #assertAuthCallbackUrl(raw: string): void {
    const callback = new URL(raw);
    const base = new URL(this.#options.base_url);
    if (
      callback.origin !== base.origin ||
      callback.pathname !== "/desktop/auth/callback"
    ) {
      throw new Error("refused non-canonical desktop auth callback");
    }
  }

  #isContainedCallbackLanding(raw: string): boolean {
    try {
      const url = new URL(raw);
      const base = new URL(this.#options.base_url);
      return (
        url.origin === base.origin &&
        (url.pathname === "/desktop/auth/complete" ||
          url.pathname === "/desktop/auth/sign-in")
      );
    } catch {
      return false;
    }
  }

  async #clearHostedSession(): Promise<void> {
    try {
      await this.#options.clear_hosted_session?.();
    } catch {
      // The hosted token is memory-only and expires quickly. A sidecar
      // restart also drops it, so account-role reconciliation must continue.
    }
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#operation.then(operation, operation);
    this.#operation = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  static AccountUnavailableError = class AccountUnavailableError extends Error {
    constructor() {
      super("the Grida account session is unavailable");
      this.name = "DesktopAccountUnavailableError";
    }
  };

  static CallbackNavigationError = class CallbackNavigationError extends Error {
    constructor() {
      super("the contained Grida account callback could not be loaded");
      this.name = "DesktopCallbackNavigationError";
    }
  };

  static LegacyOnboardingMigrationError = class LegacyOnboardingMigrationError extends Error {
    constructor() {
      super("the legacy onboarding preference could not be migrated");
      this.name = "DesktopLegacyOnboardingMigrationError";
    }
  };

  static SignOutCancelledError = class SignOutCancelledError extends Error {
    constructor() {
      super("sign-out was cancelled because a window stayed open");
      this.name = "DesktopSignOutCancelledError";
    }
  };
}
