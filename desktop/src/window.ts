import {
  BrowserWindow,
  shell,
  type BaseWindowConstructorOptions,
} from "electron";
import path from "node:path";

const trafficLightPosition = {
  x: 14,
  y: 14,
} as const;

const DEFAILT_WINDOW_CONFIG: BaseWindowConstructorOptions = {
  titleBarStyle: "hidden",
  trafficLightPosition,
  width: 1440,
  height: 960,
  minWidth: 384,
  minHeight: 384,
};

const EDITOR_BASE_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:3000"
    : "https://app.grida.co";

function register_window_hooks(window: BrowserWindow) {
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
    if (shouldOpenExternally(origin, url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

export default function create_main_window() {
  const window = new BrowserWindow({
    ...DEFAILT_WINDOW_CONFIG,
    title: "Grida",
    webPreferences: {
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  window.loadURL(`${EDITOR_BASE_URL}/dashboard`);

  register_window_hooks(window);

  return window;
}

export function create_canvas_playground_window() {
  const window = new BrowserWindow({
    title: "Playground",
    ...DEFAILT_WINDOW_CONFIG,
    webPreferences: {
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  window.loadURL(`${EDITOR_BASE_URL}/canvas`);

  register_window_hooks(window);

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

function shouldOpenExternally(origin: string, target: string) {
  // if the redirect is triggered by the sign-in page, allow it
  if (origin.includes("/sign-in")) return false;

  // deny all others
  if (
    !(
      target.startsWith("https://app.grida.co") ||
      (process.env.NODE_ENV === "development" &&
        target.startsWith("http://localhost:3000"))
    )
  ) {
    return true;
  }
}
