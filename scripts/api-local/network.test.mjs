// GRIDA-SEC-012 — no inherited context or accidental shared-service I/O.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const guard = fileURLToPath(new URL("./network.cjs", import.meta.url));

function run(source, ports = "55481,55482") {
  return spawnSync(process.execPath, ["--require", guard, "-e", source], {
    env: { GRIDA_API_TEST_PORTS: ports },
    encoding: "utf8",
    timeout: 5_000,
  });
}

for (const endpoint of [
  { host: "example.invalid", port: 55481 },
  { host: "127.0.0.1", port: 55431 },
  { host: "localhost", port: 80 },
  { path: "/var/run/docker.sock" },
]) {
  test(`rejects unowned socket ${JSON.stringify(endpoint)}`, () => {
    const child = run(`
      const assert = require('node:assert/strict');
      const net = require('node:net');
      assert.throws(() => net.connect(${JSON.stringify(endpoint)}), /unowned network/);
    `);
    assert.equal(child.status, 0, child.stderr);
  });
}

for (const url of [
  "https://127.0.0.1:55481/",
  "http://127.0.0.1:55431/",
  "http://example.invalid:55481/",
  "http://user:password@127.0.0.1:55481/",
]) {
  test(`rejects unowned fetch ${url}`, () => {
    const child = run(`
      const assert = require('node:assert/strict');
      assert.rejects(fetch(${JSON.stringify(url)}), /unowned network/);
    `);
    assert.equal(child.status, 0, child.stderr);
  });
}

for (const ports of ["", "80", "0", "65536", "55481,garbage"]) {
  test(`rejects invalid owned-port configuration ${JSON.stringify(ports)}`, () => {
    const child = run("", ports);
    assert.notEqual(child.status, 0);
  });
}

test("permits only the explicitly owned listener and refuses redirects", async () => {
  const { createServer } = await import("node:http");
  let requests = 0;
  const server = createServer((_request, response) => {
    requests++;
    response.writeHead(302, { location: "http://127.0.0.1:55431/" });
    response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    const { spawn } = await import("node:child_process");
    const child = spawn(
      process.execPath,
      [
        "--require",
        guard,
        "-e",
        `require('node:assert/strict').rejects(fetch('http://127.0.0.1:${port}/'));`,
      ],
      { env: { GRIDA_API_TEST_PORTS: String(port) }, stdio: "ignore" }
    );
    const exit = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("Guard proof deadline exceeded"));
      }, 5_000);
      child.once("exit", (code) => {
        clearTimeout(timer);
        resolve(code);
      });
      child.once("error", reject);
    });
    assert.equal(exit, 0);
    assert.equal(requests, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
