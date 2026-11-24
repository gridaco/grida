// GRIDA-SEC-004 / GRIDA-SEC-005 / GRIDA-SEC-014 — pin effective profile paths and identity.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { App } from "electron";
import { expect, it, vi } from "vitest";
import { DesktopProfile } from "./desktop-profile";

function macHost(root: string, explicitBrowser = "") {
  const host = {
    platform: "darwin" as const,
    home: path.join(root, "home"),
    environment: {},
    argv: [],
    resourcesPath: path.join(root, "app-resources"),
  };
  const locations: Record<string, string> = {
    home: host.home,
    appData: path.join(host.home, "Library", "Application Support"),
    documents: path.join(host.home, "Documents"),
    temp: path.join(root, "temp"),
  };
  const appPath = path.join(root, "source-desktop");
  const app = {
    getPath: (name: Parameters<App["getPath"]>[0]) => locations[name],
    getAppPath: () => appPath,
    setName: vi.fn<App["setName"]>((name) => {
      locations.userData =
        explicitBrowser || path.join(locations.appData, name);
      locations.sessionData = locations.userData;
    }),
    setPath: vi.fn<App["setPath"]>((name, value) => {
      locations[name] = value;
    }),
    commandLine: { getSwitchValue: () => explicitBrowser },
  };
  return { host, app, locations, appPath };
}

it.skipIf(process.platform === "win32").each([
  {
    label: "packaged Stable",
    packaged: true,
    insiders: false,
    name: "Grida",
    media: "Grida",
    url: "https://grida.co",
    scheme: "grida",
  },
  {
    label: "packaged Insiders",
    packaged: true,
    insiders: true,
    name: "Grida",
    media: "Grida Insiders",
    url: "http://localhost:3000",
    scheme: "grida-dev",
  },
  {
    label: "source Dev",
    packaged: false,
    insiders: false,
    name: "Grida Dev",
    media: "Grida Dev",
    url: "http://localhost:3000",
    scheme: "grida-dev",
  },
  {
    label: "source Insiders",
    packaged: false,
    insiders: true,
    name: "Grida Insiders Dev",
    media: "Grida Insiders Dev",
    url: "http://localhost:3000",
    scheme: "grida-dev",
  },
])(
  "preserves the identity and effective paths of $label",
  async ({ packaged, insiders, name, media, url, scheme }) => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "grida-desktop-profile-")
    );
    try {
      const { host, app, locations, appPath } = macHost(root);
      const globalHome = path.join(root, "shared-grida-home");
      const identity = DesktopProfile.launch(packaged, insiders, host);
      DesktopProfile.applyBrowserProfile(app, identity);
      const profile = DesktopProfile.resolve(app, identity, {
        ...host,
        environment: { GRIDA_HOME: globalHome },
      });
      const browser = packaged
        ? path.join(locations.appData, "Grida")
        : path.join(locations.appData, name, "Browser");
      const gridaHome = packaged
        ? globalHome
        : path.join(locations.appData, name, "Home");
      expect(app.setName).toHaveBeenCalledExactlyOnceWith(name);
      expect(app.setPath.mock.calls).toEqual(
        packaged
          ? []
          : [
              ["userData", browser],
              ["sessionData", browser],
            ]
      );
      expect(profile).toEqual({
        isPackaged: packaged,
        isInsiders: insiders,
        appName: name,
        editorBaseUrl: url,
        deepLinkScheme: scheme,
        nativeChat: "ordinary",
        agentDisabled: false,
        userHome: host.home,
        userData: browser,
        sessionData: browser,
        gridaHome,
        configHome: globalHome,
        providerHome: gridaHome,
        agentData: path.join(gridaHome, "agent"),
        agentDataOverride: undefined,
        mediaRoot: path.join(locations.appData, media, "Media"),
        documents: locations.documents,
        projectsRoot: path.join(locations.documents, `${name} Projects`),
        temp: locations.temp,
        resourcesPath: packaged
          ? host.resourcesPath
          : path.join(appPath, ".native-resources"),
        catalogueDirectory: path.join(browser, "model-catalogue"),
      });
      expect(Object.isFrozen(profile)).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }
);

