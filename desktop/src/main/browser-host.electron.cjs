// GRIDA-SEC-016 — stock DOM guests, loopback fixtures and private profiles only.
const { app, BrowserWindow, nativeImage } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const { DesktopBrowserHost } = require(process.argv[2]);
const resultPath = process.argv[3];
process.umask(0o077);
app.commandLine.appendSwitch("use-mock-keychain");
app.setPath("userData", process.argv[4]);
let host;
let forbiddenPreload;
const result = { electron: process.versions.electron };
let phase = "startup";
const mark = (next) => {
  phase = next;
  fs.writeFileSync(
    resultPath + ".progress.json",
    JSON.stringify({ phase, result })
  );
};
const windows = new Set();
const servers = new Set();
const fail = (error) => {
  console.error(error);
  app.exit(1);
};
process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);
setTimeout(
  () => fail(new Error(`browser fixture deadline: ${phase}`)),
  15_000
).unref();
// This mirrors Main's early observer: no host/lease means no guest, and the
// actual creation object must match the actual did-attach-webview object.
app.on("web-contents-created", (_event, contents) => {
  contents.on("will-attach-webview", (event, preferences, params) => {
    if (host) host.willAttach(contents, event, preferences, params);
    else event.preventDefault();
  });
  contents.on("did-attach-webview", (_event, guest) => {
    if (host) host.didAttach(contents, guest);
    else guest.close({ waitForBeforeUnload: false });
  });
  host?.createdContents(contents);
});
const waitFor = async (predicate) => {
  const deadline = Date.now() + 5000;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error("browser proof timed out");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};
