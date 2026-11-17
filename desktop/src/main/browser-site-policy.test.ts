// GRIDA-SEC-016 — native website consent never authorizes an application role.
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { rootCertificates } from "node:tls";
import { beforeEach, expect, it, vi } from "vitest";
import type {
  BrowserWindow,
  Certificate,
  Session,
  WebContents,
  WebFrameMain,
} from "electron";

const native = vi.hoisted(() => ({
  prompt:
    vi.fn<
      (
        window: BrowserWindow,
        options: Electron.MessageBoxOptions
      ) => Promise<{ response: number }>
    >(),
  sources: vi.fn<() => Promise<{ id: string; name: string }[]>>(),
  media: vi.fn<(type: "camera" | "microphone") => Promise<boolean>>(),
  frames: new Map<unknown, unknown>(),
}));
vi.mock("electron", () => ({
  dialog: { showMessageBox: native.prompt },
  desktopCapturer: { getSources: native.sources },
  systemPreferences: { askForMediaAccess: native.media },
  webContents: { fromFrame: (frame: unknown) => native.frames.get(frame) },
}));
import { BrowserSitePolicy } from "./browser-site-policy";

type RequestHandler = NonNullable<
  Parameters<Session["setPermissionRequestHandler"]>[0]
>;
type CheckHandler = NonNullable<
  Parameters<Session["setPermissionCheckHandler"]>[0]
>;
type DeviceHandler = NonNullable<
  Parameters<Session["setDevicePermissionHandler"]>[0]
>;
type DisplayHandler = NonNullable<
  Parameters<Session["setDisplayMediaRequestHandler"]>[0]
>;
type CertificateHandler = NonNullable<
  Parameters<Session["setCertificateVerifyProc"]>[0]
>;

function fixture(
  url = "https://site.test/app",
  openExternal?: NonNullable<
    ConstructorParameters<typeof BrowserSitePolicy>[1]
  >["openExternal"],
  blockPrompt?: Parameters<BrowserSitePolicy["register"]>[1]["blockPrompt"]
) {
  const session = Object.assign(new EventEmitter(), {
    setPermissionRequestHandler: (handler: RequestHandler) => {
      request = handler;
    },
    setPermissionCheckHandler: (handler: CheckHandler) => {
      check = handler;
    },
    setDevicePermissionHandler: (handler: DeviceHandler) => {
      device = handler;
    },
    setDisplayMediaRequestHandler: (handler: DisplayHandler) => {
      display = handler;
    },
    setCertificateVerifyProc: (handler: CertificateHandler) => {
      certificate = handler;
    },
    closeAllConnections: vi
      .fn<() => Promise<void>>()
      .mockResolvedValue(undefined),
  });
  let request!: RequestHandler;
  let check!: CheckHandler;
  let device!: DeviceHandler;
  let display!: DisplayHandler;
  let certificate!: CertificateHandler;
  const top = {
    url,
    origin: new URL(url).origin,
    detached: false,
    parent: null,
    framesInSubtree: [] as unknown[],
  };
  top.framesInSubtree.push(top);
  let focused = true;
  let live = true;
  const contents = Object.assign(new EventEmitter(), {
    session,
    mainFrame: top,
    isDestroyed: () => false,
    isFocused: () => focused,
  }) as unknown as WebContents;
  const window = {
    isDestroyed: () => false,
    isFocused: () => true,
    webContents: { isDestroyed: () => false },
  } as unknown as BrowserWindow;
  const policy = new BrowserSitePolicy(session as unknown as Session, {
    openExternal,
  });
  policy.register(contents, { window, isLive: () => live, blockPrompt });
  native.frames.set(top, contents);
  return {
    session,
    contents,
    top,
    policy,
    focus: (value: boolean) => {
      focused = value;
    },
    live: (value: boolean) => {
      live = value;
    },
    request: (
      permission: Parameters<RequestHandler>[1],
      extra: Record<string, unknown> = {}
    ) =>
      new Promise<boolean>((resolve) =>
        request(contents, permission, resolve, {
          isMainFrame: true,
          requestingUrl: top.url,
          ...extra,
        })
      ),
    check: (
      permission: Parameters<CheckHandler>[1],
      origin = "https://site.test",
      details: Partial<Parameters<CheckHandler>[3]> = {},
      worker = false
    ) =>
      check(worker ? null : contents, permission, origin, {
        isMainFrame: true,
        ...details,
      }),
    device: (
      origin: string,
      id: string | Record<string, unknown>,
      type: "usb" | "hid" | "serial" = "usb"
    ) =>
      device({
        origin,
        deviceType: type,
        device:
          typeof id === "object"
            ? id
            : type === "serial"
              ? { portId: id, portName: id }
              : { deviceId: id },
      } as unknown as Parameters<DeviceHandler>[0]),
    display: (extra: Partial<Parameters<DisplayHandler>[0]> = {}) =>
      new Promise<Electron.Streams>((resolve) =>
        display(
          {
            frame: top as unknown as WebFrameMain,
            securityOrigin: "https://site.test",
            videoRequested: true,
            audioRequested: false,
            userGesture: true,
            ...extra,
          },
          resolve
        )
      ),
    certificate: (hostname: string, cert: Pick<Certificate, "data">) =>
      new Promise<number>((resolve) =>
        certificate(
          {
            hostname,
            certificate: cert as Certificate,
          } as Parameters<CertificateHandler>[0],
          resolve
        )
      ),
    event: () => ({ preventDefault: vi.fn<() => void>() }),
  };
}