it.skipIf(process.platform === "win32")(
  "preserves an explicit Electron browser path and restricts preview path overrides to preview mode",
  () => {
    const root = path.resolve(os.tmpdir(), "grida-preview-fixture");
    const browser = path.join(root, "browser");
    const agent = path.join(root, "agent");
    const { host, app, locations } = macHost(root, browser);
    const identity = DesktopProfile.launch(false, false, host);
    DesktopProfile.applyBrowserProfile(app, identity);
    expect(app.setPath).not.toHaveBeenCalled();
    const explicit = {
      ...host,
      environment: { GRIDA_AGENT_USER_DATA: agent },
    };
    const ordinary = DesktopProfile.resolve(app, identity, explicit);
    expect(ordinary).toMatchObject({
      nativeChat: "ordinary",
      userData: browser,
      sessionData: browser,
      agentData: agent,
      configHome: path.join(host.home, ".grida"),
      providerHome: agent,
      mediaRoot: path.join(locations.appData, "Grida Dev", "Media"),
      projectsRoot: path.join(locations.documents, "Grida Dev Projects"),
      temp: locations.temp,
      catalogueDirectory: path.join(browser, "model-catalogue"),
    });
    expect(
      DesktopProfile.resolve(
        app,
        DesktopProfile.launch(false, false, {
          ...host,
          defaultApp: true,
          argv: ["--native-chat"],
        }),
        explicit
      )
    ).toMatchObject({
      nativeChat: "preview",
      userData: browser,
      sessionData: browser,
      agentData: agent,
      configHome: path.join(host.home, ".grida"),
      providerHome: agent,
      mediaRoot: path.join(root, "media"),
      projectsRoot: path.join(root, "projects", "Grida Projects"),
      temp: path.join(root, "temp"),
      catalogueDirectory: path.join(agent, "model-catalogue"),
    });
  }
);

it.skipIf(process.platform === "win32")(
  "uses the default for an empty Grida home and refuses a relative override",
  () => {
    const { host, app } = macHost(path.resolve(os.tmpdir(), "grida-profile"));
    const launch = DesktopProfile.launch(true, false, host);
    DesktopProfile.applyBrowserProfile(app, launch);
    expect(
      DesktopProfile.resolve(app, launch, {
        ...host,
        environment: { GRIDA_HOME: "" },
      }).configHome
    ).toBe(path.join(host.home, ".grida"));
    expect(() =>
      DesktopProfile.resolve(app, launch, {
        ...host,
        environment: { GRIDA_HOME: "relative" },
      })
    ).toThrow("config_home_must_be_absolute");
  }
);

it.each([
  {
    platform: "darwin",
    insiders: false,
    defaultApp: false,
    argv: [],
    mode: "ordinary",
  },
  {
    platform: "linux",
    insiders: true,
    defaultApp: false,
    argv: [],
    mode: "ordinary",
  },
  {
    platform: "win32",
    insiders: false,
    defaultApp: false,
    argv: [],
    mode: "disabled",
  },
  {
    platform: "darwin",
    insiders: true,
    defaultApp: false,
    argv: ["--native-chat"],
    mode: "preview",
  },
  {
    platform: "darwin",
    insiders: false,
    defaultApp: false,
    argv: ["--native-chat"],
    mode: "disabled",
  },
  {
    platform: "darwin",
    insiders: false,
    defaultApp: true,
    argv: ["--native-chat"],
    mode: "preview",
  },
  {
    platform: "darwin",
    insiders: true,
    defaultApp: true,
    argv: ["--native-chat", "--disable-agent"],
    mode: "disabled",
  },
  {
    platform: "linux",
    insiders: false,
    defaultApp: true,
    argv: ["--native-chat-provider=chatgpt"],
    mode: "disabled",
  },
] as const)(
  "resolves native chat on $platform with $argv as $mode",
  ({ insiders, ...input }) => {
    expect(DesktopProfile.launch(true, insiders, input).nativeChat).toBe(
      input.mode
    );
  }
);

it.each([
  {
    platform: "win32",
    home: "C:\\Users\\ada",
    environment: { LOCALAPPDATA: "D:\\LocalData" },
    insiders: false,
    media: "D:\\LocalData\\Grida\\Media",
  },
  {
    platform: "win32",
    home: "C:\\Users\\ada",
    environment: {},
    insiders: true,
    media: "C:\\Users\\ada\\AppData\\Local\\Grida Insiders\\Media",
  },
  {
    platform: "linux",
    home: "/home/ada",
    environment: { XDG_DATA_HOME: "/mnt/app-data" },
    insiders: false,
    media: "/mnt/app-data/grida/media",
  },
  {
    platform: "linux",
    home: "/home/ada",
    environment: { XDG_DATA_HOME: "relative-data" },
    insiders: true,
    media: "/home/ada/.local/share/grida-insiders/media",
  },
] as const)(
  "preserves the packaged $platform media path $media",
  ({ insiders, media, ...host }) => {
    const app = { getPath: () => host.home, getAppPath: () => host.home };
    const profile = DesktopProfile.resolve(
      app,
      DesktopProfile.launch(true, insiders),
      {
        ...host,
        resourcesPath: host.home,
      }
    );
    expect(profile.mediaRoot).toBe(media);
  }
);

it("rejects a relative home for packaged media", () => {
  const { app, host } = macHost(os.tmpdir());
  app.setName("Grida");
  expect(() =>
    DesktopProfile.resolve(app, DesktopProfile.launch(true, false), {
      ...host,
      home: "relative-home",
    })
  ).toThrow("media-home-must-be-absolute");
});
