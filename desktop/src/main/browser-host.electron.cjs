// GRIDA-SEC-016 — synthetic local pages and private Chromium profiles only.
const { app, BrowserWindow, session, nativeImage } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const assert = require("node:assert/strict");
const { DesktopBrowserHost } = require(process.argv[2]);
const resultPath = process.argv[3];
process.umask(0o077);
// Chromium cookie encryption must never consult the person's macOS Keychain.
app.commandLine.appendSwitch("use-mock-keychain");
app.setPath("userData", process.argv[4]);
const fail = (error) => {
  console.error(error);
  app.exit(1);
};
process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);
const settleLoad = (contents) =>
  contents.isLoading()
    ? new Promise((resolve) => contents.once("did-stop-loading", resolve))
    : Promise.resolve();
const destroyed = (contents) =>
  contents.isDestroyed()
    ? Promise.resolve()
    : new Promise((resolve) => contents.once("destroyed", resolve));

app
  .whenReady()
  .then(async () => {
    const server = http.createServer((request, response) => {
      response.setHeader("Content-Type", "text/html");
      if (request.url.startsWith("/desktop/")) {
        response.end(
          '<html><title>Shell</title><body style="margin:0;background:#0047ff"><div style="height:60px">Browser toolbar</div></body></html>'
        );
      } else {
        response.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
        response.end(
          '<html><title>Guest fixture</title><body style="margin:0;background:#ff0000"><h1>Browser page</h1><input aria-label="Editable text" value="typing"><iframe src="about:blank"></iframe></body></html>'
        );
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const windows = new Set();
    const createWindow = async () => {
      const window = new BrowserWindow({
        width: 1100,
        height: 780,
        show: true,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      windows.add(window);
      await window.loadURL(`${origin}/desktop/workspace?id=eac20941e6a410aa`);
      return window;
    };
    const eventFor = (window) => ({
      sender: window.webContents,
      senderFrame: window.webContents.mainFrame,
    });
    const host = new DesktopBrowserHost({
      editorOrigin: origin,
      admitWindow: (window) => windows.has(window),
      workspaceExists: async () => true,
    });
    const window = await createWindow();
    const event = eventFor(window);
    const attached = await host.attach(event, "eac20941e6a410aa");
    const page = host.create(event, {
      attachmentId: attached.attachmentId,
      storageScope: "workspace",
      url: `${origin}/page`,
    });
    const view = window.contentView.children.at(-1);
    const guest = view.webContents;
    await settleLoad(guest);
    assert.equal(
      host.snapshot(event, attached.attachmentId).pages[0].title,
      "Guest fixture"
    );
    assert.equal(
      await guest.executeJavaScript("typeof window.grida"),
      "undefined"
    );
    assert.equal(guest.session === session.defaultSession, false);
    assert.equal(guest.getLastWebPreferences().sandbox, true);
    assert.equal(guest.getLastWebPreferences().nodeIntegration, false);
    await assert.rejects(
      host.attach(
        { sender: guest, senderFrame: guest.mainFrame },
        "eac20941e6a410aa"
      ),
      /browser_owner_invalid/
    );
    window.webContents.setZoomFactor(1.25);
    const target = { attachmentId: attached.attachmentId, pageId: page.id };
    const rect = { x: 160, y: 60, width: 600, height: 400 };
    const radii = [];
    const applyRadius = view.setBorderRadius.bind(view);
    view.setBorderRadius = (radius) => {
      radii.push(radius);
      applyRadius(radius);
    };
    host.layout(event, {
      ...target,
      sequence: 1,
      rect,
      visible: true,
      borderRadius: 7.2,
    });
    assert.equal(radii.at(-1), 9);
    host.layout(event, {
      ...target,
      sequence: 2,
      rect,
      visible: true,
      borderRadius: 24,
    });
    assert.equal(radii.at(-1), 30);
    assert.deepEqual(view.getBounds(), {
      x: 200,
      y: 75,
      width: 750,
      height: 500,
    });
    const commands = [];
    const send = window.webContents.send.bind(window.webContents);
    window.webContents.send = (channel, ...args) => {
      if (channel === "grida:workspace:command") commands.push(args[0]);
      return send(channel, ...args);
    };
    app.focus({ steal: true });
    window.focus();
    host.focus(event, target);
    const modifiers = process.platform === "darwin" ? ["meta"] : ["control"];
    guest.sendInputEvent({ type: "keyDown", keyCode: "L", modifiers });
    guest.sendInputEvent({ type: "keyUp", keyCode: "L", modifiers });
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert(commands.includes("workspace.browser.focus-location"));
    const viewportBounds = view.getBounds();
    host.layout(event, {
      ...target,
      sequence: 3,
      rect: { x: 0, y: 0, width: 0, height: 0 },
      visible: false,
    });
    assert.equal(view.getVisible(), false);
    assert.deepEqual(view.getBounds(), viewportBounds);
    const beforeCaptureFocus = guest.isFocused();
    const thumbnail = await host.thumbnail(event, target);
    assert(thumbnail && thumbnail.width <= 320 && thumbnail.height <= 180);
    const decoded = nativeImage.createFromDataURL(thumbnail.dataUrl);
    assert.equal(decoded.isEmpty(), false);
    assert.deepEqual(decoded.getSize(), {
      width: thumbnail.width,
      height: thumbnail.height,
    });
    assert(
      Buffer.from(thumbnail.dataUrl.split(",")[1], "base64").length <= 65536
    );
    assert.equal(view.getVisible(), false);
    assert.equal(guest.isFocused(), beforeCaptureFocus);
    assert.deepEqual(view.getBounds(), viewportBounds);
    const unrendered = host.create(event, {
      attachmentId: attached.attachmentId,
      storageScope: "ephemeral",
      url: `${origin}/page`,
    });
    const unrenderedView = window.contentView.children.at(-1);
    await settleLoad(unrenderedView.webContents);
    assert.equal(
      await host.thumbnail(event, {
        attachmentId: attached.attachmentId,
        pageId: unrendered.id,
      }),
      null
    );
    assert.equal(unrenderedView.getVisible(), false);
    await host.close(event, {
      attachmentId: attached.attachmentId,
      pageId: unrendered.id,
    });
    host.detach(event, attached.attachmentId);
    assert.equal(view.getVisible(), false);
    assert.equal(guest.isDestroyed(), false);
    const next = await host.attach(event, "eac20941e6a410aa");
    assert.equal(next.pages[0].id, page.id);
    assert.notEqual(next.attachmentId, attached.attachmentId);

    // Keep one window alive while another closes, reproducing the ordering in
    // which BrowserWindow still exists after its privileged contents has died.
    const closing = await createWindow();
    const closingEvent = eventFor(closing);
    const closingAttachment = await host.attach(
      closingEvent,
      "eac20941e6a410aa"
    );
    const closingPage = host.create(closingEvent, {
      attachmentId: closingAttachment.attachmentId,
      storageScope: "ephemeral",
      url: `${origin}/page`,
    });
    const closingView = closing.contentView.children.at(-1);
    await settleLoad(closingView.webContents);
    host.layout(closingEvent, {
      attachmentId: closingAttachment.attachmentId,
      pageId: closingPage.id,
      sequence: 1,
      rect,
      visible: true,
    });
    const guestClosed = destroyed(closingView.webContents);
    closing.destroy();
    await guestClosed;
    const firstClosed = destroyed(guest);
    host.closeAll();
    await firstClosed;
    assert.equal(window.contentView.children.length, 0);
    fs.writeFileSync(
      resultPath,
      JSON.stringify({
        electron: process.versions.electron,
        pageLoaded: true,
        isolated: true,
        layout: true,
        radius: true,
        hiddenThumbnail: true,
        shortcut: true,
        reattached: true,
        destroyedWithShell: true,
      })
    );
    window.destroy();
    await new Promise((resolve) => server.close(resolve));
    app.quit();
  })
  .catch(fail);
