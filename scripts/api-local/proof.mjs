// GRIDA-SEC-012 — production Next pipeline proof with private, synthetic inputs.
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const scripts = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(scripts, "../..");
const require = createRequire(path.join(repository, "editor/package.json"));
const next = require.resolve("next/dist/bin/next");
const nextVersion = require("next/package.json").version;
const copiedFiles = [
  "package.json",
  "tsconfig.json",
  "proxy.ts",
  "lib/api/operations.ts",
  "lib/api/policy.ts",
  "lib/api/account.ts",
  "lib/account/account.ts",
  "lib/supabase/account-data.ts",
  "lib/auth/bearer.ts",
  "lib/auth/oauth-server.ts",
  "lib/desktop/csp.ts",
  "lib/domains/index.ts",
  "lib/platform/index.ts",
  "app/(api)/(public)/api/v1/auth/me/route.ts",
  "app/(api)/(public)/api/v1/account/organizations/route.ts",
];

function check(condition, label) {
  if (!condition) throw new Error(label);
}

async function put(filename, contents) {
  await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  await writeFile(filename, contents, { mode: 0o600 });
}

function redact(value) {
  return value
    .replace(/[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, "[JWT]")
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]");
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server.address().port;
}

async function close(server) {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}

/** Uses real HTTP; no NextRequest, route, fetch, or response implementation is mocked. */
function request(
  port,
  pathname,
  { method = "GET", headers = {}, body, timeoutMs = 12_000 } = {}
) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { hostname: "127.0.0.1", port, path: pathname, method, headers },
      (response) => {
        const chunks = [];
        let size = 0;
        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > 1024 * 1024)
            req.destroy(new Error("Proof response too large"));
          else chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          })
        );
      }
    );
    req.setTimeout(timeoutMs, () =>
      req.destroy(new Error("Proof request deadline"))
    );
    req.on("error", reject);
    req.end(body);
  });
}

