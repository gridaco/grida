// GRIDA-SEC-013 — installed media proof: synthetic provider I/O, real owned GG loopback.
// GRIDA-SEC-006 — synthetic issuer exchange cannot substitute provider or scoped GG authority.
// GRIDA-GG: token — actual owned loopback keeps account and media credentials distinct.
// Reuse the existing local CLI socket/process/module perimeter, then replace only
// the reviewed provider HTTPS/DNS boundary. This is a tripwire, not an OS sandbox.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { syncBuiltinESMExports } = require("node:module");
const root = process.env.GRIDA_CLI_PROOF_ROOT;
assert(root && path.isAbsolute(root));
require(path.join(root, "auth-network.cjs"));
const fixturePath = process.env.GRIDA_MEDIA_PROOF_FIXTURE;
const report = process.env.GRIDA_MEDIA_PROOF_REPORT;
assert(fixturePath && path.dirname(fixturePath) === root);
assert(report && path.dirname(report) === root);
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const stats = {
  requests: [],
  dns: [],
  violations: 0,
  destroyed: 0,
  token_exchanges: 0,
};
let next = 0;
function checked(operation) {
  try {
    return operation();
  } catch {
    stats.violations++;
    throw new Error("Synthetic media wire mismatch");
  }
}
const addresses = fixture.dns ?? {};
require("node:dns/promises").lookup = async (hostname, options) =>
  checked(() => {
    assert.deepEqual(options, { all: true, verbatim: true });
    assert(Object.hasOwn(addresses, hostname), "Unexpected DNS authority");
    stats.dns.push(hostname);
    return addresses[hostname];
  });
// The issuer exchange is synthetic. Account API/mint/media use the real owned
// HTTP listener. No issuer, provider or production service is contacted.
const fetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.origin === "http://127.0.0.1:55431")
    return checked(() => {
      assert.equal(url.pathname, "/auth/v1/oauth/token");
      assert.equal(init?.method, "POST");
      assert.equal(init?.redirect, "manual");
      const headers = new Headers(init?.headers);
      assert.equal(
        headers.get("content-type"),
        "application/x-www-form-urlencoded"
      );
      assert.equal(headers.get("authorization"), null);
      const body = new URLSearchParams(init.body);
      assert.equal(body.get("client_id"), "synthetic-media-client");
      assert.equal(body.get("grant_type"), "authorization_code");
      assert.equal(body.get("code"), "synthetic-media-code");
      assert.match(body.get("code_verifier"), /^[A-Za-z0-9_-]{43,128}$/);
      assert(
        [
          "http://127.0.0.1:55435/callback",
          "http://127.0.0.1:55436/callback",
        ].includes(body.get("redirect_uri"))
      );
      stats.token_exchanges++;
      return Response.json({
        access_token: "synthetic-account-access",
        refresh_token: "synthetic-account-refresh",
        token_type: "bearer",
        expires_in: 3600,
      });
    });
  return fetch(input, init);
};
const net = require("node:net");
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const values = Array.isArray(args[0]) ? args[0] : args;
  const options = values[0];
  const host = typeof options === "object" ? options?.host : values[1];
  const port = typeof options === "object" ? options?.port : options;
  checked(() =>
    assert(host === "127.0.0.1" && Number(port) === 3041 && !options?.path)
  );
  return connect.apply(this, args);
};
require("node:https").request = (options, callback) => {
  let expected;
  checked(() => {
    expected = fixture.requests[next++];
    assert(expected, "Unexpected HTTPS request");
    assert.equal(options.protocol, "https:");
    assert.equal(options.hostname, expected.hostname);
    assert.equal(Number(options.port), 443);
    assert.equal(options.path, expected.path);
    assert.equal(options.method, expected.method);
    assert.equal(options.agent, false);
    assert.equal(options.autoSelectFamily, false);
    assert.equal(options.rejectUnauthorized, true);
    assert.equal(options.servername, expected.hostname);
    assert.equal(options.family, 4);
    assert.equal(options.proxyEnv, undefined);
    assert.equal(options.headers["accept-encoding"], "identity");
    assert.equal(options.headers.cookie, undefined);
    assert.equal(options.headers.host, undefined);
    const credentialHeaders = [
      "authorization",
      "xi-api-key",
      "proxy-authorization",
    ];
    for (const header of credentialHeaders)
      assert.equal(options.headers[header], expected.headers?.[header]);
    for (const [name, value] of Object.entries(expected.headers ?? {}))
      assert.equal(options.headers[name], value);
    let called = false;
    options.lookup(
      expected.hostname,
      { family: 4 },
      (error, address, family) => {
        assert.equal(error, null);
        assert.equal(address, "93.184.216.34");
        assert.equal(family, 4);
        called = true;
      }
    );
    assert(called, "Pinned lookup callback must resolve synchronously");
  });
  const request = new EventEmitter();
  let incoming;
  let destroyed = false;
  const aborted = () =>
    request.emit("error", new Error("synthetic aborted socket"));
  options.signal.addEventListener("abort", aborted, { once: true });
  request.destroy = () => {
    if (!destroyed) {
      destroyed = true;
      stats.destroyed++;
    }
    options.signal.removeEventListener("abort", aborted);
    incoming?.destroy();
    return request;
  };
  request.setTimeout = () => request;
  request.end = (body) => {
    checked(() => {
      if (expected.json !== undefined)
        assert.deepEqual(JSON.parse(body.toString("utf8")), expected.json);
      else assert(body === undefined || body.byteLength === 0);
      // Count only completely verified request wires, even on expected failures.
      stats.requests.push({
        hostname: expected.hostname,
        path: expected.path,
        method: expected.method,
      });
      if (expected.pending)
        process.stderr.write("[synthetic-media] request accepted\n");
    });
    queueMicrotask(() => {
      if (destroyed) return;
      if (expected.pending) return;
      incoming = new PassThrough();
      incoming.statusCode = expected.response?.status ?? 200;
      incoming.rawHeaders = Object.entries(
        expected.response?.headers ?? {}
      ).flat();
      incoming.complete = false;
      callback(incoming);
      if (incoming.destroyed || expected.response?.hold) return;
      incoming.end(Buffer.from(expected.response?.base64 ?? "", "base64"));
      incoming.complete = true;
      incoming.once("end", () =>
        options.signal.removeEventListener("abort", aborted)
      );
    });
  };
  return request;
};
syncBuiltinESMExports();
process.on("exit", () =>
  fs.writeFileSync(report, JSON.stringify(stats), { mode: 0o600 })
);
