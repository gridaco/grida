// GRIDA-SEC-011 — application loopback guard, not an OS network sandbox.
// Local test-process guard. Install before loading application code, including
// in Node child processes through NODE_OPTIONS. Browser traffic has its own guard.
const net = require("node:net");
const { syncBuiltinESMExports } = require("node:module");

const local = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);
const denied = () =>
  new Error("Local auth tests reject non-loopback network access");
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const normalized = Array.isArray(args[0]) ? args[0] : args;
  const first = normalized[0];
  if (first && typeof first === "object") {
    if (!first.path && !local.has(first.host ?? "localhost")) throw denied();
  } else if (typeof first === "number" || /^\d+$/.test(first ?? "")) {
    const host =
      typeof normalized[1] === "string" ? normalized[1] : "localhost";
    if (!local.has(host)) throw denied();
  }
  return connect.apply(this, args);
};
const fetch = globalThis.fetch;
globalThis.fetch = function (input, options) {
  const url = new URL(input instanceof Request ? input.url : input);
  if (!local.has(url.hostname)) return Promise.reject(denied());
  // Following a redirect is a new request and must be validated by the caller.
  return fetch(input, { ...options, redirect: "manual" });
};
syncBuiltinESMExports();