beforeEach(() => {
  native.prompt.mockReset().mockResolvedValue({ response: 1 });
  native.sources.mockReset().mockResolvedValue([]);
  native.media.mockReset().mockResolvedValue(true);
  native.frames.clear();
});

it("reports background permission blockers without showing native prompts", async () => {
  const block = vi.fn<(kind: "permission" | "certificate") => void>();
  const browser = fixture(undefined, undefined, block);
  expect(browser.check("fullscreen")).toBe(false);
  expect(await browser.request("geolocation")).toBe(false);
  expect(await browser.display()).toEqual({});
  expect(block.mock.calls).toEqual([["permission"], ["permission"]]);
  expect(native.prompt).not.toHaveBeenCalled();
  expect(native.sources).not.toHaveBeenCalled();
  expect(native.media).not.toHaveBeenCalled();
});

it("allows ordinary active-page writes, fullscreen and pointer lock without prompting", async () => {
  const browser = fixture();
  for (const permission of [
    "clipboard-sanitized-write",
    "fullscreen",
    "pointerLock",
  ] as const) {
    expect(browser.check(permission)).toBe(true);
    expect(await browser.request(permission)).toBe(true);
  }
  browser.focus(false);
  expect(await browser.request("fullscreen")).toBe(false);
  expect(browser.check("clipboard-sanitized-write", undefined, {}, true)).toBe(
    false
  );
  expect(native.prompt).not.toHaveBeenCalled();
});

it("remembers per-origin consent, permits a worker check, and denies unknown privileges", async () => {
  const browser = fixture();
  expect(browser.check("notifications")).toBe(false);
  expect(await browser.request("notifications")).toBe(true);
  expect(browser.check("notifications", undefined, {}, true)).toBe(true);
  expect(
    browser.check("notifications", "https://elsewhere.test", {}, true)
  ).toBe(false);
  expect(await browser.request("notifications")).toBe(true);
  expect(await browser.request("unknown")).toBe(false);
  expect(await browser.request("openExternal")).toBe(false);
  expect(native.prompt).toHaveBeenCalledTimes(1);
});

it("records a denial and keeps website permissions separate", async () => {
  const browser = fixture();
  native.prompt.mockResolvedValue({ response: 0 });
  expect(await browser.request("clipboard-read")).toBe(false);
  native.prompt.mockResolvedValue({ response: 1 });
  expect(await browser.request("clipboard-read")).toBe(false);
  expect(await browser.request("geolocation")).toBe(true);
  expect(native.prompt).toHaveBeenCalledTimes(2);
});

