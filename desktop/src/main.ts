import { app, shell, BrowserWindow, Menu } from "electron";
import { updateElectronApp } from "update-electron-app";
import started from "electron-squirrel-startup";
import path from "node:path";
import create_menu from "./menu";
import keytar from "keytar";
import create_window, { create_login_window } from "./window";

const SERVICE = "GridaDesktop";
const ACCOUNT = "userToken";

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
  const token = await keytar.getPassword(SERVICE, ACCOUNT);

  if (!token) {
    create_login_window();
  } else {
    create_window();
  }
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
    create_window();
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