function issuerFixture() {
  const client = randomUUID();
  const users = [
    { id: randomUUID(), email: "alpha@example.invalid", display_name: "Alpha" },
    { id: randomUUID(), email: "beta@example.invalid", display_name: "Beta" },
  ];
  const key = randomBytes(32);
  const tokens = new Map();
  const fixture = {
    client,
    users,
    calls: 0,
    databaseCalls: 0,
    mode: "ok",
    databaseMode: "ok",
    databaseLimit: 100,
    organizations: [
      Array.from({ length: 101 }, (_, index) => ({
        id: index + 1,
        name: `alpha-${index + 1}`,
        display_name: `Alpha ${index + 1}`,
      })),
      [{ id: 1001, name: "beta", display_name: "Beta organization" }],
    ],
    origin: "",
  };
  fixture.token = (index, claims = {}) => {
    const payload = {
      iss: `${fixture.origin}/auth/v1`,
      aud: "authenticated",
      sub: users[index].id,
      session_id: randomUUID(),
      client_id: client,
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...claims,
    };
    const encoded = [{ alg: "HS256", typ: "JWT" }, payload].map((value) =>
      Buffer.from(JSON.stringify(value)).toString("base64url")
    );
    const content = encoded.join(".");
    const token = `${content}.${createHmac("sha256", key).update(content).digest("base64url")}`;
    tokens.set(token, index);
    return token;
  };
  fixture.server = createServer((req, response) => {
    const url = new URL(req.url, fixture.origin);
    const database = url.pathname === "/rest/v1/organization";
    if (database) fixture.databaseCalls++;
    else fixture.calls++;
    response.setHeader("cache-control", "no-store");
    if (
      req.method !== "GET" ||
      (!database && req.url !== "/auth/v1/oauth/userinfo") ||
      req.headers.apikey !== "synthetic-publishable-key"
    ) {
      response.writeHead(500).end();
      return;
    }
    const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    const index = tokens.get(token);
    if (index === undefined || fixture.mode === "revoked") {
      response.writeHead(401).end();
      return;
    }
    if (database) {
      const after = url.searchParams.get("id");
      if (
        url.searchParams.get("select") !== "id,name,display_name" ||
        url.searchParams.get("order") !== "id.asc" ||
        url.searchParams.get("limit") !== "100" ||
        [...url.searchParams.keys()].some(
          (key) => !["select", "order", "limit", "id"].includes(key)
        ) ||
        (after !== null && !/^gt\.[1-9]\d*$/.test(after)) ||
        req.headers["accept-profile"] !== "public" ||
        req.headers.prefer !== "count=exact" ||
        req.headers.cookie !== undefined
      ) {
        response.writeHead(500).end();
        return;
      }
      const status = { unauthorized: 401, forbidden: 403, unavailable: 503 }[
        fixture.databaseMode
      ];
      if (status) {
        response.writeHead(status).end();
        return;
      }
      if (fixture.databaseMode === "redirect") {
        response
          .writeHead(302, { location: `${fixture.origin}/unexpected-database` })
          .end();
        return;
      }
      const cursor = after === null ? 0 : Number(after.slice(3));
      const visible = fixture.organizations[index]
        .filter((row) => row.id > cursor)
        .toSorted((left, right) => left.id - right.id);
      const rows = visible.slice(0, Math.min(100, fixture.databaseLimit));
      response.statusCode = rows.length < visible.length ? 206 : 200;
      response.setHeader("content-type", "application/json");
      if (fixture.databaseMode !== "missing-count") {
        response.setHeader(
          "content-range",
          rows.length === 0 ? "*/0" : `0-${rows.length - 1}/${visible.length}`
        );
      }
      response.end(
        fixture.databaseMode === "malformed"
          ? "invalid JSON"
          : JSON.stringify(
              rows.map((row) => ({ ...row, ignored: "upstream-only" }))
            )
      );
      return;
    }
    if (fixture.mode === "unavailable") {
      response.writeHead(503).end();
      return;
    }
    if (fixture.mode === "redirect") {
      response
        .writeHead(302, { location: `${fixture.origin}/unexpected` })
        .end();
      return;
    }
    response.setHeader("content-type", "application/json");
    const user = users[index];
    response.end(
      fixture.mode === "malformed"
        ? "invalid JSON"
        : JSON.stringify({
            sub: fixture.mode === "mismatch" ? randomUUID() : user.id,
            email: user.email,
            name: user.display_name,
            ignored: "upstream-only field",
          })
    );
  });
  return fixture;
}

async function dependencies(editor, workspace) {
  await symlink(
    path.join(repository, "editor/node_modules"),
    path.join(editor, "node_modules"),
    "dir"
  );
  await symlink(
    path.join(repository, "node_modules"),
    path.join(workspace, "node_modules"),
    "dir"
  );
  await put(
    path.join(editor, "proof-edge-config.ts"),
    `import { appendFileSync } from 'node:fs';
export async function get() {
  appendFileSync(process.env.GRIDA_API_TEST_TRIPWIRE!, 'maintenance\\n');
  return false;
}\n`
  );
}