it("labels the requesting frame and embedding origin and scopes its saved permission", async () => {
  const browser = fixture();
  const child = {
    url: "https://embedded.test/frame",
    origin: "https://embedded.test",
    detached: false,
    parent: browser.top,
  };
  browser.top.framesInSubtree.push(child);
  expect(
    await browser.request("notifications", {
      isMainFrame: false,
      requestingUrl: child.url,
    })
  ).toBe(true);
  expect(native.prompt.mock.calls[0][1].detail).toContain(
    "https://embedded.test\nEmbedded in https://site.test"
  );
  expect(
    browser.check("notifications", "https://embedded.test", {
      isMainFrame: false,
      embeddingOrigin: "https://site.test",
    })
  ).toBe(true);
  expect(
    browser.check("notifications", "https://embedded.test", {
      isMainFrame: false,
      embeddingOrigin: "https://other.test",
    })
  ).toBe(false);
});

it.each([
  "about:blank",
  "about:srcdoc",
  "blob:https://site.test/generated-document",
])(
  "uses the actual inherited origin of %s for website consent",
  async (url) => {
    const browser = fixture(url);
    browser.top.origin = "https://site.test";
    expect(await browser.request("notifications")).toBe(true);
    expect(browser.check("notifications")).toBe(true);
    expect(native.prompt.mock.calls[0][1].detail).toContain(
      "https://site.test"
    );
    expect(browser.policy.read().permissions).toMatchObject([
      { origin: "https://site.test", embeddingOrigin: "https://site.test" },
    ]);
  }
);

it("uses a generated embedding frame's actual origin rather than its location", async () => {
  const browser = fixture();
  const parent = {
    url: "blob:https://container.test/generated-document",
    origin: "https://container.test",
    detached: false,
    parent: browser.top,
  };
  const child = {
    url: "https://embedded.test/frame",
    origin: "https://embedded.test",
    detached: false,
    parent,
  };
  browser.top.framesInSubtree.push(parent, child);
  expect(
    await browser.request("notifications", {
      isMainFrame: false,
      requestingUrl: child.url,
    })
  ).toBe(true);
  expect(native.prompt.mock.calls[0][1].detail).toContain(
    "https://embedded.test\nEmbedded in https://container.test"
  );
  expect(
    browser.check("notifications", "https://embedded.test", {
      isMainFrame: false,
      embeddingOrigin: "https://container.test",
    })
  ).toBe(true);
});

it.each(["requester", "embedder"])(
  "does not turn an opaque %s's HTTPS location into permission authority",
  async (opaque) => {
    const browser = fixture();
    const child = {
      url: "https://embedded.test/frame",
      origin: opaque === "requester" ? "null" : "https://embedded.test",
      detached: false,
      parent: browser.top,
    };
    if (opaque === "embedder") browser.top.origin = "null";
    browser.top.framesInSubtree.push(child);
    expect(
      await browser.request("notifications", {
        isMainFrame: false,
        requestingUrl: child.url,
      })
    ).toBe(false);
    expect(native.prompt).not.toHaveBeenCalled();
    expect(browser.policy.read().permissions).toEqual([]);
  }
);

it.each(["requester", "embedder"])(
  "rechecks the actual %s origin before accepting a pending choice",
  async (changed) => {
    const browser = fixture();
    const child = {
      url: "https://embedded.test/frame",
      origin: "https://embedded.test",
      detached: false,
      parent: browser.top,
    };
    browser.top.framesInSubtree.push(child);
    let answer!: (value: { response: number }) => void;
    native.prompt.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      })
    );
    const pending = browser.request("notifications", {
      isMainFrame: false,
      requestingUrl: child.url,
    });
    if (changed === "requester") child.origin = "null";
    else browser.top.origin = "https://replacement.test";
    answer({ response: 1 });
    expect(await pending).toBe(false);
    expect(browser.policy.read().permissions).toEqual([]);
  }
);

it("does not guess among duplicate requesting-frame URLs", async () => {
  const browser = fixture();
  browser.top.framesInSubtree.push(
    {
      url: "https://embedded.test/frame",
      origin: "https://embedded.test",
      detached: false,
      parent: browser.top,
    },
    {
      url: "https://embedded.test/frame",
      origin: "https://embedded.test",
      detached: false,
      parent: browser.top,
    }
  );
  expect(
    await browser.request("notifications", {
      isMainFrame: false,
      requestingUrl: "https://embedded.test/frame",
    })
  ).toBe(false);
  expect(native.prompt).not.toHaveBeenCalled();
});

