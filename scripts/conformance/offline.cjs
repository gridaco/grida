// GRIDA-SEC-013 — offline syntax/docs checks cannot open local listeners.
// Extend the installed-CLI tripwire: offline grammar/help must not bind even
// the registered local callback ports that the auth acceptance proof permits.
require("./network.cjs");
const fs = require("node:fs");
let listeners = 0;
require("node:net").Server.prototype.listen = function () {
  listeners++;
  throw new Error("Offline conformance forbids listeners");
};
require("node:module").syncBuiltinESMExports();
process.on("exit", () => {
  const report = process.env.GRIDA_CLI_PROOF_REPORT;
  const stats = JSON.parse(fs.readFileSync(report, "utf8"));
  stats.denied += listeners;
  fs.writeFileSync(report, JSON.stringify(stats), { mode: 0o600 });
});