async function snapshot(editor, workspace) {
  const hashes = [];
  for (const relative of [...copiedFiles, "next.config.ts"]) {
    const source = path.join(repository, "editor", relative);
    const destination = path.join(
      editor,
      relative === "next.config.ts" ? "next.actual.config.ts" : relative
    );
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await copyFile(source, destination);
    hashes.push({
      path: `editor/${relative}`,
      sha256: createHash("sha256")
        .update(await readFile(destination))
        .digest("hex"),
    });
  }
  // The original config and every header/redirect are unchanged. Only Turbopack's
  // dependency resolution root and the unrelated Edge Config tripwire are adapted.
  await put(
    path.join(editor, "next.config.ts"),
    `import original from './next.actual.config';
export default { ...original, turbopack: { ...original.turbopack, root: ${JSON.stringify(repository)}, resolveAlias: { ...original.turbopack?.resolveAlias, "@vercel/edge-config": './proof-edge-config.ts' } } };\n`
  );
  await put(
    path.join(editor, "lib/supabase/proxy.ts"),
    `import { appendFileSync } from 'node:fs';
import { NextResponse } from 'next/server';
export async function updateSession() {
  appendFileSync(process.env.GRIDA_API_TEST_TRIPWIRE!, 'cookies\\n');
  const response = NextResponse.next();
  response.cookies.set('api-proof-web', 'fixture');
  return response;
}\n`
  );
  await put(
    path.join(editor, "lib/tenant/middleware.ts"),
    `import { appendFileSync } from 'node:fs';
export const TenantMiddleware = { async routeProxyRequest(_request: unknown, response: Response) {
  appendFileSync(process.env.GRIDA_API_TEST_TRIPWIRE!, 'tenant\\n');
  return response;
} };\n`
  );
  await put(
    path.join(editor, "app/layout.tsx"),
    `export default function Layout({children}: {children: React.ReactNode}) { return <html><body>{children}</body></html>; }\n`
  );
  await put(
    path.join(editor, "app/page.tsx"),
    `export default function Page() { return <main>API pipeline fixture</main>; }\n`
  );
  await put(
    path.join(editor, "app/proof-web/route.ts"),
    `export function GET() { return Response.json({fixture: true}); }\n`
  );
  await put(
    path.join(editor, "app/insiders/auth/basic/route.ts"),
    `import { appendFileSync } from 'node:fs';
function forbidden() { appendFileSync(process.env.GRIDA_API_TEST_TRIPWIRE!, 'insiders\\n'); return new Response('Unexpected insiders handler', {status: 500}); }
export const GET = forbidden;
export const POST = forbidden;\n`
  );
  await dependencies(editor, workspace);
  return hashes;
}

function childProcess(args, cwd, env) {
  const child = spawn(process.execPath, [next, ...args], {
    cwd,
    env,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => {
      output = (output + chunk.toString()).slice(-2 * 1024 * 1024);
    });
  }
  const done = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  const kill = (signal) => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    try {
      if (process.platform === "win32") child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  };
  return {
    child,
    done,
    log: () => redact(output),
    async stop() {
      kill("SIGTERM");
      const stopped = await Promise.race([
        done.then(() => true),
        delay(5000, undefined, { ref: false }).then(() => false),
      ]);
      if (!stopped) {
        kill("SIGKILL");
        await done;
      }
    },
  };
}

async function ready(process, port) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    check(
      process.child.exitCode === null && process.child.signalCode === null,
      "Next exited before readiness"
    );
    try {
      await request(port, "/api/v1/auth/me", { timeoutMs: 1000 });
      return;
    } catch {
      await delay(200);
    }
  }
  throw new Error("Next readiness deadline exceeded");
}