const serve = async (handler) => {
  const server = http.createServer(handler);
  servers.add(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
};
const eventFor = (window) => ({
  sender: window.webContents,
  senderFrame: window.webContents.mainFrame,
});
const pageFor = (window, attachmentId, pageId) =>
  host
    .snapshot(eventFor(window), attachmentId)
    .pages.find((page) => page.id === pageId);
const targetFor = (attachmentId, page) => ({ attachmentId, pageId: page.id });
const mount = async (window, attachmentId, page, id) => {
  const reservation = host.reserveMount(
    eventFor(window),
    targetFor(attachmentId, page)
  );
  const attached = new Promise((resolve) =>
    window.webContents.once("did-attach-webview", (_event, guest) =>
      resolve(guest)
    )
  );
  await window.webContents.executeJavaScript(`(() => {
    const node = document.createElement('webview');
    node.id = ${JSON.stringify(id)};
    node.setAttribute('partition', 'persist:forged');
    node.setAttribute('preload', ${JSON.stringify(pathToFileURL(forbiddenPreload).href)});
    node.setAttribute('webpreferences', 'nodeIntegration=yes,sandbox=no,webviewTag=yes');
    node.setAttribute('src', ${JSON.stringify(reservation.src)});
    node.style = 'display:flex;width:100%;height:100%';
    document.querySelector('#slot').append(node);
  })()`);
  const guest = await attached;
  await waitFor(() => !pageFor(window, attachmentId, page.id).loading);
  return guest;
};
app
  .whenReady()
  .then(async () => {
    // Deliberate local-only attack fixture. The guest must never execute it.
    forbiddenPreload = path.join(process.argv[4], "forbidden-preload.cjs");
    const preloadMarker = path.join(process.argv[4], "PRELOAD-RAN");
    fs.writeFileSync(
      forbiddenPreload,
      "require('node:fs').writeFileSync(" +
        JSON.stringify(preloadMarker) +
        ", 'ran')"
    );
    const guestOrigin = await serve((request, response) => {
      response.setHeader(
        "Content-Type",
        request.url === "/animation.js" ? "text/javascript" : "text/html"
      );
      response.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
      response.setHeader("X-Frame-Options", "DENY");
      response.end(
        request.url === "/animation.js"
          ? "window.frame=0;function tick(){window.frame++;document.querySelector('canvas').getContext('2d').fillRect(window.frame%200,0,1,20);requestAnimationFrame(tick)}tick();"
          : '<html><title>Unframeable guest</title><body style="margin:0;background:#ff0000"><input id="input" aria-label="Editable text"><canvas width="200" height="20"></canvas><script src="/animation.js"></script></body></html>'
      );
    });
    const origin = await serve((_request, response) => {
      response.setHeader("Content-Type", "text/html");
      // Same default-src/frame policy as Desktop; no permissive frame-src.
      response.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'nonce-browser-proof' 'strict-dynamic' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: grida-workspace:; media-src 'self' data: blob: grida-workspace:; font-src 'self' data:; connect-src 'self' http://127.0.0.1:*; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'"
      );
      response.end(
        '<html><title>Browser shell</title><body style="margin:0;background:#0047ff"><button id="shell-focus">Toolbar</button><div id="slot" style="position:absolute;left:40px;top:50px;width:500px;height:350px;border-radius:18px;overflow:hidden"></div><button id="menu" style="display:none;position:absolute;z-index:10;left:70px;top:80px;width:140px;height:100px;background:lime">Menu</button><dialog id="modal" style="width:200px;height:120px"><button id="close-modal">Close</button></dialog></body></html>'
      );
    });
    const window = new BrowserWindow({
      show: true,
      width: 800,
      height: 600,
      webPreferences: {
        webviewTag: true,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    windows.add(window);
    await window.loadURL(`${origin}/desktop/workspace?id=eac20941e6a410aa`);
    // Guard is already installed before the browser service exists.
    let earlyAttached = false;
    const early = () => {
      earlyAttached = true;
    };
    window.webContents.on("did-attach-webview", early);
    await window.webContents.executeJavaScript(
      "(()=>{let e=document.createElement('webview');e.src='about:blank#grida-browser-mount=forged';document.body.append(e)})()"
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(earlyAttached, false);
    window.webContents.off("did-attach-webview", early);
    host = new DesktopBrowserHost({
      editorOrigin: origin,
      admitWindow: (candidate) => windows.has(candidate),
      workspaceExists: async () => true,
    });
    const event = eventFor(window);
    const { attachmentId } = await host.attach(event, "eac20941e6a410aa");
    const page = host.create(event, {
      attachmentId,
      url: `${guestOrigin}/page`,
    });
    const request = targetFor(attachmentId, page);
    let guest = await mount(window, attachmentId, page, "guest");
    assert.equal(guest.hostWebContents, window.webContents);
    assert.equal(pageFor(window, attachmentId, page.id).mounted, true);
    assert.equal(
      pageFor(window, attachmentId, page.id).title,
      "Unframeable guest"
    );
    assert.equal(
      await guest.executeJavaScript("typeof window.grida"),
      "undefined"
    );
    assert.equal(await guest.executeJavaScript("typeof require"), "undefined");
    if (process.platform === "darwin" || process.platform === "win32") {
      const processMetric = app
        .getAppMetrics()
        .find((metric) => metric.pid === guest.getOSProcessId());
      assert.equal(processMetric?.sandboxed, true);
    }
    await assert.rejects(
      host.attach(
        { sender: guest, senderFrame: guest.mainFrame },
        "eac20941e6a410aa"
      ),
      /browser_owner_invalid/
    );
    result.pageLoaded = true;
    result.hostCsp = true;
    result.isolated = true;
    assert.equal(fs.existsSync(preloadMarker), false);
    result.earlyDenied = true;

    host.setActive(event, { ...request, active: true });
    await window.webContents.executeJavaScript(
      "document.querySelector('#guest').focus()"
    );
    host.focus(event, request);
    await guest.executeJavaScript("document.querySelector('input').focus()");
    guest.debugger.attach("1.3");
    const evaluation = await guest.debugger.sendCommand("Runtime.evaluate", {
      expression: "document.title",
      returnByValue: true,
    });
    assert.equal(evaluation.result.value, "Unframeable guest");
    const screenshot = await guest.debugger.sendCommand(
      "Page.captureScreenshot",
      { format: "png" }
    );
    assert(
      nativeImage
        .createFromBuffer(Buffer.from(screenshot.data, "base64"))
        .getSize().width > 0
    );
    await guest.debugger.sendCommand("Input.insertText", { text: "CDP input" });
    const input = await guest.debugger.sendCommand("Runtime.evaluate", {
      expression: "document.querySelector('input').value",
      returnByValue: true,
    });
    assert.equal(input.result.value, "CDP input");
    guest.debugger.detach();
    result.guestCdp = true;

    // DOM overlays must leave the same live page advancing beneath them.
    const firstFrame = await guest.executeJavaScript("window.frame");
    await window.webContents.executeJavaScript(
      "document.querySelector('#menu').style.display='block'"
    );
    await waitFor(
      async () =>
        (await guest.executeJavaScript("window.frame")) > firstFrame + 2
    );
    const menuFrame = await guest.executeJavaScript("window.frame");
    await window.webContents.executeJavaScript(
      "document.querySelector('#modal').showModal()"
    );
    await waitFor(
      async () =>
        (await guest.executeJavaScript("window.frame")) > menuFrame + 2
    );
    await window.webContents.executeJavaScript(
      "document.querySelector('#modal').close();document.querySelector('#menu').style.display='none'"
    );
    result.liveDomOverlays = true;

    mark("visible thumbnail");
    const visibleThumbnail = await host.thumbnail(event, request);
    assert(
      visibleThumbnail &&
        !nativeImage.createFromDataURL(visibleThumbnail.dataUrl).isEmpty()
    );
    await window.webContents.executeJavaScript(
      "document.querySelector('#shell-focus').focus()"
    );
    host.setActive(event, { ...request, active: false });
    await window.webContents.executeJavaScript(
      "document.querySelector('#guest').style.visibility='hidden'"
    );
    assert.equal(guest.isDestroyed(), false);
    mark("hidden thumbnail");
    const thumbnail = await host.thumbnail(event, request);
    assert(
      thumbnail === null ||
        (thumbnail.width <= 320 &&
          thumbnail.height <= 180 &&
          !nativeImage.createFromDataURL(thumbnail.dataUrl).isEmpty())
    );
    const valueBefore = await guest.executeJavaScript(
      "document.querySelector('input').value"
    );
    assert.throws(() => host.focus(event, request), /browser_page_inactive/);
    assert.equal(
      await window.webContents.executeJavaScript("document.activeElement.id"),
      "shell-focus"
    );
    // Normal input goes to the focused shell. An explicit Main/CDP injection
    // addressed to a guest is separate trusted-native authority.
    window.webContents.sendInputEvent({ type: "char", keyCode: "x" });
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(
      await guest.executeJavaScript("document.querySelector('input').value"),
      valueBefore
    );
    await window.webContents.executeJavaScript(
      "document.querySelector('#guest').style.visibility='visible'"
    );
    result.inactiveInput = true;
    result.hiddenThumbnail = true;
    mark("scheme checks");

    const fixture = path.join(process.argv[4], "private-fixture.html");
    fs.writeFileSync(fixture, "<html><title>Private</title></html>");
    // Generated pages remain governed by normal Chromium origin semantics.
    const linkBlob = await guest.executeJavaScript(
      "URL.createObjectURL(new Blob(['private'],{type:'text/html'}))"
    );
    await guest.executeJavaScript(
      `(() => { const a=document.createElement('a'); a.href=${JSON.stringify(linkBlob)}; document.body.append(a); a.click(); })()`
    );
    await waitFor(() => guest.getURL() === linkBlob);
    assert.equal(pageFor(window, attachmentId, page.id).url, linkBlob);
    assert.equal(guest.isDestroyed(), false);
    mark("blob link allowed");
    host.navigate(event, { ...request, url: `${guestOrigin}/page` });
    await waitFor(
      () => guest.getURL() === `${guestOrigin}/page` && !guest.isLoading()
    );
    for (const generated of ["about:blank", "data:text/html,generated"]) {
      await guest.loadURL(generated);
      await waitFor(
        () => pageFor(window, attachmentId, page.id).url === generated
      );
      assert.equal(guest.isDestroyed(), false);
      host.navigate(event, { ...request, url: `${guestOrigin}/page` });
      await waitFor(
        () => guest.getURL() === `${guestOrigin}/page` && !guest.isLoading()
      );
    }
    for (const scheme of ["file", "private"]) {
      mark(`loading ${scheme}`);
      const url =
        scheme === "file"
          ? pathToFileURL(fixture).href
          : scheme === "data"
            ? "data:text/html,private"
            : scheme === "private"
              ? "grida-workspace://private/file"
              : await guest.executeJavaScript(
                  "URL.createObjectURL(new Blob(['private'],{type:'text/html'}))"
                );
      // Built-in programmatic loaders have no public preexecution veto. Main
      // revokes their metadata/focus and closes the guest after native unwind.
      const ended = new Promise((resolve) => guest.once("destroyed", resolve));
      await Promise.race([guest.loadURL(url).catch(() => {}), ended]);
      mark(`loaded/rejected ${scheme}`);
      await waitFor(() => !pageFor(window, attachmentId, page.id).mounted);
      await waitFor(() => guest.isDestroyed());
      mark(`closed ${scheme}`);
      assert.equal(
        pageFor(window, attachmentId, page.id).failure.code,
        "blocked"
      );
      assert.equal(
        pageFor(window, attachmentId, page.id).url,
        `${guestOrigin}/page`
      );
      await window.webContents.executeJavaScript(
        "document.querySelector('#guest').remove()"
      );
      host.reload(event, request);
      guest = await mount(window, attachmentId, page, "guest");
      mark(`remounted ${scheme}`);
    }
    result.requestPolicy = true;

    const peerWindow = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: {
        webviewTag: true,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    windows.add(peerWindow);
    await peerWindow.loadURL(`${origin}/desktop/workspace?id=1234567890abcdef`);
    const peerAttachment = await host.attach(
      eventFor(peerWindow),
      "1234567890abcdef"
    );
    const peerPage = host.create(eventFor(peerWindow), {
      attachmentId: peerAttachment.attachmentId,
      url: `${guestOrigin}/peer`,
    });
    const peerGuest = await mount(
      peerWindow,
      peerAttachment.attachmentId,
      peerPage,
      "peer-guest"
    );
    assert.equal(peerGuest.session, guest.session);
    await guest.session.cookies.set({
      url: guestOrigin,
      name: "fixture",
      value: "shared-browser",
    });
    assert.equal(
      (await peerGuest.session.cookies.get({ name: "fixture" }))[0].value,
      "shared-browser"
    );
    await host.close(
      eventFor(peerWindow),
      targetFor(peerAttachment.attachmentId, peerPage)
    );
    assert.equal(
      (await guest.session.cookies.get({ name: "fixture" }))[0].value,
      "shared-browser"
    );
    peerWindow.destroy();
    result.sharedProfile = true;

    mark("guest renderer crash");
    guest.forcefullyCrashRenderer();
    await waitFor(
      () =>
        pageFor(window, attachmentId, page.id).failure?.kind === "renderer-gone"
    );
    host.reload(event, request);
    if (!pageFor(window, attachmentId, page.id).mounted) {
      await window.webContents.executeJavaScript(
        "document.querySelector('#guest').remove()"
      );
      guest = await mount(window, attachmentId, page, "guest");
    } else {
      await waitFor(
        () =>
          !pageFor(window, attachmentId, page.id).loading &&
          !pageFor(window, attachmentId, page.id).failure
      );
    }
    assert.equal(
      await guest.executeJavaScript("document.title"),
      "Unframeable guest"
    );
    result.crashRecovery = true;
    const initialGuestId = guest.id;
    await window.webContents.executeJavaScript(
      "document.querySelector('#guest').remove()"
    );
    await waitFor(() => !pageFor(window, attachmentId, page.id).mounted);
    assert.equal(guest.isDestroyed(), true);
    assert.equal(
      pageFor(window, attachmentId, page.id).failure.kind,
      "renderer-gone"
    );
    host.reload(event, request);
    const remounted = await mount(window, attachmentId, page, "remounted");
    assert.notEqual(remounted.id, initialGuestId);
    result.retryNewGuest = true;
    const reloaded = new Promise((resolve) =>
      window.webContents.once("did-finish-load", resolve)
    );
    window.reload();
    await reloaded;
    await waitFor(() => remounted.isDestroyed());
    const fresh = await host.attach(eventFor(window), "eac20941e6a410aa");
    assert.deepEqual(fresh.pages, []);
    result.documentReloadEndsGuests = true;
    const lastPage = host.create(eventFor(window), {
      attachmentId: fresh.attachmentId,
      url: `${guestOrigin}/last`,
    });
    const lastGuest = await mount(window, fresh.attachmentId, lastPage, "last");
    window.destroy();
    await waitFor(() => lastGuest.isDestroyed());
    result.destroyedWithShell = true;
    fs.writeFileSync(resultPath, JSON.stringify(result));
    for (const server of servers) server.close();
    app.exit(0);
  })
  .catch(fail);
