import { BrowserWindow, shell } from "electron";
import path from "node:path";

const IS_INSIDERS = INSIDERS === 1;
const IS_DEV = process.env.NODE_ENV === "development";

const EDITOR_BASE_URL =
  IS_INSIDERS || IS_DEV ? "http://localhost:3000" : "https://app.grida.co";

const trafficLightPosition = {
  x: 14,
  y: 14,
} as const;

export default function create_window() {
  // Create the browser window.
  const window = new BrowserWindow({
    title: "Grida",
    titleBarStyle: "hidden",
    trafficLightPosition,
    width: 1440,
    height: 960,
    minWidth: 384,
    minHeight: 384,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  window.loadURL(`${EDITOR_BASE_URL}/dashboard`);

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
  if (origin.includes("/insiders/auth")) return false;

  // need some more handling
  if (target.startsWith(EDITOR_BASE_URL)) {
    return false;
  }

  return true;
}