it.each(["owner", "navigation", "reset", "unregister"])(
  "discards consent after %s changes during a prompt",
  async (change) => {
    const browser = fixture();
    let answer!: (value: { response: number }) => void;
    native.prompt.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      })
    );
    const result = browser.request("notifications");
    if (change === "owner") browser.live(false);
    if (change === "navigation")
      browser.contents.emit("did-start-navigation", {
        isSameDocument: false,
        frame: browser.top,
      });
    if (change === "reset") await browser.policy.reset();
    if (change === "unregister") browser.policy.unregister(browser.contents);
    expect(native.prompt.mock.calls[0][1].signal?.aborted).toBe(
      change !== "owner"
    );
    answer({ response: 1 });
    expect(await result).toBe(false);
    expect(browser.policy.read().permissions).toEqual([]);
  }
);

it("prompts for camera and microphone, with separate saved decisions", async () => {
  const browser = fixture();
  expect(
    await browser.request("media", {
      mediaTypes: ["video"],
      securityOrigin: "https://site.test",
    })
  ).toBe(true);
  expect(browser.check("media", undefined, { mediaType: "video" })).toBe(true);
  expect(browser.check("media", undefined, { mediaType: "audio" })).toBe(false);
  expect(await browser.request("media", { mediaTypes: ["audio"] })).toBe(true);
  expect(await browser.request("media", { mediaTypes: [] })).toBe(false);
  expect(
    await browser.request("media", {
      mediaTypes: ["video"],
      securityOrigin: "https://other.test",
    })
  ).toBe(false);
});

it("confirms Chromium's exact selected file access without inheriting any workspace path", async () => {
  const browser = fixture();
  const selected = {
    filePath: "/tmp/selected.txt",
    fileAccessType: "readable",
    isDirectory: false,
  };
  expect(
    await browser.request("fileSystem", { ...selected, isMainFrame: false })
  ).toBe(true);
  expect(
    browser.check(
      "fileSystem",
      undefined,
      selected as Partial<Electron.PermissionCheckHandlerHandlerDetails>
    )
  ).toBe(true);
  expect(
    browser.check("fileSystem", undefined, {
      ...selected,
      filePath: "/tmp/other.txt",
      fileAccessType: "readable",
    })
  ).toBe(false);
  expect(
    browser.check("fileSystem", undefined, {
      ...selected,
      fileAccessType: "writable",
    })
  ).toBe(false);
  expect(await browser.request("fileSystem")).toBe(false);
  expect(JSON.stringify(browser.policy.read())).not.toContain(
    "/tmp/selected.txt"
  );
  const restricted = vi.fn<(action: string) => void>();
  browser.session.emit(
    "file-system-access-restricted",
    browser.event(),
    { origin: "https://site.test", path: "/private" },
    restricted
  );
  expect(restricted).toHaveBeenCalledWith("deny");
});

it("selects the actual USB device and never grants another device with the same name", async () => {
  const browser = fixture();
  const event = browser.event();
  native.prompt.mockResolvedValue({ response: 2 });
  const id = await new Promise((resolve) =>
    browser.session.emit(
      "select-usb-device",
      event,
      {
        frame: browser.top,
        deviceList: [
          { deviceId: "one", productName: "Board" },
          { deviceId: "two", productName: "Board" },
        ],
      },
      resolve
    )
  );
  expect(id).toBe("two");
  expect(event.preventDefault).toHaveBeenCalled();
  expect(browser.device("https://site.test", "two")).toBe(true);
  expect(browser.device("https://site.test", "one")).toBe(false);
  expect(browser.device("https://other.test", "two")).toBe(false);
});

