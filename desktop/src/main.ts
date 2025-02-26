import { app, shell, BrowserWindow, Menu, session } from "electron";
import { updateElectronApp } from "update-electron-app";
import started from "electron-squirrel-startup";
import path from "node:path";
import create_menu from "./menu";
import create_main_window, { create_login_window } from "./window";
import { EDITOR_BASE_URL } from "./env";

// #region chrome flags

// Enable GPU optimization
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("enable-native-gpu-memory-buffers");

// Optimize rendering & DOM handling
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("disable-low-res-tiling");
app.commandLine.appendSwitch("disable-partial-raster");
app.commandLine.appendSwitch("enable-quic");

// Reduce CPU impact from timers
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-best-effort-tasks");
app.commandLine.appendSwitch("disable-async-dns");

// Improve garbage collection & memory handling
app.commandLine.appendSwitch("js-flags", "--expose-gc");
// #endregion chrome flags

updateElectronApp();

app.setAsDefaultProtocolClient("grida");
app.setName("Grida");
// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const menu = create_menu(app, shell);
Menu.setApplicationMenu(menu);

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", async () => {
  // const token = await keytar.getPassword(SERVICE, ACCOUNT);
  // if (!token) {
  //   create_login_window();
  // } else {
  //   create_window();
  // }

  await session.defaultSession.cookies.set({
    name: "grida-desktop-version",
    value: app.getVersion(),
    url: EDITOR_BASE_URL,
  });

  create_main_window({ baseUrl: EDITOR_BASE_URL });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    create_main_window({ baseUrl: EDITOR_BASE_URL });
  }
});

//
app.on("open-file", (event, filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".grida") {
    console.error("Unsupported file type:", filePath);
    event.preventDefault();
    return;
  }
  // Add your file handling logic here
});
