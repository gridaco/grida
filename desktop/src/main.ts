import { app, BrowserWindow } from "electron";
import { updateElectronApp } from "update-electron-app";
import path from "node:path";
import started from "electron-squirrel-startup";

updateElectronApp();

app.setName("Grida");
// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
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
    mainWindow.loadURL("http://localhost:3000/canvas");
  } else {
    mainWindow.loadURL("https://app.grida.co/canvas");
  }

  mainWindow.webContents.on("will-prevent-unload", (event) => {
    // Allow the window to close even if the page tries to block it.
    event.preventDefault();
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", createWindow);

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
    createWindow();
  }
});

app.on("open-file", (event, filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".grida") {
    console.error("Unsupported file type:", filePath);
    event.preventDefault();
    return;
  }
  // Add your file handling logic here
});