async function organizationAssertions(port, issuer, safe, alpha, beta) {
  const endpoint = "/api/v1/account/organizations";
  const auth = (token) => ({ authorization: `Bearer ${token}` });
  const page = async (token, rows, cursor = null, after) => {
    const value = safe(
      await request(
        port,
        endpoint + (after === undefined ? "" : `?after=${after}`),
        {
          headers: {
            ...auth(token),
            cookie: "sb-session=synthetic-web-cookie",
          },
        }
      ),
      200,
      "organization page"
    );
    check(
      JSON.stringify(value) ===
        JSON.stringify({ organizations: rows, next_cursor: cursor }),
      "Organization page identity, projection, order or continuation mismatch"
    );
  };
  const alphaRows = issuer.organizations[0];
  const betaRows = issuer.organizations[1];
  await page(alpha, alphaRows.slice(0, 100), 100);
  await page(beta, betaRows);
  await page(alpha, alphaRows.slice(0, 100), 100);
  await page(alpha, alphaRows.slice(100), null, 100);
  await page(alpha, [], null, 101);
  issuer.databaseLimit = 2;
  await page(alpha, alphaRows.slice(0, 2), 2);
  await page(alpha, alphaRows.slice(2, 4), 4, 2);
  issuer.databaseLimit = 100;

  // Simulated row visibility only. The separate Supabase proof owns actual RLS.
  issuer.organizations[1] = [alphaRows[0], ...betaRows];
  await page(beta, [alphaRows[0], ...betaRows]);
  issuer.organizations[1] = betaRows;
  await page(beta, betaRows);
  issuer.organizations[1] = [];
  await page(beta, []);
  issuer.organizations[1] = betaRows;

  let beforeAuth = issuer.calls;
  let beforeData = issuer.databaseCalls;
  for (const headers of [
    {},
    { cookie: "sb-session=synthetic-web-cookie" },
    auth("gg_synthetic_credential"),
    auth(issuer.token(0, { exp: Math.floor(Date.now() / 1000) - 1 })),
    auth(issuer.token(0, { client_id: randomUUID() })),
  ]) {
    safe(
      await request(port, endpoint, { headers }),
      401,
      "organization credential rejection"
    );
  }
  check(
    issuer.calls === beforeAuth && issuer.databaseCalls === beforeData,
    "Invalid organization credential reached issuer/database"
  );
  issuer.mode = "revoked";
  safe(
    await request(port, endpoint, { headers: auth(alpha) }),
    401,
    "organization live-session rejection"
  );
  check(
    issuer.databaseCalls === beforeData,
    "Revoked session reached organization data"
  );
  issuer.mode = "ok";

  beforeAuth = issuer.calls;
  for (const query of [
    "after=0",
    "after=-1",
    "after=01",
    "after=1.0",
    "after=1e2",
    "after=9007199254740992",
    "after=1&after=2",
    "limit=1",
    "user_id=another-user",
    "organization_id=1",
  ]) {
    safe(
      await request(port, `${endpoint}?${query}`, { headers: auth(alpha) }),
      400,
      "organization input rejection"
    );
  }
  safe(
    await request(port, endpoint, {
      headers: { ...auth(alpha), "content-length": "1" },
      body: "x",
    }),
    400,
    "organization GET body rejection"
  );
  safe(
    await request(port, endpoint, {
      method: "OPTIONS",
      headers: { "content-length": "1" },
      body: "x",
    }),
    400,
    "organization OPTIONS body rejection",
    false
  );
  check(
    issuer.calls === beforeAuth && issuer.databaseCalls === beforeData,
    "Rejected organization input reached issuer/database"
  );

  safe(
    await request(port, endpoint, { method: "HEAD", headers: auth(alpha) }),
    200,
    "organization authenticated HEAD",
    false
  );
  safe(
    await request(port, endpoint, { method: "HEAD" }),
    401,
    "organization unauthenticated HEAD",
    false
  );
  beforeAuth = issuer.calls;
  beforeData = issuer.databaseCalls;
  const options = await request(port, endpoint, { method: "OPTIONS" });
  safe(options, 204, "organization OPTIONS", false);
  check(
    options.headers.allow === "GET, HEAD, OPTIONS",
    "Organization OPTIONS Allow mismatch"
  );
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const response = await request(port, endpoint, {
      method,
      headers: auth(alpha),
    });
    const body = safe(response, 405, "organization method rejection");
    check(
      body.error.code === "method_not_allowed" &&
        response.headers.allow === "GET, HEAD, OPTIONS",
      "Organization method policy mismatch"
    );
  }
  check(
    issuer.calls === beforeAuth && issuer.databaseCalls === beforeData,
    "Organization method rejection reached issuer/database"
  );
  for (const [mode, status] of [
    ["unauthorized", 401],
    ["forbidden", 403],
    ["unavailable", 503],
    ["malformed", 503],
    ["missing-count", 503],
    ["redirect", 503],
  ]) {
    issuer.databaseMode = mode;
    const body = safe(
      await request(port, endpoint, { headers: auth(alpha) }),
      status,
      `organization database ${mode}`
    );
    check(
      body.error && !Object.hasOwn(body, "organizations"),
      "Database failure became an empty organization page"
    );
  }
  issuer.databaseMode = "ok";
}

