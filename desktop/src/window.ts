import { BrowserWindow } from "electron";
import path from "node:path";

export default function create_window() {
  // Create the browser window.
  const window = new BrowserWindow({
    title: "Grida",
    titleBarStyle: "hidden",
    trafficLightPosition: {
      x: 10,
      y: 10,
    },
    width: 1440,
    height: 960,
    minWidth: 384,
    minHeight: 384,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  if (process.env.NODE_ENV === "development") {
    window.loadURL("http://localhost:3000");
  } else {
    window.loadURL("https://app.grida.co");
  }

  window.webContents.on("will-prevent-unload", (event) => {
    // Allow the window to close even if the page tries to block it.
    event.preventDefault();
  });
}

export function create_login_window() {
  const window = new BrowserWindow({
    title: "Grida",
    titleBarStyle: "hidden",
    trafficLightPosition: {
      x: 10,
      y: 10,
    },
    width: 292,
    height: 438,
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
