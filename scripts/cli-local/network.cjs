// GRIDA-SEC-010, GRIDA-SEC-011, GRIDA-SEC-013 — shared installed CLI fixture perimeter.
// Tripwires for a trusted local proof, not an OS sandbox. No credential contents are recorded.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { registerHooks, syncBuiltinESMExports } = require("node:module");
const { fileURLToPath } = require("node:url");

const root = process.env.GRIDA_CLI_PROOF_ROOT;
assert(root && path.isAbsolute(root));
const report = process.env.GRIDA_CLI_PROOF_REPORT;
assert(report && path.dirname(report) === root);
const stats = { denied: 0, requests: [] };
const execFile = require("node:child_process").execFile;
const lookup = require("node:dns").lookup;
const promiseLookup = require("node:dns/promises").lookup;
function deny() {
  stats.denied++;
  throw new Error("CLI fixture rejected network or process authority");
}
const allowed = (host, port) =>
  process.env.GRIDA_CLI_PROOF_OFFLINE !== "1" &&
  host === "127.0.0.1" &&
  [3041, 55431].includes(Number(port));
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const values = Array.isArray(args[0]) ? args[0] : args;
  const options = values[0];
  const host = typeof options === "object" ? options?.host : values[1];
  const port = typeof options === "object" ? options?.port : options;
  if (!allowed(host, port) || options?.path) return deny();
  return connect.apply(this, args);
};
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  const options = args[0];
  const host = typeof options === "object" ? options?.host : args[1];
  const port = typeof options === "object" ? options?.port : options;
  if (
    host !== "127.0.0.1" ||
    ![55435, 55436].includes(Number(port)) ||
    options?.path !== undefined ||
    options?.fd !== undefined ||
    options?.handle !== undefined ||
    options?._handle !== undefined
  )
    return deny();
  return listen.apply(this, args);
};
const fetch = globalThis.fetch;
globalThis.fetch = function (input, init) {
  const url = new URL(input instanceof Request ? input.url : input);
  if (
    url.protocol !== "http:" ||
    url.username ||
    url.password ||
    url.hash ||
    !allowed(url.hostname, url.port) ||
    init?.redirect !== "manual"
  )
    return Promise.resolve().then(deny);
  stats.requests.push({ method: init?.method ?? "GET", path: url.pathname });
  return fetch(input, init);
};
for (const [name, methods] of [
  [
    "node:child_process",
    [
      "spawn",
      "spawnSync",
      "exec",
      "execSync",
      "execFile",
      "execFileSync",
      "fork",
    ],
  ],
  ["node:tls", ["connect"]],
  ["node:http2", ["connect"]],
  ["node:dgram", ["createSocket"]],
  ["node:dns", ["lookup", "resolve", "resolve4", "resolve6"]],
]) {
  for (const method of methods) require(name)[method] = deny;
}
// The real macOS custody owner verifies ACLs through this fixed OS tool. Allow
// only its exact read-only invocation for the owned tree and its ancestors.
function guardedExecFile(file, args, options, callback) {
  const target = args?.[1];
  if (
    process.platform !== "darwin" ||
    file !== "/bin/ls" ||
    args?.length !== 2 ||
    args[0] !== "-lde" ||
    typeof target !== "string" ||
    !path.isAbsolute(target) ||
    path.resolve(target) !== target ||
    !(
      target === root ||
      target.startsWith(root + path.sep) ||
      root.startsWith(target === path.sep ? target : target + path.sep)
    ) ||
    JSON.stringify(options?.env) !==
      JSON.stringify({ LC_ALL: "C", LANG: "C" }) ||
    options?.timeout !== 2000 ||
    options?.maxBuffer !== 65536
  )
    return deny();
  return execFile(file, args, options, callback);
}
guardedExecFile[require("node:util").promisify.custom] = (...args) =>
  new Promise((resolve, reject) => {
    guardedExecFile(...args, (error, stdout, stderr) =>
      error ? reject(error) : resolve({ stdout, stderr })
    );
  });
require("node:child_process").execFile = guardedExecFile;
for (const name of ["node:dns", "node:dns/promises"]) {
  const owner = require(name);
  for (const method of Object.keys(owner).filter((value) =>
    /^(?:lookup|resolve|reverse)/.test(value)
  )) {
    owner[method] = name.endsWith("/promises") ? async () => deny() : deny;
  }
  owner.Resolver = class {
    constructor() {
      deny();
    }
  };
}
// Node's own listen/connect path calls lookup even for this literal address.
require("node:dns").lookup = (host, ...args) =>
  host === "127.0.0.1" ? lookup(host, ...args) : deny();
require("node:dns/promises").lookup = (host, ...args) =>
  host === "127.0.0.1"
    ? promiseLookup(host, ...args)
    : Promise.resolve().then(deny);
registerHooks({
  resolve(specifier, context, next) {
    const result = next(specifier, context);
    if (result.url.startsWith("file:")) {
      const relative = path.relative(root, fileURLToPath(result.url));
      assert(
        !relative.startsWith("..") && !path.isAbsolute(relative),
        "Installed CLI resolved outside its private installation"
      );
    }
    return result;
  },
});
const offset = process.env.GRIDA_CLI_PROOF_CLOCK_OFFSET;
if (offset !== undefined) {
  assert(/^\d+$/.test(offset) && Number(offset) <= 3_600_000);
  const now = Date.now;
  Date.now = () => now() + Number(offset);
}
syncBuiltinESMExports();
process.on("exit", () =>
  fs.writeFileSync(report, JSON.stringify(stats), { mode: 0o600 })
);
