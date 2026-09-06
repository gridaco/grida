// GRIDA-SEC-004 — the offline package proof supplies every provider transport.
// GRIDA-SEC-006 — synthetic credentials cannot fall through to ambient discovery.
// GRIDA-GG: provider — no gateway/provider service is contacted by this proof.
const { syncBuiltinESMExports, registerHooks } = require("node:module");
const fs = require("node:fs");
const path = require("node:path");
const { fileURLToPath } = require("node:url");

const counts = { network: 0, state: 0, credentials: 0 };
function deny(kind) {
  counts[kind]++;
  throw new Error(`Offline AI proof rejected ${kind} access`);
}
globalThis.fetch = async () => deny("network");
globalThis.WebSocket = class {
  constructor() {
    deny("network");
  }
};
for (const [name, methods] of [
  ["node:http", ["request", "get"]],
  ["node:https", ["request", "get"]],
  ["node:http2", ["connect"]],
  ["node:net", ["connect", "createConnection", "createServer"]],
  ["node:tls", ["connect", "createServer"]],
  ["node:dgram", ["createSocket"]],
  ["node:dns", ["lookup", "resolve", "resolve4", "resolve6"]],
]) {
  const module = require(name);
  for (const method of methods) module[method] = () => deny("network");
}
require("node:net").Socket.prototype.connect = () => deny("network");
for (const method of ["lookup", "resolve", "resolve4", "resolve6"]) {
  require("node:dns/promises")[method] = async () => deny("network");
}

if (process.env.GRIDA_AI_PROOF_CONSUMER === "1") {
  const root = process.cwd();
  const loaded = new Set();
  const forbidden =
    /^(?:@grida\/(?!ai(?:\/|$)|ai-models(?:\/|$))|@app\/|@agentclientprotocol\/|grida(?:\/|$)|electron(?:\/|$)|next(?:\/|$)|react(?:-dom)?(?:\/|$)|hono(?:\/|$)|@hono\/|drizzle-orm(?:\/|$))/;
  registerHooks({
    resolve(specifier, context, next) {
      if (forbidden.test(specifier)) {
        throw new Error("Host dependency is unavailable in the AI proof");
      }
      const result = next(specifier, context);
      if (result.url.startsWith("file:")) {
        const relative = path.relative(root, fileURLToPath(result.url));
        if (relative.startsWith("..") || path.isAbsolute(relative)) {
          throw new Error(
            "AI consumer resolved outside its copied package tree"
          );
        }
        loaded.add(relative);
      }
      return result;
    },
  });

  // Node's normal CJS loader reads package code through fs. Permit that code,
  // while refusing application state, credentials, and all writes. In particular
  // do not substitute @vercel/oidc's browser entry for its real Node entry.
  const moduleFile = (value) => {
    if (value instanceof URL) value = fileURLToPath(value);
    if (typeof value !== "string") return false;
    const relative = path.relative(root, path.resolve(value));
    return (
      !relative.startsWith("..") &&
      !path.isAbsolute(relative) &&
      /\.(?:[cm]?js|json)$/.test(relative) &&
      (relative.startsWith(`node_modules${path.sep}`) ||
        relative === "consumer.mjs")
    );
  };
  const modulePath = (value) => {
    if (moduleFile(value)) return true;
    if (value instanceof URL) value = fileURLToPath(value);
    if (typeof value !== "string") return false;
    const relative = path.relative(root, path.resolve(value));
    return (
      relative === "" ||
      relative === "node_modules" ||
      (!relative.startsWith("..") &&
        !path.isAbsolute(relative) &&
        relative.startsWith(`node_modules${path.sep}`))
    );
  };
  for (const owner of [fs, fs.promises]) {
    for (const name of ["readFile", "readFileSync"]) {
      if (typeof owner[name] !== "function") continue;
      const original = owner[name];
      owner[name] = function (filename, ...args) {
        if (!moduleFile(filename)) return deny("state");
        return original.call(this, filename, ...args);
      };
    }
    for (const name of [
      "existsSync",
      "access",
      "accessSync",
      "stat",
      "statSync",
      "lstat",
      "lstatSync",
      "readdir",
      "readdirSync",
      "realpath",
      "realpathSync",
      "readlink",
      "readlinkSync",
    ]) {
      if (typeof owner[name] !== "function") continue;
      const original = owner[name];
      owner[name] = function (filename, ...args) {
        if (!modulePath(filename)) return deny("state");
        return original.call(this, filename, ...args);
      };
    }
    for (const name of ["open", "openSync"]) {
      if (typeof owner[name] !== "function") continue;
      const original = owner[name];
      owner[name] = function (filename, flags, ...args) {
        if (!moduleFile(filename) || ![undefined, "r", 0].includes(flags))
          return deny("state");
        return original.call(this, filename, flags, ...args);
      };
    }
    for (const name of [
      "writeFile",
      "writeFileSync",
      "appendFile",
      "appendFileSync",
      "unlink",
      "unlinkSync",
      "rename",
      "renameSync",
      "mkdir",
      "mkdirSync",
      "rm",
      "rmSync",
      "createReadStream",
      "createWriteStream",
      "chmod",
      "chmodSync",
    ]) {
      if (typeof owner[name] === "function") owner[name] = () => deny("state");
    }
  }
  const environment = process.env;
  process.env = new Proxy(environment, {
    get(target, key) {
      if (
        typeof key === "string" &&
        /(?:API_KEY|OIDC|ACCESS_TOKEN|REFRESH_TOKEN|AUTH_TOKEN|GG_TOKEN|SUPABASE)/i.test(
          key
        )
      ) {
        return deny("credentials");
      }
      return Reflect.get(target, key);
    },
  });
  Object.defineProperty(globalThis, "__gridaAiProof", {
    value: { counts, loaded },
    writable: false,
  });
}
syncBuiltinESMExports();