async function assertions(port, issuer, tripwire) {
  let count = 0;
  const alpha = issuer.token(0);
  const beta = issuer.token(1);
  const auth = (token) => ({ authorization: `Bearer ${token}` });
  const safe = (response, status, label, body = true) => {
    check(
      response.status === status,
      `${label}: expected HTTP ${status}, got ${response.status}`
    );
    check(
      response.headers["cache-control"]?.includes("no-store"),
      `${label}: missing no-store`
    );
    check(
      response.headers["x-content-type-options"] === "nosniff",
      `${label}: missing nosniff`
    );
    check(
      response.headers["referrer-policy"] === "no-referrer",
      `${label}: missing referrer policy`
    );
    check(
      !response.headers["set-cookie"],
      `${label}: unexpected cookie mutation`
    );
    check(!response.headers.location, `${label}: unexpected redirect`);
    if (body) {
      check(
        response.headers["content-type"]?.includes("application/json"),
        `${label}: expected JSON`
      );
    } else check(response.body === "", `${label}: expected empty body`);
    count++;
    return body ? JSON.parse(response.body) : null;
  };
  const identity = async (token, user, label, headers = {}) => {
    const body = safe(
      await request(port, "/api/v1/auth/me", {
        headers: { ...auth(token), ...headers },
      }),
      200,
      label
    );
    check(
      JSON.stringify(body) === JSON.stringify(user),
      `${label}: identity mismatch or extra fields`
    );
  };
  for (const [token, user] of [
    [alpha, issuer.users[0]],
    [beta, issuer.users[1]],
    [alpha, issuer.users[0]],
  ]) {
    await identity(token, user, "two-user cache isolation", {
      cookie: "sb-session=synthetic-web-cookie",
    });
  }
  issuer.users[0].display_name = "Alpha updated";
  await identity(
    alpha,
    issuer.users[0],
    "live identity changes are not cached"
  );
  const calls = issuer.calls;
  for (const headers of [
    {},
    { cookie: "sb-session=synthetic-web-cookie" },
    auth("gg_synthetic_credential"),
    auth(issuer.token(0, { exp: Math.floor(Date.now() / 1000) - 1 })),
    auth(issuer.token(0, { iss: "https://untrusted.invalid/auth/v1" })),
    auth(issuer.token(0, { client_id: randomUUID() })),
  ]) {
    safe(
      await request(port, "/api/v1/auth/me", { headers }),
      401,
      "bearer preflight rejection"
    );
  }
  check(issuer.calls === calls, "Invalid credentials reached the issuer");
  safe(
    await request(port, "/api/v1/auth/me", {
      headers: auth(`${alpha.slice(0, -1)}${alpha.endsWith("a") ? "b" : "a"}`),
    }),
    401,
    "unrecognized signature is rejected by live issuer"
  );
  for (const [mode, status] of [
    ["revoked", 401],
    ["mismatch", 401],
    ["unavailable", 503],
    ["malformed", 503],
    ["redirect", 503],
  ]) {
    issuer.mode = mode;
    safe(
      await request(port, "/api/v1/auth/me", { headers: auth(alpha) }),
      status,
      `issuer ${mode}`
    );
  }
  issuer.mode = "ok";
  await organizationAssertions(port, issuer, safe, alpha, beta);
  safe(
    await request(port, "/api/v1/auth/me", {
      method: "HEAD",
      headers: auth(alpha),
    }),
    200,
    "authenticated HEAD",
    false
  );
  safe(
    await request(port, "/api/v1/auth/me", { method: "HEAD" }),
    401,
    "unauthenticated HEAD",
    false
  );
  const beforeMethods = issuer.calls;
  const options = await request(port, "/api/v1/auth/me", { method: "OPTIONS" });
  safe(options, 204, "OPTIONS", false);
  check(
    options.headers.allow === "GET, HEAD, OPTIONS",
    "OPTIONS Allow mismatch"
  );
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const response = await request(port, "/api/v1/auth/me", {
      method,
      headers: auth(alpha),
    });
    const body = safe(response, 405, `${method} method denial`);
    check(
      body.error.code === "method_not_allowed",
      "Unsupported method error code"
    );
    check(
      response.headers.allow === "GET, HEAD, OPTIONS",
      "Method denial Allow mismatch"
    );
  }
  check(
    issuer.calls === beforeMethods,
    "OPTIONS or unsupported method reached issuer"
  );
  safe(
    await request(port, "/api/v1/auth/me?unexpected=1", {
      headers: auth(alpha),
    }),
    400,
    "query rejected"
  );
  safe(
    await request(port, "/api/v1/auth/me", {
      method: "GET",
      headers: { ...auth(alpha), "content-length": "1" },
      body: "x",
    }),
    400,
    "GET body rejected"
  );
  safe(
    await request(port, "/api/v1/auth/me", {
      method: "OPTIONS",
      headers: { "content-length": "1" },
      body: "x",
    }),
    400,
    "OPTIONS body rejected",
    false
  );
  check(issuer.calls === beforeMethods, "Rejected input reached issuer");
  for (const pathname of [
    "/api/v1",
    "/api/v1/",
    "/api/v1/missing",
    "/api/v1/auth/me/",
    "/api/v1/auth/connect",
    "/%61pi/v1/auth/me",
    "/api%2fv1/auth/me",
    "/api/v%31/auth/me",
    "/API/V1/auth/me",
    "/%41PI/V1/auth/me",
    "/%61pi/v1/auth/me/",
    "/%61pi/v1/auth/connect",
    "/%61pi/v1/%ZZ",
  ]) {
    safe(
      await request(port, pathname, { headers: auth(alpha) }),
      404,
      `unknown API path ${pathname}`
    );
  }
  for (const host of [
    "tenant.localhost",
    "tenant.grida.site",
    "custom.invalid",
    "api.grida.co",
  ]) {
    safe(
      await request(port, "/api/v1/auth/me", {
        headers: {
          ...auth(alpha),
          host,
          "x-forwarded-host": `127.0.0.1:${port}`,
        },
      }),
      404,
      "unconfigured API host"
    );
  }
  await identity(
    alpha,
    issuer.users[0],
    "forwarded host cannot replace configured host",
    { "x-forwarded-host": "custom.invalid" }
  );
  // Next canonicalizes raw slash syntax before proxy. Pin that documented
  // framework response without treating it as an authenticated API operation.
  const beforeSyntax = issuer.calls;
  for (const pathname of ["/api/v1//auth/me", "/api/v1\\auth/me"]) {
    const response = await request(port, pathname, { headers: auth(alpha) });
    check(
      response.status === 308 &&
        response.headers.location === "/api/v1/auth/me",
      "Framework slash normalization changed"
    );
    check(
      !response.headers["set-cookie"],
      "Framework normalization mutated cookies"
    );
    count++;
  }
  check(
    issuer.calls === beforeSyntax,
    "Framework normalization reached the issuer"
  );
  for (const method of ["GET", "POST"]) {
    const response = await request(port, "/insiders/auth/basic", {
      method,
      headers: { "next-action": "synthetic" },
    });
    check(response.status === 404, "Insiders production gate failed");
    count++;
  }
  const redirect = await request(port, "/login");
  check(
    redirect.status === 308 && redirect.headers.location === "/sign-in",
    "Actual configured login redirect missing"
  );
  count++;
  for (const [pathname, status, location] of [
    ["/proof-web/", 308, "/proof-web"],
    [
      "/example/project/document/connect",
      307,
      "/example/project/document/connect/share",
    ],
  ]) {
    const response = await request(port, pathname);
    check(
      response.status === status && response.headers.location === location,
      "Ordinary web redirect changed"
    );
    count++;
  }
  check(
    (await readFile(tripwire, "utf8")) === "",
    "API or gated requests invoked web middleware"
  );
  const web = await request(port, "/proof-web");
  check(
    web.status === 200 && web.headers["set-cookie"],
    "Web positive control did not run"
  );
  check(
    (await readFile(tripwire, "utf8")) === "maintenance\ncookies\ntenant\n",
    "Web tripwires were not all active"
  );
  count++;
  await writeFile(tripwire, "");
  const legacy = await request(port, "/v1/proof-missing");
  check(
    legacy.status === 404 &&
      legacy.headers["access-control-allow-origin"] === "*",
    "Actual configured legacy CORS header changed"
  );
  check(
    legacy.headers["access-control-allow-methods"]?.includes("GET"),
    "Actual configured legacy CORS methods missing"
  );
  check(
    (await readFile(tripwire, "utf8")) === "maintenance\ncookies\ntenant\n",
    "Legacy web positive control did not dispatch normally"
  );
  count++;
  await writeFile(tripwire, "");
  return count;
}

