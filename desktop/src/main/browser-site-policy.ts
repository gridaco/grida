/** GRIDA-SEC-016 — origin-scoped website consent in the isolated browser Session. */
import { X509Certificate } from "node:crypto";
import { BrowserExternalLinks } from "./browser-external-links";
import {
  desktopCapturer,
  dialog,
  systemPreferences,
  webContents,
  type BluetoothDevice,
  type BrowserWindow,
  type Certificate,
  type DevicePermissionHandlerHandlerDetails,
  type DisplayMediaRequestHandlerHandlerRequest,
  type Event,
  type FilesystemPermissionRequest,
  type HIDDevice,
  type MediaAccessPermissionRequest,
  type PermissionCheckHandlerHandlerDetails,
  type PermissionRequest,
  type SerialPort,
  type Session,
  type USBDevice,
  type WebContents,
  type WebFrameMain,
} from "electron";

type Owner = { window: BrowserWindow; isLive(): boolean; isActive?(): boolean };
type Registration = Owner & {
  dispose(): void;
  cancel(): void;
  navigation: number;
  frames: WeakMap<WebFrameMain, number>;
};
type Context = {
  contents: WebContents;
  owner: Registration;
  top: WebFrameMain;
  topUrl: string;
  topOrigin: string;
  frame: WebFrameMain;
  frameUrl: string;
  frameOrigin: string;
  embeddingFrame: WebFrameMain;
  embeddingFrameOrigin: string;
  origin: string;
  embeddingOrigin: string;
  epoch: number;
  navigation: number;
  frameNavigation: number;
};
type Decision = {
  origin: string;
  embeddingOrigin: string;
  permission: string;
  allowed: boolean;
};
type Device = HIDDevice | USBDevice | SerialPort;

/**
 * Main-only website permissions. Decisions last for this browser Session's app
 * lifetime, across tab closures; no application account/provider Session is used.
 * Registration is an actual admitted guest, never an origin-derived native role.
 */
export class BrowserSitePolicy {
  readonly #owners = new Map<WebContents, Registration>();
  readonly #decisions = new Map<string, Decision>();
  readonly #devices = new Set<string>();
  readonly #certificates = new Map<
    string,
    { hostname: string; fingerprint: string }
  >();
  readonly #pending = new Set<WebContents>();
  readonly #dialogs = new Map<
    WebContents,
    { context: Context; abort: AbortController }
  >();
  #epoch = 0;
  #certificateAccepted = false;

