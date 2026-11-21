// GRIDA-SEC-004 / GRIDA-SEC-016 — a disposable same-document Desktop renderer.
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { createServer } = require("node:http");
const { app, BrowserWindow, ipcMain } = require("electron");

const [preload, userData] = process.argv.slice(2);
app.setPath("userData", userData);
app.setName("Workspace cleanup verification");
app.disableHardwareAcceleration();

const chatCleanup = [
  "grida:native-chat:unsubscribe",
  "grida:native-chat:set-presented",
  "grida:native-chat:detach",
  "grida:native-chat:close-side",
];
const browserCleanup = "grida:browser:detach";
const calls = [];
for (const channel of [...chatCleanup, browserCleanup]) {
  ipcMain.handle(channel, (event, ...args) => {
    calls.push([new URL(event.senderFrame.url).pathname, channel, ...args]);
  });
}

const cleanUp = `async (id) => {
  const { nativeChat, browser } = window.grida;
  await nativeChat.unsubscribe(id);
  await nativeChat.setPresented(id, false);
  await nativeChat.detach(id);
  await nativeChat.closeSideChat(id);
  await browser.detach(id);
}`;

app
  .whenReady()
  .then(async () => {
    app.dock?.hide();
    const server = createServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end("<!doctype html><title>Workspace cleanup</title>");
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const origin = `http://127.0.0.1:${server.address().port}`;
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
      const run = (script) => window.webContents.executeJavaScript(script);
      const workspace = "/desktop/workspace";
      const file = "/desktop/file";
      const welcome = "/desktop/welcome";
      const workspaceCalls = [
        [workspace, chatCleanup[0], "workspace"],
        [workspace, chatCleanup[1], "workspace", false],
        [workspace, chatCleanup[2], "workspace"],
        [workspace, chatCleanup[3], "workspace"],
        [workspace, browserCleanup, "workspace"],
      ];
      const fileCalls = [
        [file, chatCleanup[0], "file"],
        [file, chatCleanup[1], "file", false],
        [file, chatCleanup[2], "file"],
        [file, chatCleanup[3], "file"],
      ];

      await window.loadURL(`${origin}${workspace}?id=0123456789abcdef`);
      await run(`window.grida.nativeChat.setPresented("workspace", true)`);
      workspaceCalls.unshift([workspace, chatCleanup[1], "workspace", true]);
      await run(`(${cleanUp})("workspace")`);
      assert.deepEqual(calls, workspaceCalls);

      await run(`(async () => {
        window.sameDocument = true;
        history.pushState({}, "", ${JSON.stringify(welcome)});
        await (${cleanUp})("welcome");
        return window.sameDocument;
      })()`).then((sameDocument) => assert.equal(sameDocument, true));
      assert.deepEqual(
        calls,
        workspaceCalls,
        "Welcome dispatched stale attachment cleanup"
      );

      await window.loadURL(`${origin}${file}?id=0123456789abcdef`);
      await run(`(${cleanUp})("file")`);
      assert.deepEqual(calls, [...workspaceCalls, ...fileCalls]);
      await run(`(async () => {
        history.pushState({}, "", ${JSON.stringify(welcome)});
        await (${cleanUp})("left-file");
      })()`);
      assert.deepEqual(calls, [...workspaceCalls, ...fileCalls]);
    } finally {
      window.destroy();
      server.close();
    }
  })
  .then(() => {
    process.stdout.write("Workspace cleanup verified\n");
    app.quit();
  })
  .catch((error) => {
    process.stderr.write(String(error));
    app.exit(1);
  });
