// GRIDA-SEC-016 — browser tool operations on isolated local pages.
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const { once } = require("node:events");
const { app, BrowserWindow, nativeImage } = require("electron");

const bundle = process.argv[2];
const { DesktopBrowserHost } = require(path.join(bundle, "browser-host.cjs"));
const { BrowserAutomation } = require(
  path.join(bundle, "browser-automation.cjs")
);

app.setPath("userData", process.argv[3]);
app.commandLine.appendSwitch("use-mock-keychain");

let host;
let phase = "startup";
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

const shellHtml =
  '<!doctype html><title>Automation Workbench</title><input id="toolbar" value="user draft"><div id="slot" style="width:700px;height:390px"></div>';
const appHtml = `<!doctype html>
<meta charset="utf-8"><title>Browser Tools Fixture</title>
<body style="font:20px system-ui;background:#ffa032;color:#2d230f;margin:32px">
<h1>Browser tools test</h1>
<form><label>Project name <input id="project"></label> <button type="submit">Save</button></form>
<output id="output"></output>
<script>
const field=document.querySelector('#project');
let trustedInput=false, trustedClick=false, saves=0;
field.addEventListener('input',event=>trustedInput=event.isTrusted);
document.querySelector('button').addEventListener('click',event=>trustedClick=event.isTrusted);
document.querySelector('form').addEventListener('submit',event=>{
  event.preventDefault();
  document.querySelector('#output').value='Saved '+field.value+' / '+(++saves)+' / '+trustedInput+' / '+trustedClick;
});
console.error('fixture startup diagnostic');
</script>`;