  constructor(
    readonly browserSession: Session,
    readonly options: {
      openExternal?(
        contents: WebContents,
        request: { url: string; origin: string; isCurrent(): boolean }
      ): void;
    } = {}
  ) {
    browserSession.setPermissionRequestHandler(
      (contents, permission, callback, details) => {
        if (permission === "openExternal") {
          const context = this.#requestContext(contents, details);
          const target = BrowserExternalLinks.parse(
            (details as Electron.OpenExternalPermissionRequest).externalURL
          );
          // Chromium never launches an OS handler directly. Actual guest/frame
          // context and the URL go through Main's separate handoff policy.
          callback(false);
          if (context && target && this.#current(context))
            this.options.openExternal?.(contents, {
              url: target.url,
              origin: context.origin,
              isCurrent: () => this.#current(context),
            });
          return;
        }
        void this.#request(contents, permission, details).then(callback, () =>
          callback(false)
        );
      }
    );
    browserSession.setPermissionCheckHandler(
      (contents, permission, origin, details) => {
        try {
          return this.#check(contents, permission, origin, details);
        } catch {
          return false;
        }
      }
    );
    browserSession.setDevicePermissionHandler((details) => {
      const origin = BrowserSitePolicy.#origin(details.origin);
      return (
        !!origin &&
        this.#devices.has(
          this.#deviceKey(origin, details.deviceType, details.device)
        )
      );
    });
    browserSession.setDisplayMediaRequestHandler((request, callback) => {
      void this.#display(request).then(callback, () => callback({}));
    });
    // Verification is session-scoped. Unmatched certificates keep Chromium's
    // verdict (-3); only an explicit exact-host/certificate exception returns 0.
    browserSession.setCertificateVerifyProc((request, callback) => {
      const fingerprint = BrowserSitePolicy.#certificateFingerprint(
        request.certificate
      );
      callback(
        fingerprint &&
          this.#certificates.has(
            this.#certificateKey(request.hostname, fingerprint)
          )
          ? 0
          : -3
      );
    });
    browserSession.on("select-usb-device", (event, details, callback) => {
      event.preventDefault();
      void this.#selectFrameDevice(
        "usb",
        details.frame,
        details.deviceList
      ).then(callback, () => callback());
    });
    browserSession.on("select-hid-device", (event, details, callback) => {
      event.preventDefault();
      void this.#selectFrameDevice(
        "hid",
        details.frame,
        details.deviceList
      ).then(callback, () => callback());
    });
    browserSession.on(
      "select-serial-port",
      (event, ports, contents, callback) => {
        event.preventDefault();
        const context = this.#topContext(contents);
        void this.#selectDevice("serial", context, ports).then(
          (id) => callback(id ?? ""),
          () => callback("")
        );
      }
    );
    // Electron 42.2 supplies no initiating frame/WC on this event. Keep
    // Chromium's restricted-directory boundary rather than guessing its owner.
    browserSession.on(
      "file-system-access-restricted",
      (event, _details, callback) => {
        event.preventDefault();
        callback("deny");
      }
    );
  }

  register(contents: WebContents, owner: Owner): void {
    this.unregister(contents);
    if (contents.session !== this.browserSession || contents.isDestroyed())
      throw new Error("browser_site_policy_guest_invalid");
    const certificate = (
      event: Event,
      url: string,
      error: string,
      cert: Certificate,
      callback: (allowed: boolean) => void,
      isMainFrame: boolean
    ) => {
      event.preventDefault();
      void this.#certificate(contents, url, error, cert, isMainFrame).then(
        callback,
        () => callback(false)
      );
    };
    let bluetoothCallback: ((id: string) => void) | undefined;
    let bluetoothTimer: ReturnType<typeof setTimeout> | undefined;
    let bluetoothChoosing = false;
    const finishBluetooth = (id: string) => {
      if (bluetoothTimer) clearTimeout(bluetoothTimer);
      bluetoothTimer = undefined;
      bluetoothChoosing = false;
      const callback = bluetoothCallback;
      bluetoothCallback = undefined;
      callback?.(id);
    };
    const bluetooth = (
      event: Event,
      devices: BluetoothDevice[],
      callback: (id: string) => void
    ) => {
      event.preventDefault();
      // Electron does not expose Bluetooth's initiating frame. Label this as
      // the containing page, without claiming it is a known subframe origin.
      bluetoothCallback = callback;
      if (bluetoothChoosing) return;
      if (this.#pending.has(contents)) return finishBluetooth("");
      const context = this.#topContext(contents);
      if (!context) return finishBluetooth("");
      // An initial scan event can be empty. Leave discovery running briefly;
      // later scan events supply the real devices for the same native chooser.
      if (!devices.length) {
        bluetoothTimer ??= setTimeout(() => finishBluetooth(""), 15_000);
        return;
      }
      if (bluetoothTimer) clearTimeout(bluetoothTimer);
      bluetoothTimer = undefined;
      bluetoothChoosing = true;
      void this.#choose(
        context,
        "Bluetooth device",
        devices.map((device) => ({
          id: device.deviceId,
          label: device.deviceName || device.deviceId,
        })),
        "The containing page is shown below. Electron does not identify the requesting Bluetooth frame."
      ).then(
        (id) => finishBluetooth(id ?? ""),
        () => finishBluetooth("")
      );
    };
    const destroyed = () => this.unregister(contents);
    const navigating = (
      event: Electron.Event<Electron.WebContentsDidStartNavigationEventParams>
    ) => {
      const registration = this.#owners.get(contents);
      if (!registration || event.isSameDocument) return;
      if (!event.frame || event.frame === contents.mainFrame)
        registration.navigation++;
      else
        registration.frames.set(
          event.frame,
          (registration.frames.get(event.frame) ?? 0) + 1
        );
      const pending = this.#dialogs.get(contents);
      if (
        pending &&
        (!event.frame ||
          event.frame === pending.context.top ||
          event.frame === pending.context.frame)
      )
        registration.cancel();
    };
    contents.on("certificate-error", certificate);
    contents.on("select-bluetooth-device", bluetooth);
    contents.once("destroyed", destroyed);
    contents.on("did-start-navigation", navigating);
    this.#owners.set(contents, {
      ...owner,
      navigation: 0,
      frames: new WeakMap(),
      cancel: () => {
        finishBluetooth("");
        this.#dialogs.get(contents)?.abort.abort();
      },
      dispose: () => {
        finishBluetooth("");
        this.#dialogs.get(contents)?.abort.abort();
        contents.removeListener("certificate-error", certificate);
        contents.removeListener("select-bluetooth-device", bluetooth);
        contents.removeListener("destroyed", destroyed);
        contents.removeListener("did-start-navigation", navigating);
      },
    });
  }

  unregister(contents: WebContents): void {
    this.#owners.get(contents)?.dispose();
    this.#owners.delete(contents);
  }

  /** Native inspection only; no paths, devices or certificate bytes cross IPC. */
  read(): {
    permissions: Decision[];
    certificateExceptions: { hostname: string; fingerprint: string }[];
    selectedDevices: number;
  } {
    return {
      permissions: [...this.#decisions.values()].map((entry) => ({
        ...entry,
        permission: entry.permission.startsWith("fileSystem:")
          ? entry.permission.split(":").slice(0, 3).join(":")
          : entry.permission,
      })),
      certificateExceptions: [...this.#certificates.values()].map((entry) => ({
        ...entry,
      })),
      selectedDevices: this.#devices.size,
    };
  }

  /**
   * Clears future consent and invalidates in-flight prompts. Chromium may cache
   * certificate verification results; closing connections is not a guarantee of
   * immediate TLS revocation. Relaunch is required to guarantee that cache ends.
   * Existing media streams/OS grants are not revoked by this permission reset.
   */
  async reset(): Promise<void> {
    await this.resetPermissions();
  }

  async resetPermissions(): Promise<{
    reloadRequired: true;
    certificateRestartRequired: boolean;
  }> {
    // Once Chromium may have cached an exception, subsequent resets cannot
    // establish that it has forgotten it either. Only process exit does that.
    const certificateRestartRequired = this.#certificateAccepted;
    this.#epoch++;
    for (const owner of this.#owners.values()) owner.cancel();
    this.#decisions.clear();
    this.#devices.clear();
    this.#certificates.clear();
    await this.browserSession.closeAllConnections();
    return { reloadRequired: true, certificateRestartRequired };
  }

  static #origin(raw: string | undefined): string | null {
    try {
      const url = new URL(raw ?? "");
      return (url.protocol === "http:" || url.protocol === "https:") &&
        !url.username &&
        !url.password
        ? url.origin
        : null;
    } catch {
      return null;
    }
  }

  #live(contents: WebContents, owner: Registration): boolean {
    try {
      return (
        this.#owners.get(contents) === owner &&
        contents.session === this.browserSession &&
        !contents.isDestroyed() &&
        !owner.window.isDestroyed() &&
        !owner.window.webContents.isDestroyed() &&
        owner.isLive()
      );
    } catch {
      return false;
    }
  }

  #context(
    contents: WebContents,
    frame: WebFrameMain | null,
    initialOrigin?: string
  ): Context | null {
    const owner = this.#owners.get(contents);
    if (!owner || !frame || !this.#live(contents, owner)) return null;
    try {
      const top = contents.mainFrame;
      if (frame.detached || !top.framesInSubtree.includes(frame)) return null;
      const embeddingFrame = frame.parent ?? top;
      // A URL is not a security origin: generated documents can inherit an
      // origin, while a sandboxed HTTP document can have an opaque origin.
      const origin =
        BrowserSitePolicy.#origin(frame.origin) ??
        (frame === top && frame.url === "about:blank"
          ? BrowserSitePolicy.#origin(initialOrigin)
          : null);
      const embeddingOrigin =
        BrowserSitePolicy.#origin(embeddingFrame.origin) ??
        (embeddingFrame === top && top.url === "about:blank"
          ? BrowserSitePolicy.#origin(initialOrigin)
          : null);
      if (!origin || !embeddingOrigin) return null;
      return {
        contents,
        owner,
        top,
        topUrl: top.url,
        topOrigin: top.origin,
        frame,
        frameUrl: frame.url,
        frameOrigin: frame.origin,
        embeddingFrame,
        embeddingFrameOrigin: embeddingFrame.origin,
        origin,
        embeddingOrigin,
        epoch: this.#epoch,
        navigation: owner.navigation,
        frameNavigation: owner.frames.get(frame) ?? 0,
      };
    } catch {
      return null;
    }
  }

  #topContext(contents: WebContents, initialOrigin?: string): Context | null {
    try {
      return this.#context(contents, contents.mainFrame, initialOrigin);
    } catch {
      return null;
    }
  }

  #current(context: Context | null): context is Context {
    if (
      !context ||
      context.epoch !== this.#epoch ||
      !this.#live(context.contents, context.owner)
    )
      return false;
    try {
      return (
        context.owner.navigation === context.navigation &&
        (context.owner.frames.get(context.frame) ?? 0) ===
          context.frameNavigation &&
        context.contents.mainFrame === context.top &&
        context.top.url === context.topUrl &&
        context.top.origin === context.topOrigin &&
        !context.frame.detached &&
        context.frame.url === context.frameUrl &&
        context.frame.origin === context.frameOrigin &&
        (context.frame.parent ?? context.top) === context.embeddingFrame &&
        !context.embeddingFrame.detached &&
        context.embeddingFrame.origin === context.embeddingFrameOrigin &&
        context.top.framesInSubtree.includes(context.frame)
      );
    } catch {
      return false;
    }
  }

  #requestContext(
    contents: WebContents,
    details: PermissionRequest,
    filesystem = false
  ): Context | null {
    try {
      const frames = details.isMainFrame
        ? [contents.mainFrame]
        : contents.mainFrame.framesInSubtree.filter(
            (entry) =>
              (filesystem || entry !== contents.mainFrame) &&
              entry.url === details.requestingUrl
          );
      const frame = frames.length === 1 ? frames[0] : null;
      const context = this.#context(contents, frame ?? null);
      return context && frame!.url === details.requestingUrl ? context : null;
    } catch {
      return null;
    }
  }

  #key(origin: string, embeddingOrigin: string, permission: string): string {
    return JSON.stringify([origin, embeddingOrigin, permission]);
  }

  #decision(
    context: Pick<Context, "origin" | "embeddingOrigin">,
    permission: string
  ): boolean | undefined {
    return this.#decisions.get(
      this.#key(context.origin, context.embeddingOrigin, permission)
    )?.allowed;
  }

  #remember(context: Context, permission: string, allowed: boolean): void {
    const key = this.#key(context.origin, context.embeddingOrigin, permission);
    this.#decisions.delete(key);
    this.#decisions.set(key, {
      origin: context.origin,
      embeddingOrigin: context.embeddingOrigin,
      permission,
      allowed,
    });
    while (this.#decisions.size > 500)
      this.#decisions.delete(this.#decisions.keys().next().value!);
  }

  #label(context: Context): string {
    return context.origin === context.embeddingOrigin
      ? context.origin
      : `${context.origin}\nEmbedded in ${context.embeddingOrigin}`;
  }

  async #prompt(
    context: Context,
    options: Electron.MessageBoxOptions
  ): Promise<Electron.MessageBoxReturnValue> {
    const pending = { context, abort: new AbortController() };
    this.#dialogs.set(context.contents, pending);
    try {
      return await dialog.showMessageBox(context.owner.window, {
        ...options,
        signal: pending.abort.signal,
      });
    } finally {
      if (this.#dialogs.get(context.contents) === pending)
        this.#dialogs.delete(context.contents);
    }
  }

  #check(
    contents: WebContents | null,
    permission: string,
    rawOrigin: string,
    details: PermissionCheckHandlerHandlerDetails
  ): boolean {
    const origin = BrowserSitePolicy.#origin(
      details.securityOrigin ?? rawOrigin
    );
    const embeddingOrigin = BrowserSitePolicy.#origin(
      details.embeddingOrigin ??
        (contents ? contents.mainFrame.origin : rawOrigin)
    );
    if (!origin || !embeddingOrigin) return false;
    if (
      details.securityOrigin &&
      origin !== BrowserSitePolicy.#origin(rawOrigin)
    )
      return false;
    const owner = contents && this.#owners.get(contents);
    if (contents && (!owner || !this.#live(contents, owner))) return false;
    // A null WC is valid for service workers; it can consume saved origin
    // consent but cannot obtain active-page privileges or open a native prompt.
    if (
      ["clipboard-sanitized-write", "fullscreen", "pointerLock"].includes(
        permission
      )
    )
      return !!contents && this.#active(contents, owner!);
    // These checks only enable Chromium's real requestDevice/requestPort picker;
    // specific-device checks below still require an actual native selection.
    if (["hid", "usb", "serial"].includes(permission)) return !!contents;
    const context = { origin, embeddingOrigin };
    if (permission === "media") {
      if (details.mediaType === "video")
        return this.#decision(context, "camera") === true;
      if (details.mediaType === "audio")
        return this.#decision(context, "microphone") === true;
      return (
        this.#decision(context, "camera") === true &&
        this.#decision(context, "microphone") === true
      );
    }
    if (permission === "fileSystem") {
      const key = this.#filePermission(details);
      return !!contents && !!key && this.#decision(context, key) === true;
    }
    if (
      !["clipboard-read", "geolocation", "notifications"].includes(permission)
    )
      return false;
    return this.#decision(context, permission) === true;
  }

  #filePermission(details: {
    filePath?: string;
    fileAccessType?: string;
    isDirectory?: boolean;
  }): string | null {
    return details.filePath &&
      details.filePath.length <= 4096 &&
      ["readable", "writable"].includes(details.fileAccessType ?? "")
      ? `fileSystem:${details.fileAccessType}:${details.isDirectory ? "directory" : "file"}:${details.filePath}`
      : null;
  }

  #active(contents: WebContents, owner: Registration): boolean {
    try {
      return (
        contents.isFocused() ||
        (owner.isActive?.() === true && owner.window.isFocused())
      );
    } catch {
      return false;
    }
  }

  async #request(
    contents: WebContents,
    permission: string,
    details: PermissionRequest
  ): Promise<boolean> {
    // Chromium reports isMainFrame=false for fileSystem even for a top-level
    // picker. Match its actual requesting URL across the entire frame tree.
    const context = this.#requestContext(
      contents,
      details,
      permission === "fileSystem"
    );
    if (!context) return false;
    if (
      ["clipboard-sanitized-write", "fullscreen", "pointerLock"].includes(
        permission
      )
    )
      return this.#active(contents, context.owner);
    if (permission === "display-capture") return true; // The display handler requires an explicit source choice.
    let permissions: string[];
    let description: string;
    if (permission === "media") {
      const media = details as MediaAccessPermissionRequest;
      if (
        media.securityOrigin &&
        BrowserSitePolicy.#origin(media.securityOrigin) !== context.origin
      )
        return false;
      if (
        !media.mediaTypes?.length ||
        media.mediaTypes.some((type) => type !== "audio" && type !== "video")
      )
        return false;
      permissions = [
        ...new Set(
          media.mediaTypes.map((type) =>
            type === "video" ? "camera" : "microphone"
          )
        ),
      ];
      description = `Use your ${permissions.join(" and ")}?`;
    } else if (permission === "fileSystem") {
      const file = details as FilesystemPermissionRequest;
      const key = this.#filePermission(file);
      if (!key) return false;
      permissions = [key];
      description = `${file.fileAccessType === "writable" ? "Read and change" : "Read"} this selected ${file.isDirectory ? "folder and its contents" : "file"}?\n${file.filePath}`;
    } else {
      const descriptions: Record<string, string> = {
        "clipboard-read": "Read your clipboard?",
        geolocation: "Use your location?",
        notifications: "Show notifications?",
      };
      if (!descriptions[permission]) return false;
      permissions = [permission];
      description = descriptions[permission];
    }
    if (permissions.some((key) => this.#decision(context, key) === false))
      return false;
    if (!permissions.every((key) => this.#decision(context, key) === true)) {
      if (this.#pending.has(contents)) return false;
      this.#pending.add(contents);
      try {
        const answer = await this.#prompt(context, {
          type: "question",
          title: "Website permission",
          message: description,
          detail: `${this.#label(context)}\n\nRemembered until browser permissions are reset or Grida quits.`,
          buttons: ["Block", "Allow"],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        });
        if (!this.#current(context)) return false;
        for (const key of permissions)
          this.#remember(context, key, answer.response === 1);
        if (answer.response !== 1) return false;
      } finally {
        this.#pending.delete(contents);
      }
    }
    if (!this.#current(context)) return false;
    if (permission === "media" && process.platform === "darwin") {
      for (const key of permissions) {
        if (
          !(await systemPreferences.askForMediaAccess(
            key as "camera" | "microphone"
          )) ||
          !this.#current(context)
        )
          return false;
      }
    }
    return this.#current(context);
  }

  async #choose(
    context: Context | null,
    title: string,
    choices: { id: string; label: string }[],
    note = ""
  ): Promise<string | undefined> {
    if (
      !this.#current(context) ||
      !choices.length ||
      this.#pending.has(context.contents)
    )
      return;
    this.#pending.add(context.contents);
    try {
      let page = 0;
      while (this.#current(context)) {
        const offset = page * 8;
        const slice = choices.slice(offset, offset + 8);
        const buttons = [
          "Cancel",
          ...slice.map((entry) => BrowserSitePolicy.#text(entry.label)),
        ];
        const previous =
          page > 0 ? buttons.push("Previous devices / sources") - 1 : -1;
        const next =
          offset + 8 < choices.length
            ? buttons.push("More devices / sources") - 1
            : -1;
        const answer = await this.#prompt(context, {
          type: "question",
          title,
          message: `Choose ${title.toLowerCase()}`,
          detail: `${this.#label(context)}${note ? `\n\n${note}` : ""}`,
          buttons,
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        });
        if (!this.#current(context) || answer.response === 0) return;
        if (answer.response === previous) {
          page--;
          continue;
        }
        if (answer.response === next) {
          page++;
          continue;
        }
        return slice[answer.response - 1]?.id;
      }
    } finally {
      this.#pending.delete(context.contents);
    }
  }

  static #text(raw: string): string {
    return raw
      .replace(/[\p{Cc}\p{Cf}]/gu, " ")
      .slice(0, 180)
      .replace(/&/g, "&&");
  }

  async #selectFrameDevice(
    type: "usb" | "hid",
    frame: WebFrameMain | null,
    devices: Device[]
  ): Promise<string | undefined> {
    const contents = frame && webContents.fromFrame(frame);
    return this.#selectDevice(
      type,
      contents ? this.#context(contents, frame) : null,
      devices
    );
  }

  #deviceKey(
    origin: string,
    type: DevicePermissionHandlerHandlerDetails["deviceType"],
    device: Device
  ): string {
    // Electron's deviceId/portId are the actual Chromium IDs supplied by the
    // native chooser and permission check; a name alone never identifies a grant.
    const id = "portId" in device ? device.portId : device.deviceId;
    return JSON.stringify([origin, type, id]);
  }

  async #selectDevice(
    type: DevicePermissionHandlerHandlerDetails["deviceType"],
    context: Context | null,
    devices: Device[]
  ): Promise<string | undefined> {
    const id = await this.#choose(
      context,
      `${type.toUpperCase()} device`,
      devices.map((device) => ({
        id: "portId" in device ? device.portId : device.deviceId,
        label:
          "portName" in device
            ? `${device.displayName ?? device.portName} (${device.portName})`
            : "name" in device
              ? device.name
              : (device.productName ?? device.deviceId),
      })),
      type === "serial"
        ? "Electron identifies the containing page for serial requests, rather than its requesting frame."
        : ""
    );
    if (!id || !this.#current(context)) return;
    const device = devices.find(
      (entry) => ("portId" in entry ? entry.portId : entry.deviceId) === id
    );
    if (!device) return;
    this.#devices.add(this.#deviceKey(context.origin, type, device));
    while (this.#devices.size > 500)
      this.#devices.delete(this.#devices.values().next().value!);
    return id;
  }

  async #display(
    request: DisplayMediaRequestHandlerHandlerRequest
  ): Promise<Electron.Streams> {
    const frame = request.frame;
    const contents = frame && webContents.fromFrame(frame);
    const context = contents ? this.#context(contents, frame) : null;
    if (
      !context ||
      !request.videoRequested ||
      !request.userGesture ||
      BrowserSitePolicy.#origin(request.securityOrigin) !== context.origin
    )
      return {};
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false,
    });
    if (!this.#current(context)) return {};
    const id = await this.#choose(
      context,
      "Screen or window",
      sources.map((source) => ({ id: source.id, label: source.name })),
      request.audioRequested
        ? "This chooser shares video only. System audio capture is not provided."
        : "Only the selected screen or window will be shared."
    );
    if (!this.#current(context)) return {};
    const source = sources.find((entry) => entry.id === id);
    return source ? { video: source } : {};
  }

  static #certificateFingerprint(cert: Certificate): string | null {
    try {
      // Hash the certificate's DER bytes, not its PEM representation. This is
      // the conventional SHA-256 fingerprint shown by certificate viewers.
      return new X509Certificate(cert.data).fingerprint256;
    } catch {
      return null;
    }
  }

  #certificateKey(hostname: string, fingerprint: string): string {
    return JSON.stringify([hostname.toLowerCase(), fingerprint]);
  }

  async #certificate(
    contents: WebContents,
    rawUrl: string,
    error: string,
    cert: Certificate,
    isMainFrame: boolean
  ): Promise<boolean> {
    const origin = BrowserSitePolicy.#origin(rawUrl);
    const context = this.#topContext(
      contents,
      isMainFrame ? (origin ?? undefined) : undefined
    );
    if (!context || !origin || this.#pending.has(contents)) return false;
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") return false;
    const fingerprint = BrowserSitePolicy.#certificateFingerprint(cert);
    if (!fingerprint) return false;
    const key = this.#certificateKey(url.hostname, fingerprint);
    if (this.#certificates.has(key)) return this.#current(context);
    this.#pending.add(contents);
    try {
      const answer = await this.#prompt(context, {
        type: "warning",
        title: "Website certificate",
        message: `Trust this certificate for ${url.hostname}?`,
        detail: `${isMainFrame ? "Website" : "Connection"}: ${origin}\nContaining page: ${context.embeddingOrigin}\n${BrowserSitePolicy.#text(error)}\nSHA-256: ${fingerprint}\n\nThis browser session only. This bypasses certificate validation for this exact host and certificate. Reset clears the exception; a relaunch guarantees Chromium's cached trust ends.`,
        buttons: ["Cancel", "Trust certificate"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (answer.response !== 1 || !this.#current(context)) return false;
      this.#certificates.set(key, { hostname: url.hostname, fingerprint });
      this.#certificateAccepted = true;
      while (this.#certificates.size > 100)
        this.#certificates.delete(this.#certificates.keys().next().value!);
      return true;
    } finally {
      this.#pending.delete(contents);
    }
  }
}
