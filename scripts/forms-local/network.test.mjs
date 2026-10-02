import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const guard = fileURLToPath(new URL("./network.cjs", import.meta.url));

test("Forms network guard admits only owned loopback and exact recorded providers", async () => {
  const paths = [];
  const server = createServer((req, res) => {
    paths.push(req.url);
    if (req.url === "/redirect")
      res.writeHead(302, { location: "https://example.invalid/" });
    res.end("fixture");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    const code = `
      const assert = require('node:assert/strict');
      const net = require('node:net');
      (async () => {
        assert.equal(await (await fetch('http://127.0.0.1:${port}/owned')).text(), 'fixture');
        assert.equal(await (await fetch('https://api.resend.com/emails', {method:'POST', body:'{}'})).text(), 'fixture');
        assert.equal(await (await fetch(new Request('https://ipinfo.io/127.0.0.1/json'))).text(), 'fixture');
        for (const target of ['https://example.invalid/', 'http://api.resend.com/emails', 'https://api.resend.com.evil.invalid/emails', 'http://127.0.0.1:9/', 'http://user:secret@127.0.0.1:${port}/']) {
          await assert.rejects(fetch(target), /unowned network/);
        }
        await assert.rejects(fetch('http://127.0.0.1:${port}/redirect'));
        assert.throws(() => net.connect('/tmp/unknown.sock'), /unowned network/);
        assert.throws(() => net.connect(9, '127.0.0.1'), /unowned network/);
      })().catch(() => { process.exitCode = 1; });
    `;
    const child = spawn(process.execPath, ["--require", guard, "-e", code], {
      env: {
        PATH: path.dirname(process.execPath),
        GRIDA_FORMS_TEST_PORTS: String(port),
        GRIDA_FORMS_TEST_PROVIDER_ORIGIN: `http://127.0.0.1:${port}`,
      },
      stdio: "ignore",
    });
    assert.equal(
      await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", resolve);
      }),
      0
    );
    assert.deepEqual(paths, [
      "/owned",
      "/resend/emails",
      "/ipinfo/127.0.0.1/json",
      "/redirect",
    ]);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