async function main() {
  app.dock?.hide();
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (req.url.startsWith("/redirect")) {
      res.writeHead(302, { Location: "/fixture" }).end();
    } else if (req.url.startsWith("/fixture")) res.end(appHtml);
    else if (req.url.startsWith("/frame-content")) res.end(appHtml);
    else if (req.url.startsWith("/frames")) {
      const port = server.address().port;
      res.end(`<!doctype html><title>Frame targets</title>
      <iframe title="same-site fixture" width="430" height="245"
        src="http://127.0.0.1:${port}/frame-content?site=same"></iframe>
      <iframe title="cross-site fixture" width="430" height="245"
        src="http://localhost:${port}/frame-content?site=cross"></iframe>`);
    } else res.end(shellHtml);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  const workspace = "eac20941e6a410aa";
  const window = new BrowserWindow({
    show: false,
    width: 864,
    height: 628,
    webPreferences: {
      webviewTag: true,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const shell = window.webContents;
  const shellEval = (expression) => shell.executeJavaScript(expression);
  await window.loadURL(`${origin}/desktop/workspace?id=${workspace}`);
  window.show();
  window.focus();
  await shellEval("document.querySelector('#toolbar').focus()");
  const focus = await shellEval("document.activeElement.id");
  assert.equal(focus, "toolbar");

  host = new DesktopBrowserHost({
    editorOrigin: origin,
    admitWindow: (candidate) => candidate === window,
    workspaceExists: async () => true,
  });
  const event = { sender: shell, senderFrame: shell.mainFrame };
  const { attachmentId } = await host.attach(event, workspace);
  const service = new BrowserAutomation(host);
  let live = true;
  const scope = {
    id: "browser-test-scope",
    sender: shell,
    frame: shell.mainFrame,
    live: () => live,
  };
  const call = (tool, args) => service.invoke(scope, tool, args);
  const ok = async (tool, args) => {
    const reply = await call(tool, args);
    assert.equal(reply.error, undefined, `${tool}: ${JSON.stringify(reply)}`);
    return reply;
  };
  const wait = (
    target,
    readiness,
    condition = { kind: "ready", state: "load" }
  ) => ok("browser_wait", { target, readiness, condition, timeoutMs: 5000 });
  const session = async (value) => {
    const { target, readiness } = (
      await ok("browser_open", { url: `${origin}/redirect` })
    ).data;
    const ready = (await wait(target, readiness)).data;
    assert.equal(ready.url, `${origin}/fixture`);
    const snapshot = (
      await ok("browser_snapshot", { target, documentId: ready.documentId })
    ).data;
    const input = snapshot.nodes.find(
      (node) => node.role === "textbox" && node.name?.trim() === "Project name"
    );
    const save = snapshot.nodes.find(
      (node) => node.role === "button" && node.name === "Save"
    );
    const saveLabel = snapshot.nodes.find(
      (node) => node.role === "StaticText" && node.name === "Save"
    );
    assert(input?.ref && save?.ref, JSON.stringify(snapshot));
    assert(saveLabel, JSON.stringify(snapshot));
    assert.equal(saveLabel.ref, undefined);
    return {
      target,
      documentId: ready.documentId,
      input: input.ref,
      save: save.ref,
      value,
    };
  };
  const action = (page, command) =>
    ok("browser_action", {
      target: page.target,
      documentId: page.documentId,
      action: command,
    });
  phase = "two background pages";
  const pages = await Promise.all([session("Indigo"), session("Saffron")]);
  assert.notEqual(pages[0].target.pageId, pages[1].target.pageId);
  assert.notEqual(pages[0].documentId, pages[1].documentId);
  phase = "parallel trusted input";
  await Promise.all(
    pages.map(async (page) => {
      await action(page, { kind: "fill", ref: page.input, value: page.value });
      await action(page, { kind: "click", ref: page.save });
      const result = await wait(
        page.target,
        { kind: "document", documentId: page.documentId },
        { kind: "text", text: `Saved ${page.value} / 1 / true / true` }
      );
      assert.equal(result.data.matched, true);
    })
  );
  assert.equal(await shellEval("document.activeElement.id"), focus);
  phase = "parallel capture";
  await Promise.all(
    pages.map(async (page) => {
      const { data, image } = await ok("browser_capture", {
        target: page.target,
        documentId: page.documentId,
      });
      assert.equal(data.documentId, page.documentId);
      assert.equal(image.mimeType, "image/jpeg");
      const bytes = Buffer.from(image.base64, "base64");
      assert(bytes.byteLength > 500 && bytes.byteLength <= 256 * 1024);
      assert.equal(
        nativeImage.createFromBuffer(bytes).getSize().width,
        data.imageWidth
      );
    })
  );

  phase = "diagnostics and staleness";
  const [first, second] = pages;
  const { data: diagnostics } = await ok("browser_diagnostics", {
    target: first.target,
    limit: 10,
  });
  assert(
    diagnostics.entries.some(
      (entry) => entry.message === "fixture startup diagnostic"
    )
  );
  const { data: evaluated } = await ok("browser_evaluate", {
    target: second.target,
    documentId: second.documentId,
    functionText:
      "(label) => document.querySelector('output').value.startsWith(label)",
    arg: "Saved Saffron",
  });
  assert.equal(evaluated.value, true);
  const { data: navigated } = await ok("browser_navigate", {
    target: first.target,
    documentId: first.documentId,
    action: { kind: "goto", url: `${origin}/fixture?next` },
  });
  const next = (await wait(first.target, navigated.readiness)).data;
  assert.notEqual(next.documentId, first.documentId);
  const stale = await call("browser_action", {
    target: first.target,
    documentId: first.documentId,
    action: { kind: "click", ref: first.save },
  });
  assert.deepEqual(stale, {
    disposition: "not_dispatched",
    error: "stale_document",
  });

  phase = "same- and cross-site frame targeting";
  const frameNav = await ok("browser_navigate", {
    target: first.target,
    documentId: next.documentId,
    action: { kind: "goto", url: `${origin}/frames` },
  });
  const { documentId: frameDocumentId } = (
    await wait(first.target, frameNav.data.readiness)
  ).data;
  for (const value of ["cross", "same"]) {
    const snapshot = (
      await ok("browser_snapshot", {
        target: first.target,
        documentId: frameDocumentId,
      })
    ).data;
    const frame = snapshot.frames.find((candidate) =>
      candidate.url.endsWith("site=" + value)
    );
    assert(frame, JSON.stringify(snapshot.frames));
    const nodes = snapshot.nodes.filter((node) => node.frameId === frame.id);
    const field = nodes.find((node) => node.role === "textbox");
    const button = nodes.find(
      (node) => node.role === "button" && node.name === "Save"
    );
    assert(field?.ref && button?.ref, JSON.stringify(nodes));
    await action(
      { target: first.target, documentId: frameDocumentId },
      {
        kind: "fill",
        ref: field.ref,
        value,
      }
    );
    if (value === "cross") {
      await action(
        { target: first.target, documentId: frameDocumentId },
        {
          kind: "click",
          ref: button.ref,
        }
      );
    } else {
      const unsupported = await call("browser_action", {
        target: first.target,
        documentId: frameDocumentId,
        action: { kind: "click", ref: button.ref },
      });
      assert.deepEqual(unsupported, {
        disposition: "not_dispatched",
        error: "frame_pointer_unavailable",
      });
      const unsupportedKey = await call("browser_action", {
        target: first.target,
        documentId: frameDocumentId,
        action: { kind: "press", ref: button.ref, key: "Enter" },
      });
      assert.deepEqual(unsupportedKey, {
        disposition: "not_dispatched",
        error: "frame_key_unavailable",
      });
    }
    const observed = (
      await ok("browser_snapshot", {
        target: first.target,
        documentId: frameDocumentId,
      })
    ).data;
    const observedFrame = observed.frames.find((candidate) =>
      candidate.url.endsWith("site=" + value)
    );
    assert(observedFrame);
    const scopedNodes = observed.nodes.filter(
      (node) => node.frameId === observedFrame.id
    );
    if (value === "cross") {
      assert(
        scopedNodes.some(
          (node) => node.name === "Saved cross / 1 / true / true"
        )
      );
    } else {
      assert(
        scopedNodes.some(
          (node) => node.role === "textbox" && node.value === "same"
        )
      );
      assert(!scopedNodes.some((node) => node.name?.startsWith("Saved ")));
    }
  }

  phase = "workbench page";
  const foreground = host.openWorkbenchAutomationPage(
    scope,
    `${origin}/fixture`
  );
  const readiness = service.registerOpen(scope, foreground);
  const pageId = foreground.target.tabId;
  const claim = host.reserveMount(event, { attachmentId, pageId });
  await shellEval(`(() => {
    const el = document.createElement("webview");
    el.src = ${JSON.stringify(claim.src)};
    el.style = "display:flex;width:700px;height:390px";
    document.getElementById("slot").append(el);
  })()`);
  host.setActive(event, { attachmentId, pageId, active: true });
  const selected = (await wait(foreground.target, readiness)).data;
  await ok("browser_capture", {
    target: foreground.target,
    documentId: selected.documentId,
  });
  const workbenchSnapshot = (
    await ok("browser_snapshot", {
      target: foreground.target,
      documentId: selected.documentId,
    })
  ).data;
  const workbenchField = workbenchSnapshot.nodes.find(
    (node) => node.role === "textbox"
  );
  const workbenchSave = workbenchSnapshot.nodes.find(
    (node) => node.role === "button"
  );
  assert(workbenchField?.ref && workbenchSave?.ref);
  const workspaceTarget = {
    target: foreground.target,
    documentId: selected.documentId,
  };
  await action(workspaceTarget, {
    kind: "fill",
    ref: workbenchField.ref,
    value: "Workbench",
  });
  await action(workspaceTarget, {
    kind: "press",
    ref: workbenchSave.ref,
    key: "Enter",
  });
  await wait(
    foreground.target,
    { kind: "document", documentId: selected.documentId },
    { kind: "text", text: "Saved Workbench / 1 / true / true" }
  );
  host.setActive(event, { attachmentId, pageId, active: false });
  const hidden = await call("browser_capture", {
    target: foreground.target,
    documentId: selected.documentId,
  });
  assert.deepEqual(hidden, {
    disposition: "not_dispatched",
    error: "target_not_visible",
  });

  phase = "lease cleanup";
  await ok("browser_close", { target: first.target });
  assert.equal(
    (await call("browser_snapshot", { target: first.target })).error,
    "target_missing"
  );
  live = false;
  service.closeScope(scope.id);
  assert.equal(
    (await call("browser_snapshot", { target: second.target })).error,
    "owner_revoked"
  );
  window.destroy();
  server.close();
}

app
  .whenReady()
  .then(main)
  .then(
    () => {
      console.log("browser automation Electron scenarios passed");
      app.exit(0);
    },
    (error) => {
      console.error(phase, error);
      app.exit(1);
    }
  );