async function main() {
  check(process.argv.length === 2, "Usage: node scripts/api-local/proof.mjs");
  check(
    Number(process.versions.node.split(".")[0]) >= 24,
    "Node 24+ is required"
  );
  const cache = path.join(repository, ".cache/api-local");
  await mkdir(cache, { recursive: true, mode: 0o700 });
  const stat = await lstat(cache);
  check(
    stat.isDirectory() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0,
    "Expected a private API proof cache directory"
  );
  let workspace;
  const issuer = issuerFixture();
  const reservation = createServer();
  let active;
  let interrupted = false;
  const interrupt = () => {
    if (interrupted) return;
    interrupted = true;
    void active?.stop().catch(() => {});
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  const logs = [];
  let phase = "setup";
  let passed = false;
  const reportPath = path.join(cache, `result-${randomUUID()}.json`);
  const report = {
    node: process.version,
    next: nextVersion,
    platform: process.platform,
    architecture: process.arch,
    cases: 0,
  };
  const progress = setInterval(
    () => console.log(`API pipeline proof: ${phase} in progress.`),
    30_000
  );
  try {
    workspace = await mkdtemp(path.join(cache, "next-"));
    const editor = path.join(workspace, "editor");
    const home = path.join(workspace, "home");
    await mkdir(editor, { mode: 0o700 });
    await mkdir(home, { mode: 0o700 });
    const tripwire = path.join(workspace, "tripwire.log");
    await put(tripwire, "");
    const issuerPort = await listen(issuer.server);
    issuer.origin = `http://127.0.0.1:${issuerPort}`;
    const port = await listen(reservation);
    await close(reservation);
    const apiOrigin = `http://127.0.0.1:${port}`;
    const env = {
      PATH: [path.dirname(process.execPath), "/usr/bin", "/bin"].join(
        path.delimiter
      ),
      HOME: home,
      TMPDIR: workspace,
      LANG: "C",
      TZ: "UTC",
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_PUBLIC_GRIDA_USE_TELEMETRY: "0",
      NEXT_PUBLIC_SUPABASE_URL: issuer.origin,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable-key",
      NEXT_PUBLIC_DOCS_URL: apiOrigin,
      NEXT_PUBLIC_BLOG_URL: apiOrigin,
      GRIDA_OAUTH_CLIENT_IDS: issuer.client,
      GRIDA_API_ORIGIN: apiOrigin,
      GRIDA_API_MAINTENANCE: "0",
      GRIDA_API_TEST_PORTS: `${port},${issuerPort}`,
      GRIDA_API_TEST_TRIPWIRE: tripwire,
      NODE_OPTIONS: `--require=${JSON.stringify(path.join(scripts, "network.cjs"))}`,
    };
    check(!interrupted, "API proof interrupted");
    phase = "snapshot";
    report.sources = await snapshot(editor, workspace);
    check(!interrupted, "API proof interrupted");
    phase = "production build";
    console.log(
      `API pipeline proof: Next ${nextVersion}, ${process.version}, production build.`
    );
    active = childProcess(["build"], editor, env);
    const built = await Promise.race([
      active.done,
      delay(180_000, undefined, { ref: false }).then(() => {
        throw new Error("Production build deadline exceeded");
      }),
    ]);
    logs.push(active.log());
    active = undefined;
    check(built.code === 0, "Production Next build failed");
    for (const mode of ["normal", "maintenance", "invalid-config"]) {
      check(!interrupted, "API proof interrupted");
      phase = `production HTTP ${mode}`;
      console.log(`API pipeline proof: ${phase}.`);
      active = childProcess(
        ["start", "--hostname", "127.0.0.1", "--port", String(port)],
        editor,
        {
          ...env,
          ...(mode === "maintenance" ? { GRIDA_API_MAINTENANCE: "1" } : {}),
          ...(mode === "invalid-config"
            ? { GRIDA_API_ORIGIN: `${apiOrigin}/invalid` }
            : {}),
        }
      );
      await ready(active, port);
      if (mode === "normal")
        report.cases += await assertions(port, issuer, tripwire);
      else
        for (const endpoint of [
          "/api/v1/auth/me",
          "/api/v1/account/organizations",
        ]) {
          const before = issuer.calls;
          const beforeData = issuer.databaseCalls;
          const response = await request(port, endpoint, {
            headers: { authorization: `Bearer ${issuer.token(0)}` },
          });
          check(
            response.status === 503 &&
              response.headers["content-type"]?.includes("application/json"),
            `${mode} must return JSON 503`
          );
          check(
            response.headers["cache-control"]?.includes("no-store") &&
              !response.headers["set-cookie"] &&
              !response.headers.location,
            `${mode} response isolation`
          );
          check(
            issuer.calls === before &&
              issuer.databaseCalls === beforeData &&
              (await readFile(tripwire, "utf8")) === "",
            `${mode} invoked auth/web side effects`
          );
          report.cases++;
        }
      await active.stop();
      logs.push(active.log());
      active = undefined;
    }
    passed = true;
  } finally {
    clearInterval(progress);
    const cleanup = await Promise.allSettled([
      active
        ? active.stop().finally(() => logs.push(active.log()))
        : Promise.resolve(),
      close(issuer.server),
      close(reservation),
    ]);
    try {
      // Diagnostic I/O cannot prevent removal of owned source, HOME, and build.
      if (workspace) await rm(workspace, { recursive: true, force: true });
      await put(`${reportPath}.log`, redact(logs.join("\n")));
      const cleanupComplete = cleanup.every(
        (result) => result.status === "fulfilled"
      );
      await put(
        reportPath,
        JSON.stringify(
          {
            ...report,
            passed: passed && cleanupComplete,
            phase,
            sourceAndBuildRemoved: true,
            cleanupComplete,
          },
          null,
          2
        )
      );
      console.log(`API pipeline proof report: ${reportPath}`);
      check(cleanupComplete, "Owned resource cleanup failed");
    } finally {
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", interrupt);
    }
  }
  console.log(
    `API pipeline proof passed: ${report.cases} HTTP cases; owned processes and private source/build removed.`
  );
}

main().catch((error) => {
  console.error(`API pipeline proof failed: ${redact(error.message)}`);
  process.exitCode = 1;
});
