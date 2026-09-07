// GRIDA-SEC-004 — test tripwires, not an OS sandbox or a packaged-app proof.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const moduleApi = require("node:module");
const net = require("node:net");
const tls = require("node:tls");
const http = require("node:http");
const https = require("node:https");
const http2 = require("node:http2");
const dns = require("node:dns");
const childProcess = require("node:child_process");

const reportPath = process.env.GRIDA_MEDIA_STARTUP_REPORT;
assert.ok(reportPath);
const counts = { imports: 0, network: 0, processes: 0 };
function forbidden(kind) {
  counts[kind] += 1;
  throw new Error(`media startup attempted forbidden ${kind}`);
}
moduleApi.registerHooks({
  resolve(specifier, context, next) {
    if (/^(?:node:)?sqlite$/.test(specifier)) {
      counts.imports += 1;
      throw new Error(
        `media startup attempted forbidden imports: ${specifier} from ${context.parentURL}`
      );
    }
    return next(specifier, context);
  },
});
const denyNetwork = () => forbidden("network");
// The daemon's existing server toolkit exports a shell runner. Merely importing
// its Node builtin grants no command authority; every invocation is forbidden.
for (const name of [
  "spawn",
  "spawnSync",
  "exec",
  "execSync",
  "execFile",
  "execFileSync",
  "fork",
]) {
  childProcess[name] = () => forbidden("processes");
}
net.connect = net.createConnection = denyNetwork;
net.Socket.prototype.connect = denyNetwork;
net.Server.prototype.listen = denyNetwork;
tls.connect = denyNetwork;
http.request = http.get = https.request = https.get = denyNetwork;
http2.connect = denyNetwork;
for (const name of Object.keys(dns)) {
  if (/^(?:lookup|resolve|reverse)/.test(name)) dns[name] = denyNetwork;
}
for (const name of Object.keys(dns.promises)) {
  if (/^(?:lookup|resolve|reverse)/.test(name))
    dns.promises[name] = denyNetwork;
}
globalThis.fetch = denyNetwork;
moduleApi.syncBuiltinESMExports();

// Prove the import/network tripwires are active before resetting observation.
assert.throws(() => require("node:sqlite"), /forbidden imports/);
assert.throws(() => childProcess.spawn("unused"), /forbidden processes/);
assert.throws(() => childProcess.fork("unused"), /forbidden processes/);
assert.throws(() => net.connect(1, "127.0.0.1"), /forbidden network/);
assert.throws(() => new net.Server().listen(0), /forbidden network/);
assert.throws(
  () => globalThis.fetch("https://example.invalid"),
  /forbidden network/
);
assert.deepEqual(counts, { imports: 1, network: 3, processes: 2 });
counts.imports = counts.network = counts.processes = 0;
process.on("exit", () => {
  fs.writeFileSync(
    reportPath,
    JSON.stringify({
      node: process.versions.node,
      electron: process.versions.electron ?? null,
      counts,
    }),
    { mode: 0o600 }
  );
});
