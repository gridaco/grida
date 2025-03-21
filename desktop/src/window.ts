import {
  BrowserWindow,
  shell,
  type BaseWindowConstructorOptions,
} from "electron";
import path from "node:path";

const TITLE_BAR_HEIGHT = 44;

const trafficLightPosition = {
  x: 14,
  y: 14,
} as const;

const WINDOW_ICON: { [key: string]: string | null } = {
  aix: null,
  android: null,
  darwin: null,
  freebsd: null,
  haiku: null,
  linux: path.join(__dirname, "../images/icon.png"),
  openbsd: null,
  win32: path.join(__dirname, "../images/icon.ico"),
  cygwin: null,
  netbsd: null,
};

function get_window_constructor_options(): BaseWindowConstructorOptions {
  const icon = WINDOW_ICON[process.platform];
  const size = {
    width: 1440,
    height: 960,
    minWidth: 384,
    minHeight: 384,
  };
  switch (process.platform) {
    case "darwin": {
      return {
        icon,
        titleBarStyle: "hidden",
        trafficLightPosition,
        ...size,
      };
    }
    case "linux":
      return {
        icon,
        titleBarStyle: "hidden",
        titleBarOverlay: {
          height: TITLE_BAR_HEIGHT - 1,
          // linux does not support transparent title bars
          color: "#ffff",
        },
        ...size,
      };
    case "win32": {
      return {
        icon,
        titleBarStyle: "hidden",
        titleBarOverlay: {
          height: TITLE_BAR_HEIGHT,
          color: "#00000000",
        },
        ...size,
      };
    }
    default: {
      return {
        icon,
        titleBarStyle: "default",
        ...size,
      };
    }
  }
}

function register_window_hooks(
  window: BrowserWindow,
  { baseUrl }: { baseUrl: string }
) {
  window.webContents.on("will-prevent-unload", (event) => {
    // Allow the window to close even if the page tries to block it.
    event.preventDefault();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    // open all target="_blank" links in the user's default browser
    shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    const origin = window.webContents.getURL();
    if (shouldOpenExternally(baseUrl, origin, url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

export default function create_main_window({ baseUrl }: { baseUrl: string }) {
  const window = new BrowserWindow({
    ...get_window_constructor_options(),
    title: "Grida",
    webPreferences: {
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  window.loadURL(`${baseUrl}/dashboard`);

  register_window_hooks(window, { baseUrl });

  return window;
}

export function create_canvas_playground_window({
  baseUrl,
}: {
  baseUrl: string;
}) {
  const window = new BrowserWindow({
    ...get_window_constructor_options(),
    title: "Playground",
    webPreferences: {
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  window.loadURL(`${baseUrl}/canvas`);

  register_window_hooks(window, { baseUrl });

  return window;
}

export function create_login_window() {
  const window = new BrowserWindow({
    title: "Grida",
    titleBarStyle: "hidden",
    trafficLightPosition,
    width: 292,
    height: 438,
    backgroundColor: "#171717", // bg-neutral-900
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    window.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  return window;
}

function shouldOpenExternally(baseUrl: string, origin: string, target: string) {
  // if the redirect is triggered by the sign-in page, allow it
  if (origin.includes("/sign-in")) return false;
  if (origin.includes("/insiders/auth")) return false;
  // remove me when auth deeplinking is implemented
  if (target.includes("accounts.google.com")) return false;

  // need some more handling
  if (target.startsWith(baseUrl)) {
    return false;
  }

  return true;
}
