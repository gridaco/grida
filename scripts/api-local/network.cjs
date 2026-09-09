// GRIDA-SEC-012 — owned-loopback test I/O; this is not an OS network sandbox.
const net = require("node:net");
const { syncBuiltinESMExports } = require("node:module");

const raw = process.env.GRIDA_API_TEST_PORTS ?? "";
if (!/^\d+(,\d+)*$/.test(raw)) {
  throw new Error("API proof requires explicit owned ports");
}
const ports = new Set(raw.split(",").map(Number));
if ([...ports].some((port) => port < 1024 || port > 65535)) {
  throw new Error("API proof ports must be unprivileged TCP ports");
}
const hosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const denied = () => new Error("API proof rejected unowned network access");

function allowed(host, port) {
  return hosts.has(host ?? "localhost") && ports.has(Number(port));
}

const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const normalized = Array.isArray(args[0]) ? args[0] : args;
  const first = normalized[0];
  if (first && typeof first === "object") {
    if (first.path || !allowed(first.host, first.port)) throw denied();
  } else if (typeof first === "number" || /^\d+$/.test(first ?? "")) {
    const host =
      typeof normalized[1] === "string" ? normalized[1] : "localhost";
    if (!allowed(host, first)) throw denied();
  } else {
    throw denied();
  }
  return connect.apply(this, args);
};

const originalFetch = globalThis.fetch;
globalThis.fetch = function (input, options) {
  const url = new URL(input instanceof Request ? input.url : input);
  if (
    url.protocol !== "http:" ||
    url.username ||
    url.password ||
    !allowed(url.hostname, url.port)
  ) {
    return Promise.reject(denied());
  }
  // A redirect is a new destination; no test request follows one implicitly.
  return originalFetch(input, { ...options, redirect: "error" });
};
syncBuiltinESMExports();