it("selects actual HID, serial and Bluetooth IDs through native dialogs", async () => {
  const browser = fixture();
  const hid = await new Promise((resolve) =>
    browser.session.emit(
      "select-hid-device",
      browser.event(),
      {
        frame: browser.top,
        deviceList: [
          {
            deviceId: "hid-one",
            name: "Controller",
            vendorId: 1000,
            productId: 2000,
            serialNumber: "hid-serial",
          },
        ],
      },
      resolve
    )
  );
  expect(hid).toBe("hid-one");
  expect(
    browser.device(
      "https://site.test",
      {
        name: "Controller",
        vendorId: 1000,
        productId: 2000,
        serialNumber: "hid-serial",
      },
      "hid"
    )
  ).toBe(true);
  const serial = await new Promise((resolve) =>
    browser.session.emit(
      "select-serial-port",
      browser.event(),
      [
        {
          portId: "port-one",
          portName: "/dev/tty.test",
          deviceInstanceId: "instance-one",
          vendorId: "1000",
          productId: "2000",
          serialNumber: "serial-one",
          usbDriverName: "driver-one",
        },
      ],
      browser.contents,
      resolve
    )
  );
  expect(serial).toBe("port-one");
  expect(
    browser.device(
      "https://site.test",
      process.platform === "win32"
        ? { device_instance_id: "instance-one" }
        : {
            vendor_id: 1000,
            product_id: 2000,
            serial_number: "serial-one",
            usb_driver: "driver-one",
          },
      "serial"
    )
  ).toBe(true);
  const bluetooth = await new Promise((resolve) =>
    browser.contents.emit(
      "select-bluetooth-device",
      browser.event(),
      [{ deviceId: "blue-one", deviceName: "Speaker" }],
      resolve
    )
  );
  expect(bluetooth).toBe("blue-one");
});

it.each(["usb", "hid", "serial"] as const)(
  "forgets only the matching %s origin/device grant on native revocation",
  async (type) => {
    const browser = fixture();
    const devices = ["one", "two"].map((id) =>
      type === "serial"
        ? {
            portId: id,
            portName: id,
            deviceInstanceId: `instance-${id}`,
            vendorId: "1000",
            productId: "2000",
            serialNumber: id,
            usbDriverName: "driver",
          }
        : {
            deviceId: id,
            name: "Controller",
            vendorId: 1000,
            productId: 2000,
            serialNumber: id,
          }
    );
    const choose = () =>
      new Promise((resolve) => {
        if (type === "serial")
          browser.session.emit(
            "select-serial-port",
            browser.event(),
            devices,
            browser.contents,
            resolve
          );
        else
          browser.session.emit(
            `select-${type}-device`,
            browser.event(),
            { frame: browser.top, deviceList: devices },
            resolve
          );
      });
    await choose();
    native.prompt.mockResolvedValueOnce({ response: 2 });
    await choose();
    const permission = (id: string) =>
      type === "serial"
        ? process.platform === "win32"
          ? { device_instance_id: `instance-${id}` }
          : {
              vendor_id: 1000,
              product_id: 2000,
              serial_number: id,
              usb_driver: "driver",
            }
        : type === "hid"
          ? {
              name: "Controller",
              vendorId: 1000,
              productId: 2000,
              serialNumber: id,
            }
          : { deviceId: id };
    expect(browser.device("https://site.test", permission("one"), type)).toBe(
      true
    );
    expect(browser.device("https://site.test", permission("two"), type)).toBe(
      true
    );
    const details =
      type === "serial" ? { port: devices[0] } : { device: devices[0] };
    browser.session.emit(
      type === "serial" ? "serial-port-revoked" : `${type}-device-revoked`,
      browser.event(),
      { ...details, origin: "https://other.test" }
    );
    expect(browser.device("https://site.test", permission("one"), type)).toBe(
      true
    );
    browser.session.emit(
      type === "serial" ? "serial-port-revoked" : `${type}-device-revoked`,
      browser.event(),
      { ...details, origin: "https://site.test" }
    );
    expect(browser.device("https://site.test", permission("one"), type)).toBe(
      false
    );
    expect(browser.device("https://site.test", permission("two"), type)).toBe(
      true
    );
  }
);

it("rejects incomplete HID/serial check identities instead of matching absent chooser IDs", () => {
  const browser = fixture();
  for (const type of ["hid", "serial"] as const) {
    expect(browser.device("https://site.test", {}, type)).toBe(false);
    expect(
      browser.device(
        "https://site.test",
        { deviceId: "chooser", portId: "chooser" },
        type
      )
    ).toBe(false);
  }
});

