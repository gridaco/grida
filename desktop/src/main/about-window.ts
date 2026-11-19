import { BrowserWindow, nativeImage, type App } from "electron";
import { create_runtime_app_icon } from "../branding";
import aboutPage from "./about-page.html?raw";

let aboutWindow: BrowserWindow | undefined;

function escapeText(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export async function openAboutWindow(app: App): Promise<void> {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    if (aboutWindow.isVisible()) aboutWindow.focus();
    return;
  }

  const window = new BrowserWindow({
    title: `About ${app.name}`,
    width: 324,
    height: 224,
    useContentSize: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      javascript: false,
    },
  });
  aboutWindow = window;
  window.on("closed", () => {
    aboutWindow = undefined;
  });
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.once("ready-to-show", () => window.show());

  try {
    // Packaged apps already ship the channel's icon in the macOS bundle.
    const icon = app.isPackaged
      ? nativeImage.createFromNamedImage("NSApplicationIcon")
      : create_runtime_app_icon();

    const html = aboutPage
      .replaceAll("{{name}}", () => escapeText(app.name))
      .replace("{{version}}", () => escapeText(app.getVersion()))
      .replace("{{icon}}", () => icon.resize({ width: 192 }).toDataURL());
    await window.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
    );
  } catch (error) {
    if (window.isDestroyed()) return;
    window.destroy();
    console.error("[grida] About window could not be opened", error);
  }
}
