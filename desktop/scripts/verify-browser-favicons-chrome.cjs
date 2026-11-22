// Run with Node 24+ and installed Chrome. Compare Chrome's actual favicon
// mappings in a disposable profile with the Electron guest fixtures.
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { mkdtemp, rm } = require("node:fs/promises");
const { createServer } = require("node:http");
const { createRequire } = require("node:module");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const {
  cases,
  faviconFixture,
} = require("../src/main/browser-favicon.fixtures.cjs");
const { chromium } = createRequire(
  join(__dirname, "../../editor/package.json")
)("@playwright/test");

async function verify() {
  const profile = await mkdtemp(join(tmpdir(), "grida-chrome-favicons-"));
  const server = createServer(faviconFixture().handler);
  let context;
  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const origin = `http://127.0.0.1:${server.address().port}`;
    context = await chromium.launchPersistentContext(profile, {
      channel: "chrome",
      headless: true,
      colorScheme: "light",
      args: ["--force-device-scale-factor=2"],
    });
    const [page] = context.pages();
    const session = await context.newCDPSession(page);
    const { product } = await session.send("Browser.getVersion");
    // Give Chromium's asynchronous favicon handler time before replacing the
    // document. Its profile database is flushed when Chrome closes below.
    const visit = async (pathname) => {
      await page.goto(origin + pathname);
      await page.waitForTimeout(400);
    };
    for (const [pathname] of cases) await visit(pathname);
    await visit("/icons/theme?toggle");
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForTimeout(400);
    await visit("/icons/live?swap");
    await page.emulateMedia({ colorScheme: "light" });
    await page.evaluate(() => {
      document.querySelector("#current").href = "/art/green.svg?live";
    });
    await page.waitForTimeout(400);
    await visit("/icons/live?remove");
    await page.evaluate(() => document.querySelector("#current").remove());
    await page.waitForTimeout(400);
    const peer = await context.newPage();
    await peer.goto(origin + "/icons/gif?peer");
    await page.goto(origin + "/icons/slow?race");
    await visit("/icons/inline");
    await context.close();
    context = null;

    const database = new DatabaseSync(join(profile, "Default", "Favicons"), {
      readOnly: true,
    });
    try {
      const selected = database.prepare(
        "SELECT url FROM icon_mapping JOIN favicons ON icon_id = favicons.id WHERE page_url = ?"
      );
      const icon = (pathname) => selected.get(origin + pathname)?.url;
      for (const [pathname, expected] of [
        ...cases,
        ["/icons/theme?toggle", "/art/green.svg"],
        ["/icons/live?swap", "/art/green.svg?live"],
        ["/icons/gif?peer", "/art/green.gif"],
      ]) {
        assert.equal(icon(pathname), origin + expected, pathname);
      }
      assert.match(icon("/icons/inline"), /^data:image\/svg\+xml,/);
      console.log(`${product} passed the shared favicon fixtures.`);
      console.log(
        "After removing the last link, Chrome selected:",
        icon("/icons/live?remove")?.replace(origin, "") ?? "none"
      );
    } finally {
      database.close();
    }
  } finally {
    await context?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(profile, { recursive: true, force: true });
  }
}

verify().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