it("keeps restart required after a native device choice even after consent maps are cleared", async () => {
  const browser = fixture();
  await new Promise((resolve) =>
    browser.session.emit(
      "select-usb-device",
      browser.event(),
      {
        frame: browser.top,
        deviceList: [{ deviceId: "ephemeral", productName: "Board" }],
      },
      resolve
    )
  );
  expect(browser.policy.read().selectedDevices).toBe(1);
  expect(await browser.policy.resetPermissions()).toEqual({
    reloadRequired: true,
    certificateRestartRequired: false,
    deviceRestartRequired: true,
  });
  expect(browser.policy.read().selectedDevices).toBe(0);
  expect(browser.device("https://site.test", "ephemeral")).toBe(false);
  expect((await browser.policy.resetPermissions()).deviceRestartRequired).toBe(
    true
  );
});

it("leaves ephemeral HID interface permissions with Chromium instead of creating a second grant", async () => {
  const browser = fixture();
  expect(
    await new Promise((resolve) =>
      browser.session.emit(
        "select-hid-device",
        browser.event(),
        {
          frame: browser.top,
          deviceList: [
            {
              deviceId: "physical-device",
              guid: "interface-one",
              name: "Controller",
              vendorId: 1000,
              productId: 2000,
            },
          ],
        },
        resolve
      )
    )
  ).toBe("physical-device");
  expect(
    browser.device(
      "https://site.test",
      {
        guid: "interface-one",
        name: "Controller",
        vendorId: 1000,
        productId: 2000,
      },
      "hid"
    )
  ).toBe(false);
  expect(browser.policy.read().selectedDevices).toBe(0);
  expect((await browser.policy.resetPermissions()).deviceRestartRequired).toBe(
    true
  );
});

it("waits for a real Bluetooth scan result and cancels waiting discovery on reset", async () => {
  const browser = fixture();
  const first = vi.fn<(id: string) => void>();
  browser.contents.emit("select-bluetooth-device", browser.event(), [], first);
  expect(first).not.toHaveBeenCalled();
  expect(native.prompt).not.toHaveBeenCalled();
  const result = await new Promise((resolve) =>
    browser.contents.emit(
      "select-bluetooth-device",
      browser.event(),
      [{ deviceId: "found", deviceName: "Board" }],
      resolve
    )
  );
  expect(result).toBe("found");
  browser.contents.emit("select-bluetooth-device", browser.event(), [], first);
  await browser.policy.reset();
  expect(first).toHaveBeenCalledWith("");
});

it("shares only a selected actual display source and reports video-only capture", async () => {
  const browser = fixture();
  const first = { id: "screen:1", name: "Screen 1" };
  const second = { id: "window:2", name: "App window" };
  native.sources.mockResolvedValue([first, second]);
  native.prompt.mockResolvedValue({ response: 2 });
  expect(await browser.display({ audioRequested: true })).toEqual({
    video: second,
  });
  expect(native.prompt.mock.calls[0][1].detail).toContain("video only");
  native.prompt.mockResolvedValue({ response: 0 });
  expect(await browser.display()).toEqual({});
  expect(await browser.display({ userGesture: false })).toEqual({});
});

it("rejects a display choice after the initiating frame navigates", async () => {
  const browser = fixture();
  let answer!: (value: { response: number }) => void;
  native.sources.mockResolvedValue([{ id: "screen:1", name: "Screen 1" }]);
  native.prompt.mockReturnValue(
    new Promise((resolve) => {
      answer = resolve;
    })
  );
  const result = browser.display();
  await vi.waitFor(() => expect(native.prompt).toHaveBeenCalled());
  browser.contents.emit("did-start-navigation", {
    isSameDocument: false,
    frame: browser.top,
  });
  answer({ response: 1 });
  expect(await result).toEqual({});
});

