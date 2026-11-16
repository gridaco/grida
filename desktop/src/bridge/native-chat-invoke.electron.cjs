// GRIDA-SEC-004 — isolated transport fixture; never loads the Desktop application.
const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs");

const [preload, resultPath, userData] = process.argv.slice(2);
app.setPath("userData", userData);
app.setName("Native chat transport verification");
app.disableHardwareAcceleration();
for (const channel of [
  "grida:native-chat:input-receipt",
  "grida:unrelated:probe",
]) {
  ipcMain.handle(channel, (_event, code) => {
    throw new Error(code);
  });
}

app
  .whenReady()
  .then(async () => {
    app.dock?.hide();
    const window = new BrowserWindow({
      show: false,
      webPreferences: {
        preload,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    try {
      await window.loadURL(
        "data:text/html,<html><body>Transport verification</body></html>"
      );
      const result = await window.webContents.executeJavaScript(`(async () => {
      const inspect = async (method, code, channel) => {
        try { await window.nativeChatErrorProbe[method](code, channel); return { unexpectedSuccess: true }; }
        catch (error) { return { message: error.message, isError: error instanceof Error }; }
      };
      return {
        raw: await inspect("raw", "input_unavailable"),
        absent: await inspect("normalized", "input_unavailable"),
        changed: await inspect("normalized", "native_chat_selection_revision_changed"),
        queued: await inspect("normalized", "session_queue_waiting"),
        prose: await inspect("normalized", "Fixture provider failed with details."),
        nested: await inspect("normalized", "Error invoking remote method 'grida:native-chat:other': Error: input_unavailable"),
        unrelated: await inspect("normalized", "input_unavailable", "grida:unrelated:probe"),
      };
    })()`);
      fs.writeFileSync(resultPath, JSON.stringify(result));
    } finally {
      window.destroy();
      app.quit();
    }
  })
  .catch((error) => {
    process.stderr.write(String(error));
    app.exit(1);
  });
