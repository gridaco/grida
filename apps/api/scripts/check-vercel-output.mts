import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(app, ".vercel/output");
async function json<T>(filename: string): Promise<T> {
  return JSON.parse(await readFile(filename, "utf8")) as T;
}
type ServiceConfig = {
  services: Record<string, { root: string; framework: string }>;
  rewrites: unknown[];
};
type OutputRoute = { dest?: string };
type OutputConfig = { version: number; routes: OutputRoute[] };
type FunctionConfig = {
  runtime: string;
  maxDuration: number;
  launcherType: string;
  supportsResponseStreaming: boolean;
  handler: string;
};

const input = await json<ServiceConfig>(path.join(app, "vercel.json"));
assert.deepEqual(Object.keys(input.services), ["api"]);
assert.equal(input.services.api.root, ".");
assert.equal(input.services.api.framework, "nitro");
assert.deepEqual(input.rewrites, [
  { source: "/(.*)", destination: { service: "api" } },
]);

const config = await json<OutputConfig>(path.join(output, "config.json"));
assert.equal(config.version, 3);
const routes = config.routes.filter(
  (route): route is OutputRoute & { dest: string } => !!route.dest
);
const destinations = [
  "/health",
  "/v1/[id]",
  "/v1/[id]/session",
  "/v1/submit/[id]",
  "/v1/session/[session]/field/[field]",
  "/v1/session/[session]/field/[field]/file/upload/signed-url",
  "/v1/session/[session]/field/[field]/file/preview/public-url",
  "/v1/session/[session]/field/[field]/challenge/email/start",
  "/v1/session/[session]/field/[field]/challenge/email/state",
  "/v1/session/[session]/field/[field]/challenge/email/verify",
  "/v1/session/[session]/field/[field]/search/meta",
  "/__fallback",
];
assert.deepEqual(routes.map((route) => route.dest).sort(), destinations.sort());
const bundle = await realpath(path.join(output, "functions/__fallback.func"));
for (const route of routes) {
  const functionPath = path.join(
    output,
    "functions",
    `${route.dest.slice(1)}.func`
  );
  assert.equal(
    await realpath(functionPath),
    bundle,
    "Every route must reach the same API implementation"
  );
}
const fn = await json<FunctionConfig>(path.join(bundle, ".vc-config.json"));
assert.equal(fn.runtime, "nodejs24.x");
assert.equal(fn.maxDuration, 60);
assert.equal(fn.launcherType, "Nodejs");
assert.equal(fn.supportsResponseStreaming, true);
assert((await stat(path.join(bundle, fn.handler))).isFile());
const dependencies = Object.keys(
  (
    await json<{ dependencies: Record<string, string> }>(
      path.join(bundle, "package.json")
    )
  ).dependencies
);
assert(!dependencies.some((name) => name === "next" || name === "editor"));

async function routeChunks(directory: string): Promise<string[]> {
  const chunks: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) chunks.push(...(await routeChunks(filename)));
    else if (entry.isFile() && filename.endsWith(".mjs")) chunks.push(filename);
  }
  return chunks;
}
const chunks = await routeChunks(path.join(bundle, "chunks/routes"));
assert.equal(chunks.length, 13);
// TypeScript accepts named imports that a CommonJS dependency may not expose to
// Node's ESM loader. Cold-load the actual packaged adapters without credentials.
const probe = spawnSync(
  process.execPath,
  [
    "--input-type=module",
    "-e",
    `
  import { pathToFileURL } from "node:url";
  for (const filename of process.argv.slice(1)) await import(pathToFileURL(filename));
`,
    ...chunks,
  ],
  {
    env: { PATH: path.dirname(process.execPath), NODE_ENV: "production" },
    timeout: 15_000,
    encoding: "utf8",
  }
);
assert.equal(probe.status, 0, probe.error?.message ?? probe.stderr);
console.log(
  "Vercel output: Node24, one API bundle, all 13 route adapters load; hosted ingress still requires preview verification."
);