it("trusts only an explicitly accepted host and certificate, including initial blank pages", async () => {
  const browser = fixture("about:blank");
  // Public CA certificates are bundled with Node; no fixture private key is used.
  const cert = {
    data: rootCertificates[0],
    fingerprint: "unused-native-format",
  };
  const changedCert = { data: rootCertificates[1] };
  const der = Buffer.from(
    cert.data.replace(/-----[A-Z ]+-----|\s/g, ""),
    "base64"
  );
  const fingerprint = createHash("sha256")
    .update(der)
    .digest("hex")
    .toUpperCase()
    .match(/.{2}/g)!
    .join(":");
  expect(await browser.certificate("localhost", cert)).toBe(-3);
  const event = browser.event();
  const trusted = await new Promise((resolve) =>
    browser.contents.emit(
      "certificate-error",
      event,
      "https://localhost:4443/",
      "net::ERR_CERT_AUTHORITY_INVALID",
      cert,
      resolve,
      true
    )
  );
  expect(trusted).toBe(true);
  expect(event.preventDefault).toHaveBeenCalled();
  expect(native.prompt.mock.lastCall![1].detail).toContain(
    `SHA-256: ${fingerprint}`
  );
  expect(browser.policy.read().certificateExceptions).toEqual([
    { hostname: "localhost", fingerprint },
  ]);
  expect(await browser.certificate("localhost", cert)).toBe(0);
  expect(
    await browser.certificate("LOCALHOST", {
      data: cert.data.replace(/\n/g, "\r\n"),
    })
  ).toBe(0);
  expect(await browser.certificate("other.test", cert)).toBe(-3);
  expect(await browser.certificate("localhost", changedCert)).toBe(-3);
  expect(await browser.policy.resetPermissions()).toEqual({
    reloadRequired: true,
    certificateRestartRequired: true,
    deviceRestartRequired: false,
  });
  expect(await browser.certificate("localhost", cert)).toBe(-3);
  expect(browser.session.closeAllConnections).toHaveBeenCalledOnce();
  expect(
    (await browser.policy.resetPermissions()).certificateRestartRequired
  ).toBe(true);
});

it("rejects malformed certificates without prompting or adding a trust exception", async () => {
  const browser = fixture();
  const cert = { data: "not a certificate" };
  expect(await browser.certificate("site.test", cert)).toBe(-3);
  expect(
    await new Promise((resolve) =>
      browser.contents.emit(
        "certificate-error",
        browser.event(),
        "https://site.test/",
        "net::ERR_CERT_AUTHORITY_INVALID",
        cert,
        resolve,
        true
      )
    )
  ).toBe(false);
  expect(native.prompt).not.toHaveBeenCalled();
  expect(browser.policy.read().certificateExceptions).toEqual([]);
});

it("never prompts or grants an unregistered or stale guest", async () => {
  const browser = fixture();
  browser.policy.unregister(browser.contents);
  expect(await browser.request("notifications")).toBe(false);
  expect(browser.check("fullscreen")).toBe(false);
  expect(native.prompt).not.toHaveBeenCalled();
});

it("denies Chromium external launch and delegates only exact registered frame context to Main", async () => {
  const openExternal =
    vi.fn<
      NonNullable<
        NonNullable<
          ConstructorParameters<typeof BrowserSitePolicy>[1]
        >["openExternal"]
      >
    >();
  const browser = fixture(undefined, openExternal);
  const child = {
    url: "https://embedded.test/frame",
    origin: "https://embedded.test",
    detached: false,
    parent: browser.top,
  };
  browser.top.framesInSubtree.push(child);
  expect(
    await browser.request("openExternal", {
      isMainFrame: false,
      requestingUrl: child.url,
      externalURL: "customapp://open/item",
    })
  ).toBe(false);
  expect(openExternal).toHaveBeenCalledWith(
    browser.contents,
    expect.objectContaining({
      url: "customapp://open/item",
      origin: "https://embedded.test",
    })
  );
  const request = openExternal.mock.calls[0][1];
  expect(request.isCurrent()).toBe(true);
  child.detached = true;
  expect(request.isCurrent()).toBe(false);
  expect(
    await browser.request("openExternal", {
      externalURL: "grida://native/private",
    })
  ).toBe(false);
  expect(openExternal).toHaveBeenCalledOnce();
});
