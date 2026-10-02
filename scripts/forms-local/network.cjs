// Forms proof transport: exact recorded providers, otherwise owned loopback only.
// Application guard, not an OS network sandbox. Never loaded by product code.
const net = require("node:net");
const { syncBuiltinESMExports } = require("node:module");

const raw = process.env.GRIDA_FORMS_TEST_PORTS ?? "";
if (!/^\d+(,\d+)*$/.test(raw))
  throw new Error("Forms proof requires owned ports");
const ports = new Set(raw.split(",").map(Number));
if ([...ports].some((port) => port < 1024 || port > 65535)) {
  throw new Error("Forms proof requires unprivileged ports");
}
const hosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const allowed = (host, port) =>
  hosts.has(host ?? "localhost") && ports.has(Number(port));
const denied = () => new Error("Forms proof rejected unowned network access");
const provider = new URL(process.env.GRIDA_FORMS_TEST_PROVIDER_ORIGIN);
if (
  provider.protocol !== "http:" ||
  !allowed(provider.hostname, provider.port) ||
  provider.username ||
  provider.password ||
  provider.pathname !== "/"
)
  throw denied();

const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const normalized = Array.isArray(args[0]) ? args[0] : args;
  const first = normalized[0];
  if (first && typeof first === "object") {
    if (first.path || !allowed(first.host, first.port)) throw denied();
  } else if (typeof first === "number" || /^\d+$/.test(first ?? "")) {
    if (
      !allowed(
        typeof normalized[1] === "string" ? normalized[1] : "localhost",
        first
      )
    )
      throw denied();
  } else throw denied();
  return connect.apply(this, args);
};

const providers = new Map([
  ["https://api.resend.com", "/resend"],
  ["https://ipinfo.io", "/ipinfo"],
  ["https://api.bird.com", "/bird"],
]);
const fetch = globalThis.fetch;
globalThis.fetch = function (input, options) {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.username || url.password) return Promise.reject(denied());
  const prefix = providers.get(url.origin);
  if (prefix) {
    const replacement = new URL(prefix + url.pathname + url.search, provider);
    input =
      input instanceof Request ? new Request(replacement, input) : replacement;
  } else if (url.protocol !== "http:" || !allowed(url.hostname, url.port)) {
    return Promise.reject(denied());
  }
  return fetch(input, { ...options, redirect: "error" });
};
syncBuiltinESMExports();
