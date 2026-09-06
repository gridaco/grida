// GRIDA-SEC-011 — non-loopback transport and redirect guard regressions.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const guard = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "network.cjs"
);

test("application fetch cannot contact a remote origin", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--require",
      guard,
      "--input-type=module",
      "-e",
      `
    await import('node:assert/strict').then(async ({default: assert}) => {
      await assert.rejects(fetch('https://example.invalid'), /non-loopback/);
    });
  `,
    ],
    { encoding: "utf8", env: {} }
  );
  assert.equal(result.status, 0, result.stderr);
});

test("raw sockets cannot bypass the remote-origin guard", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--require",
      guard,
      "-e",
      `
    const assert = require('node:assert/strict');
    const net = require('node:net');
    assert.throws(() => net.connect({host: 'example.invalid', port: 443}), /non-loopback/);
    assert.throws(() => net.connect(443, 'example.invalid'), /non-loopback/);
  `,
    ],
    { encoding: "utf8", env: {} }
  );
  assert.equal(result.status, 0, result.stderr);
});

test("loopback HTTP works and a remote redirect is returned without following it", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--require",
      guard,
      "--input-type=module",
      "-e",
      `
    import assert from 'node:assert/strict';
    import http from 'node:http';
    const server = http.createServer((_, res) => {
      res.writeHead(302, {location: 'https://example.invalid'}); res.end();
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const response = await fetch('http://127.0.0.1:' + server.address().port);
      assert.equal(response.status, 302);
    } finally { server.closeAllConnections(); server.close(); }
  `,
    ],
    { encoding: "utf8", env: {}, timeout: 10000 }
  );
  assert.equal(result.status, 0, result.stderr);
});
