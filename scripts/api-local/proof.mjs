// GRIDA-SEC-012 — production Next pipeline proof with private, synthetic inputs.
// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: token — fresh fixture authority proves mint and credential isolation.
// GRIDA-GG: gateway — real 3D route/upload authority around synthetic execution.
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
import { isDeepStrictEqual } from "node:util";
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
  "lib/api/native.ts",
  "lib/api/account.ts",
  "lib/api/gg.ts",
  "lib/api/gg-media.ts",
  "lib/gg/uploads.ts",
  "lib/account/account.ts",
  "lib/supabase/native-data.ts",
  "lib/supabase/account-data.ts",
  "lib/supabase/credits-data.ts",
  "lib/supabase/gg-data.ts",
  "lib/billing/credits.ts",
  "lib/billing/fees.ts",
  "lib/auth/bearer.ts",
  "lib/auth/gg-token.ts",
  "lib/auth/oauth-server.ts",
  "lib/gg/gg.ts",
  "lib/gg/tokens.ts",
  "lib/gg/config.ts",
  "lib/ai/openai-compat/codec.ts",
  "lib/ai/openai-compat/errors.ts",
  "lib/ai/openai-compat/hosted-models.ts",
  "lib/ai/openai-compat/wire.ts",
  "lib/desktop/csp.ts",
  "lib/domains/index.ts",
  "lib/platform/index.ts",
  "app/(api)/(public)/api/v1/auth/me/route.ts",
  "app/(api)/(public)/api/v1/auth/gg/route.ts",
  "app/(api)/(public)/api/v1/ai/models/route.ts",
  "app/(api)/(public)/api/v1/ai/3d/uploads/route.ts",
  "app/(api)/(public)/api/v1/ai/3d/model-generation/route.ts",
  "app/(api)/(public)/api/v1/ai/3d/rig-check/route.ts",
  "app/(api)/(public)/api/v1/ai/3d/rigging/route.ts",
  "app/(api)/(public)/api/v1/account/organizations/route.ts",
  "app/(api)/(public)/api/v1/account/credits/route.ts",
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
  {
    method = "GET",
    headers = {},
    body,
    bodyEndDelayMs = 0,
    timeoutMs = 12_000,
  } = {}
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
        response.on("end", () => {
          if (bodyEndDelayMs) req.destroy();
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );
    req.setTimeout(timeoutMs, () =>
      req.destroy(
        new Error(`Proof request deadline: ${method} ${pathname.split("?")[0]}`)
      )
    );
    req.on("error", reject);
    if (bodyEndDelayMs) {
      req.flushHeaders();
      if (body) req.write(body);
      const timer = setTimeout(() => req.end(), bodyEndDelayMs);
      req.once("close", () => clearTimeout(timer));
    } else req.end(body);
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
    creditsCalls: 0,
    ggCalls: 0,
    mode: "ok",
    databaseMode: "ok",
    databaseLimit: 100,
    creditsMode: "ok",
    ggMode: "ok",
    credits: [
      [
        {
          organization_id: 1,
          organization_name: "alpha-1",
          organization_display_name: "Alpha 1",
          account_present: true,
          credits_provisioned: true,
          cached_balance_cents: 25,
          cached_balance_at: "2026-01-02T03:04:05.000Z",
          customer_entitled: true,
        },
      ],
      [
        {
          organization_id: 1001,
          organization_name: "beta",
          organization_display_name: "Beta organization",
          account_present: true,
          credits_provisioned: true,
          cached_balance_cents: 500,
          cached_balance_at: "2026-01-02T03:04:05.000Z",
          customer_entitled: true,
        },
      ],
    ],
    organizations: [
      Array.from({ length: 101 }, (_, index) => ({
        id: index + 1,
        name: `alpha-${index + 1}`,
        display_name: `Alpha ${index + 1}`,
      })),
      [{ id: 1001, name: "beta", display_name: "Beta organization" }],
    ],
    authOrigin: "",
    dataOrigin: "",
    wrongServiceCalls: 0,
  };
  fixture.token = (index, claims = {}) => {
    const payload = {
      iss: `${fixture.authOrigin}/auth/v1`,
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
  const handler = (service) => (req, response) => {
    const url = new URL(
      req.url,
      service === "auth" ? fixture.authOrigin : fixture.dataOrigin
    );
    const database = url.pathname === "/rest/v1/organization";
    const credits = url.pathname === "/rest/v1/v_billing_credits";
    const membership = url.pathname === "/rest/v1/organization_member";
    const userinfo = req.url === "/auth/v1/oauth/userinfo";
    response.setHeader("cache-control", "no-store");
    // Auth and Data API aliases need not share an origin. Neither fixture can
    // answer the other service's paths, so incorrect production wiring fails.
    if (
      (service === "auth" && !userinfo) ||
      (service === "data" && !database && !credits && !membership)
    ) {
      fixture.wrongServiceCalls++;
      response.writeHead(500).end();
      return;
    }
    if (credits) {
      fixture.creditsCalls++;
      fixture.databaseCalls++;
    } else if (membership) {
      fixture.ggCalls++;
      fixture.databaseCalls++;
    } else if (database) fixture.databaseCalls++;
    else fixture.calls++;
    if (
      req.method !== "GET" ||
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
    if (membership) {
      const selector = url.searchParams.get("organization_id");
      if (
        url.searchParams.get("select") !==
          "organization_id,organization!inner(id,name)" ||
        url.searchParams.get("user_id") !== `eq.${users[index].id}` ||
        url.searchParams.get("limit") !== "2" ||
        !/^eq\.[1-9]\d*$/.test(selector ?? "") ||
        [...url.searchParams.keys()].sort().join(",") !==
          "limit,organization_id,select,user_id" ||
        req.headers["accept-profile"] !== "public" ||
        req.headers.prefer !== "count=exact" ||
        req.headers.cookie !== undefined
      ) {
        response.writeHead(500).end();
        return;
      }
      const mode = fixture.ggMode;
      const failure = { unauthorized: 401, forbidden: 403, unavailable: 503 }[
        mode
      ];
      if (failure) {
        response.writeHead(failure).end();
        return;
      }
      if (mode === "redirect") {
        response
          .writeHead(302, { location: `${fixture.dataOrigin}/unexpected-gg` })
          .end();
        return;
      }
      const id = Number(selector.slice(3));
      // Both the exact bearer and explicit same-user predicate are required.
      // This is a request fixture; real PostgreSQL owns RLS verification.
      let rows = fixture.organizations[index]
        .filter((organization) => organization.id === id)
        .map((organization) => ({
          organization_id: id,
          organization: { id, name: organization.name },
        }));
      if (mode === "duplicate" && rows.length) rows = [rows[0], rows[0]];
      if (mode === "wrong-org" && rows.length)
        rows = [{ ...rows[0], organization_id: id + 1 }];
      if (mode === "wrong-join" && rows.length)
        rows = [{ ...rows[0], organization: { id: id + 1, name: "wrong" } }];
      if (mode === "invalid-slug" && rows.length)
        rows = [{ ...rows[0], organization: { id, name: "Invalid Slug" } }];
      if (mode === "empty-nonzero-count") rows = [];
      response.statusCode = mode === "partial" ? 206 : 200;
      response.setHeader(
        "content-type",
        mode === "content-type" ? "text/plain" : "application/json"
      );
      if (mode !== "missing-count")
        response.setHeader(
          "content-range",
          {
            "unknown-count": "0-0/*",
            "truncated-count": "0-0/2",
            "bad-range": "1-1/1",
            "empty-nonzero-count": "*/1",
          }[mode] ??
            (rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0")
        );
      response.end(
        mode === "malformed"
          ? "invalid JSON"
          : JSON.stringify(
              rows.map((row) => ({ ...row, ignored: "upstream-only" }))
            )
      );
      return;
    }
    if (credits) {
      const selector = url.searchParams.get("organization_id");
      const projection = [
        "organization_id",
        "organization_name",
        "organization_display_name",
        "account_present",
        "credits_provisioned",
        "cached_balance_cents",
        "cached_balance_at",
        "customer_entitled",
      ].join(",");
      if (
        url.searchParams.get("select") !== projection ||
        url.searchParams.get("limit") !== "2" ||
        !/^eq\.[1-9]\d*$/.test(selector ?? "") ||
        [...url.searchParams.keys()].sort().join(",") !==
          "limit,organization_id,select" ||
        req.headers["accept-profile"] !== "public" ||
        req.headers.prefer !== "count=exact" ||
        req.headers.cookie !== undefined
      ) {
        response.writeHead(500).end();
        return;
      }
      const mode = fixture.creditsMode;
      const failure = { unauthorized: 401, forbidden: 403, unavailable: 503 }[
        mode
      ];
      if (failure) {
        response.writeHead(failure).end();
        return;
      }
      if (mode === "redirect") {
        response
          .writeHead(302, {
            location: `${fixture.dataOrigin}/unexpected-credits`,
          })
          .end();
        return;
      }
      const id = Number(selector.slice(3));
      // This is a visibility fixture, not an implementation of Postgres RLS.
      // The exact bearer determines which organization rows can be returned.
      let rows = fixture.credits[index].filter(
        (row) => row.organization_id === id
      );
      if (mode === "duplicate" && rows.length) rows = [rows[0], rows[0]];
      if (mode === "wrong-org" && rows.length)
        rows = [{ ...rows[0], organization_id: id + 1 }];
      if (mode === "empty-nonzero-count") rows = [];
      response.statusCode = mode === "partial" ? 206 : 200;
      response.setHeader(
        "content-type",
        mode === "content-type" ? "text/plain" : "application/json"
      );
      const range = rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0";
      if (mode !== "missing-count")
        response.setHeader(
          "content-range",
          {
            "unknown-count": "0-0/*",
            "truncated-count": "0-0/2",
            "bad-range": "1-1/1",
            "empty-nonzero-count": "*/1",
          }[mode] ?? range
        );
      response.end(
        mode === "malformed"
          ? "invalid JSON"
          : JSON.stringify(
              rows.map((row) => ({ ...row, ignored: "upstream-only-field" }))
            )
      );
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
          .writeHead(302, {
            location: `${fixture.dataOrigin}/unexpected-database`,
          })
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
        .writeHead(302, { location: `${fixture.authOrigin}/unexpected` })
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
  };
  fixture.authServer = createServer(handler("auth"));
  fixture.dataServer = createServer(handler("data"));
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
  // The fixed execution seam is synthetic; authentication, upload signing,
  // input admission, response streaming, routes and the Next pipeline stay real.
  await put(
    path.join(editor, "lib/ai/gg-three-d.ts"),
    `import { appendFileSync } from 'node:fs';
export namespace GgThreeD {
  export class Failure extends Error {
    constructor(readonly code: 'invalid_request' | 'model_unavailable' | 'provider_unavailable' | 'usage_unavailable' | 'invalid_response' | 'generation_failed' | 'aborted' | 'timeout', readonly task_id?: string) { super(code); }
  }
  function record(operation: string, org: number, fields: Record<string, unknown> = {}) {
    appendFileSync(process.env.GRIDA_API_TEST_MEDIA!, JSON.stringify({operation, org, ...fields}) + '\\n');
  }
  function result() {
    const data = Uint8Array.from({length: 200003}, (_, index) => index % 251);
    return {glb: {data, media_type: 'model/gltf-binary' as const}, task: {id: 'fixture-task', credits_consumed: 25}};
  }
  export async function preparePresign(org: number, media_type: string) {
    record('upload', org, {media_type});
    return {upload_url: 'https://tripo-data.s3.us-west-2.amazonaws.com/fixture-object?X-Amz-Signature=synthetic', file_token: media_type === 'model/gltf-binary' ? 'file_fixture_mesh' : 'file_fixture_image', expires_in: 900};
  }
  export async function modelGenerate(org: number, model_id: string, variant: string, input: unknown) {
    const refs = input as {image?: {file_token: string}; images?: Record<string, {file_token: string}>};
    record('model-generation', org, {model_id, variant, image: refs.image?.file_token, images: refs.images && Object.fromEntries(Object.entries(refs.images).map(([view, value]) => [view, value.file_token]))});
    return result();
  }
  export async function check(org: number, input: unknown) {
    record('rig-check', org, {mesh: (input as {mesh: {file_token: string}}).mesh.file_token});
    return {riggable: true, rig_type: 'biped' as const, task: {id: 'fixture-check', credits_consumed: 0}};
  }
  export async function rig(org: number, model_id: string, input: unknown) {
    record('rigging', org, {model_id, mesh: (input as {mesh: {file_token: string}}).mesh.file_token});
    return result();
  }
}\n`
  );
  await put(
    path.join(editor, "lib/ai/openai-compat/limits.ts"),
    `export async function allowAiRequest(_scope: string, _subject: string): Promise<{success: boolean; retryAfterSeconds?: number}> { return {success: true}; }\n`
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

async function creditsAssertions(port, issuer, safe, alpha, beta) {
  const endpoint = "/api/v1/account/credits";
  const auth = (token) => ({ authorization: `Bearer ${token}` });
  const alphaRows = issuer.credits[0];
  const betaRows = issuer.credits[1];
  const alphaRow = alphaRows[0];
  const betaRow = betaRows[0];
  const url = (id) => `${endpoint}?organization_id=${id}`;
  const expected = (row, state, balance, at, allowed, reason) => ({
    organization: {
      id: row.organization_id,
      name: row.organization_name,
      display_name: row.organization_display_name,
    },
    account_present: row.account_present,
    state,
    source: "cache",
    currency: "USD",
    balance_cents: balance,
    cache_updated_at: at,
    billing_gate: { allowed, reason },
  });
  const read = async (token, row, reply, label) => {
    const body = safe(
      await request(port, url(row.organization_id), {
        headers: {
          ...auth(token),
          cookie: "sb-session=conflicting-browser-organization",
          "x-grida-organization-id": "9999",
        },
      }),
      200,
      label
    );
    check(
      isDeepStrictEqual(body, reply),
      `${label}: cached credits projection or gate mismatch`
    );
  };

  await read(
    alpha,
    alphaRow,
    expected(alphaRow, "cached", 25, alphaRow.cached_balance_at, true, null),
    "own credits at the existing gate floor"
  );
  await read(
    beta,
    betaRow,
    expected(betaRow, "cached", 500, betaRow.cached_balance_at, true, null),
    "second user's independent credits"
  );
  await read(
    alpha,
    alphaRow,
    expected(alphaRow, "cached", 25, alphaRow.cached_balance_at, true, null),
    "credits do not leak through another user's cache"
  );
  issuer.creditsMode = "partial";
  await read(
    alpha,
    alphaRow,
    expected(alphaRow, "cached", 25, alphaRow.cached_balance_at, true, null),
    "complete credits row with HTTP206"
  );
  issuer.creditsMode = "ok";

  for (const [token, id] of [
    [alpha, betaRow.organization_id],
    [beta, alphaRow.organization_id],
    [alpha, 9999],
  ]) {
    const body = safe(
      await request(port, url(id), { headers: auth(token) }),
      403,
      "invisible or unknown credits organization"
    );
    check(
      body.error?.code === "forbidden",
      "Unknown and invisible organizations must share the forbidden result"
    );
  }
  issuer.credits[0] = [];
  safe(
    await request(port, url(alphaRow.organization_id), {
      headers: auth(alpha),
    }),
    403,
    "removed membership is not recovered from cookies or a cached organization"
  );
  issuer.credits[0] = alphaRows;

  // Expected gate decisions are explicit fixtures, independent of the server's
  // gate implementation. No provider, clock freshness rule, or billing write
  // supplies these results; the intentionally old timestamp remains valid.
  const cases = [
    {
      label: "missing account",
      raw: {
        account_present: false,
        credits_provisioned: false,
        cached_balance_cents: null,
        cached_balance_at: null,
        customer_entitled: null,
      },
      state: "not_provisioned",
      balance: null,
      at: null,
      allowed: false,
      reason: "not_provisioned",
    },
    {
      label: "account without linked credits customer",
      raw: {
        credits_provisioned: false,
        cached_balance_cents: 0,
        cached_balance_at: null,
        customer_entitled: false,
      },
      state: "not_provisioned",
      balance: null,
      at: null,
      allowed: false,
      reason: "not_provisioned",
    },
    {
      label: "unobserved cache is not a displayed zero",
      raw: {
        cached_balance_cents: 0,
        cached_balance_at: null,
        customer_entitled: false,
      },
      state: "uncached",
      balance: null,
      at: null,
      allowed: false,
      reason: "below_floor",
    },
    {
      label: "unobserved cache does not introduce a new freshness gate",
      raw: { cached_balance_cents: 25, cached_balance_at: null },
      state: "uncached",
      balance: null,
      at: null,
      allowed: true,
      reason: null,
    },
    {
      label: "observed zero balance",
      raw: { cached_balance_cents: 0 },
      state: "cached",
      balance: 0,
      at: alphaRow.cached_balance_at,
      allowed: false,
      reason: "below_floor",
    },
    {
      label: "negative cached balance remains a valid estimate",
      raw: { cached_balance_cents: -25 },
      state: "cached",
      balance: -25,
      at: alphaRow.cached_balance_at,
      allowed: false,
      reason: "below_floor",
    },
    {
      label: "positive balance below the existing floor",
      raw: { cached_balance_cents: 24 },
      state: "cached",
      balance: 24,
      at: alphaRow.cached_balance_at,
      allowed: false,
      reason: "below_floor",
    },
    {
      label: "eligible balance with a denied customer gate",
      raw: { cached_balance_cents: 25, customer_entitled: false },
      state: "cached",
      balance: 25,
      at: alphaRow.cached_balance_at,
      allowed: false,
      reason: "no_balance",
    },
  ];
  for (const fixture of cases) {
    const row = { ...alphaRow, ...fixture.raw };
    issuer.credits[0] = [row];
    await read(
      alpha,
      row,
      expected(
        row,
        fixture.state,
        fixture.balance,
        fixture.at,
        fixture.allowed,
        fixture.reason
      ),
      fixture.label
    );
  }
  issuer.credits[0] = alphaRows;

  let beforeAuth = issuer.calls;
  let beforeData = issuer.databaseCalls;
  for (const headers of [
    {},
    { cookie: "sb-session=synthetic-web-cookie" },
    auth("gg_synthetic_credential"),
    auth(issuer.token(0, { client_id: randomUUID() })),
  ]) {
    safe(
      await request(port, url(1), { headers }),
      401,
      "credits credential rejection"
    );
  }
  check(
    issuer.calls === beforeAuth && issuer.databaseCalls === beforeData,
    "Invalid credits credential reached issuer/database"
  );
  issuer.mode = "revoked";
  safe(
    await request(port, url(1), { headers: auth(alpha) }),
    401,
    "credits require a live account session"
  );
  check(
    issuer.databaseCalls === beforeData,
    "Revoked account reached cached credit data"
  );
  issuer.mode = "ok";

  beforeAuth = issuer.calls;
  for (const query of [
    "",
    "organization_id=",
    "organization_id=0",
    "organization_id=-1",
    "organization_id=01",
    "organization_id=1.0",
    "organization_id=1e2",
    "organization_id=9007199254740992",
    "organization_id=1&organization_id=2",
    "organization_id=1&refresh=1",
    "organization_id=1&user_id=other",
    "organization_id=1&organization=beta",
  ]) {
    safe(
      await request(port, endpoint + (query ? `?${query}` : ""), {
        headers: auth(alpha),
      }),
      400,
      "credits selector rejection"
    );
  }
  for (const method of ["GET", "OPTIONS"]) {
    safe(
      await request(port, url(1), {
        method,
        headers: { ...auth(alpha), "content-length": "1" },
        body: "x",
      }),
      400,
      "credits body rejection",
      method !== "OPTIONS"
    );
  }
  safe(
    await request(port, `${endpoint}?organization_id=01`, {
      method: "OPTIONS",
    }),
    400,
    "credits OPTIONS validates a supplied selector",
    false
  );
  check(
    issuer.calls === beforeAuth && issuer.databaseCalls === beforeData,
    "Rejected credits input reached issuer/database"
  );
  safe(
    await request(port, url(1), { method: "HEAD", headers: auth(alpha) }),
    200,
    "credits authenticated HEAD",
    false
  );
  safe(
    await request(port, url(1), { method: "HEAD" }),
    401,
    "credits unauthenticated HEAD",
    false
  );

  beforeAuth = issuer.calls;
  beforeData = issuer.databaseCalls;
  for (const target of [endpoint, url(1)]) {
    const response = await request(port, target, { method: "OPTIONS" });
    safe(response, 204, "credits OPTIONS", false);
    check(
      response.headers.allow === "GET, HEAD, OPTIONS",
      "Credits OPTIONS Allow mismatch"
    );
  }
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const response = await request(port, url(1), {
      method,
      headers: auth(alpha),
    });
    const body = safe(response, 405, "credits method rejection");
    check(
      body.error?.code === "method_not_allowed" &&
        response.headers.allow === "GET, HEAD, OPTIONS",
      "Credits method policy mismatch"
    );
  }
  check(
    issuer.calls === beforeAuth && issuer.databaseCalls === beforeData,
    "Credits method policy reached issuer/database"
  );

  for (const [mode, status] of [
    ["unauthorized", 401],
    ["forbidden", 403],
    ["unavailable", 503],
    ["redirect", 503],
    ["malformed", 503],
    ["content-type", 503],
    ["missing-count", 503],
    ["unknown-count", 503],
    ["truncated-count", 503],
    ["bad-range", 503],
    ["empty-nonzero-count", 503],
    ["duplicate", 503],
    ["wrong-org", 503],
  ]) {
    issuer.creditsMode = mode;
    const body = safe(
      await request(port, url(1), { headers: auth(alpha) }),
      status,
      `credits database ${mode}`
    );
    check(
      body.error &&
        !Object.hasOwn(body, "balance_cents") &&
        !Object.hasOwn(body, "account_present"),
      "Credits failure became an empty or zero balance snapshot"
    );
  }
  issuer.creditsMode = "ok";
  for (const raw of [
    { cached_balance_cents: 1.5 },
    { cached_balance_cents: Number.MAX_SAFE_INTEGER + 1 },
    { cached_balance_cents: null },
    { cached_balance_at: "not-a-time" },
    { organization_display_name: null },
    { organization_name: "Invalid Slug" },
    { account_present: false },
    { credits_provisioned: "true" },
    { customer_entitled: null },
  ]) {
    issuer.credits[0] = [{ ...alphaRow, ...raw }];
    const body = safe(
      await request(port, url(1), { headers: auth(alpha) }),
      503,
      "malformed credit row rejected"
    );
    check(
      body.error?.code === "auth_unavailable",
      "Malformed credits row leaked an unexpected error contract"
    );
  }
  issuer.credits[0] = alphaRows;
  await read(
    alpha,
    alphaRow,
    expected(alphaRow, "cached", 25, alphaRow.cached_balance_at, true, null),
    "credits recover after upstream errors without a fallback snapshot"
  );
}

/** Real bearer/upload authority and HTTP policy around one fixed synthetic execution seam. */
async function ggMediaAssertions(port, issuer, safe, tokens, mediaTripwire) {
  const base = "/api/v1/ai/3d/";
  const routes = ["uploads", "model-generation", "rig-check", "rigging"];
  const auth = (token) => ({ authorization: `Bearer ${token}` });
  const post = (route, token, value, options = {}) =>
    request(port, `${base}${route}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth(token) },
      body: JSON.stringify(value),
      ...options,
    });
  const calls = async () =>
    (await readFile(mediaTripwire, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  const initialAuth = issuer.calls;
  const initialData = issuer.databaseCalls;
  const tampered = tokens.alphaGrant.split(".");
  tampered[2] = `${tampered[2][0] === "a" ? "b" : "a"}${tampered[2].slice(1)}`;

  for (const route of routes) {
    for (const headers of [
      {},
      { cookie: "sb-session=synthetic-web-cookie" },
      auth(tokens.alpha),
      auth(tokens.beta),
      auth("synthetic-api-key"),
      auth(tampered.join(".")),
    ]) {
      const body = safe(
        await post(
          route,
          undefined,
          {},
          {
            headers: { "content-type": "application/json", ...headers },
          }
        ),
        401,
        `3D ${route} credential rejection`
      );
      check(
        body.error?.code === "invalid_token",
        `3D ${route} accepted wrong credential family`
      );
    }
    for (const method of ["GET", "HEAD", "PUT", "PATCH", "DELETE"]) {
      const response = await request(port, `${base}${route}`, { method });
      safe(response, 405, `3D ${route} ${method} rejection`, method !== "HEAD");
      check(
        response.headers.allow === "POST, OPTIONS",
        `3D ${route} Allow mismatch`
      );
    }
    const options = await request(port, `${base}${route}`, {
      method: "OPTIONS",
    });
    safe(options, 204, `3D ${route} OPTIONS`, false);
    check(
      options.headers.allow === "POST, OPTIONS",
      `3D ${route} OPTIONS Allow mismatch`
    );
    safe(
      await post(`${route}?organization_id=1`, tokens.alphaGrant, {}),
      400,
      `3D ${route} query rejected`
    );
  }
  check(
    (await calls()).length === 0,
    "Rejected 3D credentials/method/input reached execution"
  );

  const presign = async (type, bytes) => {
    const response = safe(
      await post("uploads", tokens.alphaGrant, {
        media_type: type,
        byte_length: bytes,
      }),
      200,
      `3D ${type} presign`
    );
    check(
      Object.keys(response).sort().join(",") === "upload,upload_url",
      "Presign leaked additional fields"
    );
    const url = new URL(response.upload_url);
    check(
      url.hostname === "tripo-data.s3.us-west-2.amazonaws.com" &&
        url.searchParams.get("X-Amz-Signature") === "synthetic",
      "Unexpected presign destination"
    );
    const upload = response.upload.split(".");
    const claims = JSON.parse(Buffer.from(upload[1], "base64url").toString());
    check(
      claims.aud === "gg:tripo-upload" &&
        claims.org === 1 &&
        claims.sub === issuer.users[0].id &&
        claims.exp - claims.iat === 900 &&
        claims.byte_length === bytes &&
        claims.media_type === type,
      "Upload ticket scope mismatch"
    );
    return { upload: response.upload };
  };
  const image = await presign("image/png", 100);
  const mesh = await presign("model/gltf-binary", 200);
  const textInput = {
    model_id: "tripo/h3.1",
    variant: "text",
    input: { prompt: "A fixture chair" },
  };
  const imageInput = {
    model_id: "tripo/h3.1",
    variant: "image",
    input: { image },
  };
  const multiInput = {
    model_id: "tripo/h3.1",
    variant: "multiview",
    input: { images: { front: image, right: image } },
  };
  const checkInput = { input: { mesh } };
  const rigInput = {
    model_id: "tripo/rig-v1.0",
    input: { mesh, rig_type: "biped", spec: "mixamo" },
  };
  for (const [route, input, feature] of [
    ["model-generation", textInput, "model-generation"],
    ["model-generation", imageInput, "model-generation"],
    ["model-generation", multiInput, "model-generation"],
    ["rigging", rigInput, "rigging"],
  ]) {
    const response = await post(route, tokens.alphaGrant, input, {
      headers: {
        "content-type": "application/json",
        ...auth(tokens.alphaGrant),
        cookie: "organization=1001",
        "x-grida-organization-id": "1001",
      },
    });
    const result = safe(
      response,
      200,
      `3D owner ${route} ${input.variant ?? "mesh"}`
    );
    check(
      result.feature === feature &&
        result.provider_id === "gg" &&
        result.model_id === input.model_id &&
        result.task.id === "fixture-task",
      "3D result descriptor or task lost"
    );
    const bytes = Buffer.from(result.glb.base64, "base64");
    check(
      result.glb.media_type === "model/gltf-binary" &&
        bytes.length === 200003 &&
        bytes.every((value, index) => value === index % 251),
      "Streamed GLB corrupted at base64 chunk boundaries"
    );
    check(
      response.headers["transfer-encoding"] === "chunked",
      "Model response was not streamed through Next"
    );
  }
  const checked = safe(
    await post("rig-check", tokens.alphaGrant, checkInput),
    200,
    "3D owner compatibility check"
  );
  check(
    checked.feature === "rig-check" &&
      checked.provider_id === "gg" &&
      checked.riggable === true &&
      checked.rig_type === "biped" &&
      checked.task.credits_consumed === 0 &&
      !Object.hasOwn(checked, "glb"),
    "Compatibility check became generation"
  );
  const executed = await calls();
  check(
    executed.length === 7 && executed.every((call) => call.org === 1),
    "Execution used cookie/header org or wrong operation count"
  );
  check(
    executed.some((call) => call.image === "file_fixture_image") &&
      executed.some(
        (call) =>
          call.images?.front === "file_fixture_image" &&
          call.images?.right === "file_fixture_image"
      ) &&
      executed.filter((call) => call.mesh === "file_fixture_mesh").length === 2,
    "Verified upload references did not reach the fixed execution seam"
  );

  for (const token of [tokens.betaGrant, tokens.alphaOtherOrgGrant]) {
    for (const [route, input] of [
      ["model-generation", imageInput],
      ["model-generation", multiInput],
      ["rig-check", checkInput],
      ["rigging", rigInput],
    ]) {
      safe(
        await post(route, token, input),
        400,
        `3D cross-owner ${route} upload rejected`
      );
    }
  }
  for (const route of routes) {
    safe(
      await post(route, image.upload, {}),
      401,
      `3D ${route} upload ticket cannot authorize AI`
    );
  }
  const corrupted = `${image.upload.slice(0, -8)}aaaaaaaa`;
  safe(
    await post("model-generation", tokens.alphaGrant, {
      ...imageInput,
      input: { image: { upload: corrupted } },
    }),
    400,
    "3D tampered upload rejected"
  );
  safe(
    await post("rig-check", tokens.alphaGrant, { input: { mesh: image } }),
    400,
    "Image ticket cannot be used as a mesh"
  );
  safe(
    await post("model-generation", tokens.alphaGrant, {
      ...imageInput,
      input: { image: mesh },
    }),
    400,
    "Mesh ticket cannot be used as an image"
  );
  safe(
    await post("model-generation", tokens.alphaGrant, {
      ...imageInput,
      input: {
        image: { file_token: "file_fixture_image", media_type: "image/png" },
      },
    }),
    400,
    "Unsigned provider reference rejected"
  );
  safe(
    await post("rig-check", tokens.alphaGrant, {
      input: { mesh: { data: "AAAA", media_type: "model/gltf-binary" } },
    }),
    400,
    "Raw mesh body rejected by reference-only gateway"
  );

  for (const [route, input] of [
    ["uploads", { media_type: "image/png", byte_length: 8 * 1024 * 1024 + 1 }],
    ["uploads", { media_type: "model/gltf-binary", byte_length: 60_000_001 }],
  ]) {
    safe(
      await post(route, tokens.alphaGrant, input),
      400,
      "Oversized 3D upload metadata rejected"
    );
  }
  for (const route of routes) {
    for (const headers of [
      { "content-type": "text/plain" },
      { "content-type": "application/json", "content-encoding": "gzip" },
    ])
      safe(
        await post(
          route,
          tokens.alphaGrant,
          {},
          { headers: { ...auth(tokens.alphaGrant), ...headers } }
        ),
        400,
        `3D ${route} unsupported encoding rejected`
      );
    for (const declared of [false, true]) {
      const body = JSON.stringify({
        ...textInput,
        input: { prompt: "x".repeat(65_536) },
      });
      safe(
        await post(
          route,
          tokens.alphaGrant,
          {},
          {
            body,
            headers: {
              ...auth(tokens.alphaGrant),
              "content-type": "application/json",
              ...(declared
                ? { "content-length": String(Buffer.byteLength(body)) }
                : { "transfer-encoding": "chunked" }),
            },
          }
        ),
        400,
        `3D ${route} ${declared ? "declared" : "streamed"} oversized body rejected`
      );
    }
  }
  check(
    (await calls()).length === executed.length,
    "Rejected upload ownership or request bounds reached execution"
  );
  check(
    issuer.calls === initialAuth && issuer.databaseCalls === initialData,
    "3D bearer/upload flow contacted account issuer or database"
  );
}

async function ggAssertions(
  port,
  issuer,
  safe,
  alpha,
  beta,
  signingSecret,
  mediaTripwire
) {
  const endpoint = "/api/v1/auth/gg";
  const models = "/api/v1/ai/models";
  const auth = (token) => ({ authorization: `Bearer ${token}` });
  const mint = (token, id, overrides = {}) =>
    request(port, endpoint, {
      method: "POST",
      headers: { ...auth(token), "content-type": "application/json" },
      body: JSON.stringify({ organization_id: id }),
      ...overrides,
    });
  const billingBefore = JSON.stringify(issuer.credits);
  const creditsCallsBefore = issuer.creditsCalls;
  const grant = async (token, user, organization, headers = {}) => {
    const before = Math.floor(Date.now() / 1000);
    const body = safe(
      await mint(token, organization.id, {
        headers: {
          ...auth(token),
          "content-type": "application/json",
          ...headers,
        },
      }),
      200,
      "GG grant"
    );
    check(
      Object.keys(body).sort().join(",") === "expires_at,organization,token" &&
        isDeepStrictEqual(body.organization, {
          id: organization.id,
          name: organization.name,
        }) &&
        typeof body.token === "string" &&
        typeof body.expires_at === "string",
      "GG grant projection or organization mismatch"
    );
    const parts = body.token.split(".");
    check(parts.length === 3, "GG grant is not a JWT");
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    const signature = createHmac("sha256", signingSecret)
      .update(`${parts[0]}.${parts[1]}`)
      .digest("base64url");
    check(
      header.alg === "HS256" &&
        header.typ === "JWT" &&
        parts[2] === signature &&
        Object.keys(claims).sort().join(",") === "aud,exp,iat,org,sub" &&
        claims.aud === "gg:ai" &&
        claims.sub === user.id &&
        claims.org === organization.id &&
        Number.isSafeInteger(claims.iat) &&
        claims.iat >= before &&
        claims.iat <= Math.floor(Date.now() / 1000) &&
        claims.exp - claims.iat === 900 &&
        new Date(claims.exp * 1000).toISOString() === body.expires_at,
      "GG grant signature, scope or lifetime mismatch"
    );
    return body.token;
  };
  // Real signing and real gateway verification, with a newly generated test key.
  const alphaOrg = issuer.organizations[0][0];
  const betaOrg = issuer.organizations[1][0];
  const alphaGrant = await grant(alpha, issuer.users[0], alphaOrg, {
    cookie: "sb-session=synthetic-other-user; organization=beta",
    "x-grida-organization-id": String(betaOrg.id),
  });
  const betaGrant = await grant(beta, issuer.users[1], betaOrg);
  const alphaOtherOrgGrant = await grant(
    alpha,
    issuer.users[0],
    issuer.organizations[0][1]
  );
  await ggMediaAssertions(
    port,
    issuer,
    safe,
    { alpha, beta, alphaGrant, betaGrant, alphaOtherOrgGrant },
    mediaTripwire
  );
  const tampered = alphaGrant.split(".");
  tampered[2] = `${tampered[2][0] === "a" ? "b" : "a"}${tampered[2].slice(1)}`;
  const beforeModelsAuth = issuer.calls;
  const beforeModelsData = issuer.databaseCalls;
  for (const token of [alphaGrant, betaGrant, alphaGrant]) {
    const body = safe(
      await request(port, models, {
        headers: { ...auth(token), cookie: "sb-session=synthetic-other-user" },
      }),
      200,
      "GG-scoped model list",
      true,
      false
    );
    check(
      body.object === "list" &&
        Array.isArray(body.data) &&
        body.data.length > 0 &&
        body.data.every(
          (row) =>
            row.object === "model" &&
            typeof row.id === "string" &&
            row.id.length > 0
        ),
      "GG model list has an invalid shape"
    );
  }
  for (const headers of [
    {},
    { cookie: "sb-session=synthetic-web-cookie" },
    auth(alpha),
    auth(beta),
    auth("synthetic-api-key"),
    auth(tampered.join(".")),
  ]) {
    const body = safe(
      await request(port, models, { headers }),
      401,
      "GG models credential-family rejection",
      true,
      false
    );
    check(body.error?.code === "invalid_token", "GG verifier error mismatch");
  }
  check(
    issuer.calls === beforeModelsAuth &&
      issuer.databaseCalls === beforeModelsData,
    "GG model list sent a credential to the account issuer/database"
  );

  let beforeAuth = issuer.calls;
  let beforeData = issuer.databaseCalls;
  for (const headers of [
    {},
    { cookie: "sb-session=synthetic-web-cookie" },
    auth(alphaGrant),
    auth("synthetic-api-key"),
    auth(issuer.token(0, { client_id: randomUUID() })),
    auth(issuer.token(0, { exp: Math.floor(Date.now() / 1000) - 1 })),
  ]) {
    safe(
      await mint(alpha, alphaOrg.id, {
        headers: { ...headers, "content-type": "application/json" },
      }),
      401,
      "Native GG mint credential-family rejection"
    );
  }
  for (const target of [
    "/api/v1/auth/me",
    "/api/v1/account/organizations",
    `/api/v1/account/credits?organization_id=${alphaOrg.id}`,
  ]) {
    safe(
      await request(port, target, { headers: auth(alphaGrant) }),
      401,
      "GG grant cannot become an account credential"
    );
  }
  check(
    issuer.calls === beforeAuth && issuer.databaseCalls === beforeData,
    "Wrong native credential family reached issuer/database"
  );

  for (const [token, id] of [
    [alpha, betaOrg.id],
    [beta, alphaOrg.id],
    [alpha, 999999],
  ]) {
    const body = safe(
      await mint(token, id),
      403,
      "GG inaccessible organization"
    );
    check(body.error?.code === "forbidden", "GG membership error mismatch");
  }
  const betaRows = issuer.organizations[1];
  issuer.organizations[1] = [alphaOrg, ...betaRows];
  const temporaryGrant = await grant(beta, issuer.users[1], alphaOrg);
  issuer.organizations[1] = betaRows;
  safe(await mint(beta, alphaOrg.id), 403, "GG removed membership cannot mint");
  safe(
    await request(port, models, { headers: auth(temporaryGrant) }),
    200,
    "Existing GG grant retains its expiry window after membership removal",
    true,
    false
  );
  beforeData = issuer.databaseCalls;
  issuer.mode = "revoked";
  safe(await mint(alpha, alphaOrg.id), 401, "GG revoked account cannot remint");
  check(issuer.databaseCalls === beforeData, "Revoked account reached GG data");
  safe(
    await request(port, models, { headers: auth(alphaGrant) }),
    200,
    "Existing GG grant retains its expiry window after account revocation",
    true,
    false
  );
  issuer.mode = "ok";

  beforeAuth = issuer.calls;
  beforeData = issuer.databaseCalls;
  const options = await request(port, endpoint, { method: "OPTIONS" });
  safe(options, 204, "GG OPTIONS", false);
  check(options.headers.allow === "POST, OPTIONS", "GG OPTIONS Allow mismatch");
  for (const method of ["GET", "HEAD", "PUT", "PATCH", "DELETE"]) {
    const response = await request(port, endpoint, {
      method,
      headers: auth(alpha),
    });
    const body = safe(response, 405, "GG method rejection", method !== "HEAD");
    check(
      response.headers.allow === "POST, OPTIONS" &&
        (method === "HEAD" || body.error?.code === "method_not_allowed"),
      "GG method policy mismatch"
    );
  }
  for (const body of [
    "",
    "{",
    "null",
    "[]",
    "{}",
    '{"organization_id":0}',
    '{"organization_id":-1}',
    '{"organization_id":1.0}',
    '{"organization_id":1e0}',
    '{"organization_id":9007199254740992}',
    '{"organization_id":"1"}',
    '{"organization_id":null}',
    '{"organization_id":true}',
    '{"organization_id":1,"user_id":"other"}',
    '{"organization_id":1,"organization_id":1001}',
    '{"organization_\\u0069d":1}',
    `${" ".repeat(1024)}{"organization_id":1}`,
  ]) {
    const response = safe(
      await mint(alpha, alphaOrg.id, { body }),
      400,
      "GG strict JSON body rejection"
    );
    check(
      response.error?.code === "invalid_request",
      "GG input error mismatch"
    );
  }
  for (const headers of [
    auth(alpha),
    { ...auth(alpha), "content-type": "text/plain" },
    { ...auth(alpha), "content-type": "application/json; charset=latin1" },
    {
      ...auth(alpha),
      "content-type": "application/json",
      "content-encoding": "gzip",
    },
  ]) {
    safe(
      await mint(alpha, alphaOrg.id, { headers }),
      400,
      "GG body media-type rejection"
    );
  }
  for (const query of [
    "organization_id=1",
    "organization_id=1&organization_id=1001",
    "user_id=other",
  ]) {
    safe(
      await request(port, `${endpoint}?${query}`, {
        method: "POST",
        headers: { ...auth(alpha), "content-type": "application/json" },
        body: '{"organization_id":1}',
      }),
      400,
      "GG query rejection"
    );
  }
  for (const overrides of [
    { method: "OPTIONS", body: "x", headers: { "content-length": "1" } },
    {
      body: `${" ".repeat(1024)}{"organization_id":1}`,
      headers: {
        ...auth(alpha),
        "content-type": "application/json",
        "transfer-encoding": "chunked",
      },
    },
  ]) {
    safe(
      await mint(alpha, alphaOrg.id, overrides),
      400,
      "GG body presence or chunked-size rejection",
      overrides.method !== "OPTIONS"
    );
  }
  safe(
    await request(port, `${endpoint}?organization_id=1`, { method: "OPTIONS" }),
    400,
    "GG OPTIONS rejects query selectors",
    false
  );
  check(
    issuer.calls === beforeAuth && issuer.databaseCalls === beforeData,
    "Rejected GG method/input reached issuer/database"
  );
  await grant(alpha, issuer.users[0], alphaOrg, {
    "content-type": "application/json; charset=utf-8",
    "content-encoding": "identity",
  });
  for (const body of [
    '{\n "organization_id" \t: 1\n}',
    `${" ".repeat(1024 - '{"organization_id":1}'.length)}{"organization_id":1}`,
  ]) {
    safe(
      await mint(alpha, alphaOrg.id, { body }),
      200,
      "GG accepts JSON whitespace up to its exact byte limit"
    );
  }
  // Next 16.2.6 clones POST bodies for proxy and awaits the original EOF in
  // getCloneableBody.finalize before invoking this route. Its upload wait is
  // outside the route's one-second timer and relies on the hosting ingress policy.
  beforeAuth = issuer.calls;
  beforeData = issuer.databaseCalls;
  const delayed = mint(alpha, alphaOrg.id, { bodyEndDelayMs: 1500 });
  void delayed.catch(() => undefined);
  await delay(1100);
  check(
    issuer.calls === beforeAuth && issuer.databaseCalls === beforeData,
    "Incomplete GG upload reached issuer/database"
  );
  safe(
    await delayed,
    200,
    "Next buffers the completed upload before the GG route read timer starts"
  );

  for (const [mode, status] of [
    ["unavailable", 503],
    ["mismatch", 401],
    ["redirect", 503],
  ]) {
    beforeData = issuer.databaseCalls;
    issuer.mode = mode;
    safe(await mint(alpha, alphaOrg.id), status, `GG issuer ${mode}`);
    check(
      issuer.databaseCalls === beforeData,
      "Rejected issuer reached GG data"
    );
  }
  issuer.mode = "ok";
  for (const [mode, status] of [
    ["unauthorized", 401],
    ["forbidden", 403],
    ["unavailable", 503],
    ["redirect", 503],
    ["malformed", 503],
    ["content-type", 503],
    ["missing-count", 503],
    ["unknown-count", 503],
    ["truncated-count", 503],
    ["bad-range", 503],
    ["duplicate", 503],
    ["wrong-org", 503],
    ["wrong-join", 503],
    ["invalid-slug", 503],
    ["empty-nonzero-count", 503],
  ]) {
    issuer.ggMode = mode;
    const body = safe(
      await mint(alpha, alphaOrg.id),
      status,
      `GG database ${mode}`
    );
    check(
      body.error && !Object.hasOwn(body, "token"),
      "GG failure exposed a grant"
    );
  }
  issuer.ggMode = "partial";
  await grant(alpha, issuer.users[0], alphaOrg);
  issuer.ggMode = "ok";
  await grant(alpha, issuer.users[0], alphaOrg);
  check(
    issuer.creditsCalls === creditsCallsBefore &&
      JSON.stringify(issuer.credits) === billingBefore,
    "GG access or model discovery read or changed billing state"
  );
}

async function assertions(
  port,
  issuer,
  tripwire,
  signingSecret,
  mediaTripwire
) {
  let count = 0;
  const alpha = issuer.token(0);
  const beta = issuer.token(1);
  const auth = (token) => ({ authorization: `Bearer ${token}` });
  const safe = (response, status, label, body = true, native = true) => {
    check(
      response.status === status,
      `${label}: expected HTTP ${status}, got ${response.status}`
    );
    check(
      response.headers["cache-control"]?.includes("no-store"),
      `${label}: missing no-store`
    );
    if (native) {
      check(
        response.headers["x-content-type-options"] === "nosniff",
        `${label}: missing nosniff`
      );
      check(
        response.headers["referrer-policy"] === "no-referrer",
        `${label}: missing referrer policy`
      );
    }
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
    // A reachable, configured Data API alias is still not the Auth issuer.
    auth(issuer.token(0, { iss: `${issuer.dataOrigin}/auth/v1` })),
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
  await creditsAssertions(port, issuer, safe, alpha, beta);
  await ggAssertions(
    port,
    issuer,
    safe,
    alpha,
    beta,
    signingSecret,
    mediaTripwire
  );
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
    const mediaTripwire = path.join(workspace, "media-tripwire.log");
    await put(mediaTripwire, "");
    const issuerPort = await listen(issuer.authServer);
    issuer.authOrigin = `http://127.0.0.1:${issuerPort}`;
    const dataPort = await listen(issuer.dataServer);
    issuer.dataOrigin = `http://127.0.0.1:${dataPort}`;
    check(
      issuerPort !== dataPort,
      "Auth and Data fixtures must be independent"
    );
    const port = await listen(reservation);
    await close(reservation);
    const apiOrigin = `http://127.0.0.1:${port}`;
    const signingSecret = randomBytes(32).toString("hex");
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
      NEXT_PUBLIC_SUPABASE_URL: issuer.dataOrigin,
      GRIDA_OAUTH_ISSUER: `${issuer.authOrigin}/auth/v1`,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable-key",
      NEXT_PUBLIC_DOCS_URL: apiOrigin,
      NEXT_PUBLIC_BLOG_URL: apiOrigin,
      GRIDA_OAUTH_CLIENT_IDS: issuer.client,
      GRIDA_API_ORIGIN: apiOrigin,
      GRIDA_API_MAINTENANCE: "0",
      GG_TOKEN_SECRET: signingSecret,
      GRIDA_API_TEST_PORTS: `${port},${issuerPort},${dataPort}`,
      GRIDA_API_TEST_TRIPWIRE: tripwire,
      GRIDA_API_TEST_MEDIA: mediaTripwire,
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
    for (const mode of [
      "normal",
      "maintenance",
      "invalid-config",
      "gg-unconfigured",
      "gg-short-secret",
    ]) {
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
          ...(mode === "gg-unconfigured" ? { GG_TOKEN_SECRET: "" } : {}),
          ...(mode === "gg-short-secret" ? { GG_TOKEN_SECRET: "short" } : {}),
        }
      );
      await ready(active, port);
      if (mode === "normal")
        report.cases += await assertions(
          port,
          issuer,
          tripwire,
          signingSecret,
          mediaTripwire
        );
      else if (mode.startsWith("gg-")) {
        for (const [endpoint, options] of [
          [
            "/api/v1/auth/gg",
            {
              method: "POST",
              headers: {
                authorization: `Bearer ${issuer.token(0)}`,
                "content-type": "application/json",
              },
              body: '{"organization_id":1}',
            },
          ],
          [
            "/api/v1/ai/models",
            { headers: { authorization: "Bearer synthetic-gg" } },
          ],
        ]) {
          const beforeCredits = issuer.creditsCalls;
          const response = await request(port, endpoint, options);
          check(
            response.status === 503 &&
              response.headers["content-type"]?.includes("application/json") &&
              JSON.parse(response.body).error?.code === "not_configured",
            `${mode} must fail closed with not_configured`
          );
          check(
            response.headers["cache-control"]?.includes("no-store") &&
              !response.headers["set-cookie"] &&
              !response.headers.location &&
              !Object.hasOwn(JSON.parse(response.body), "token") &&
              issuer.creditsCalls === beforeCredits &&
              (await readFile(tripwire, "utf8")) === "",
            `${mode} exposed a grant or invoked billing/web work`
          );
          report.cases++;
        }
      } else
        for (const [endpoint, options] of [
          ["/api/v1/auth/me", {}],
          ["/api/v1/account/organizations", {}],
          ["/api/v1/account/credits?organization_id=1", {}],
          [
            "/api/v1/auth/gg",
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: '{"organization_id":1}',
            },
          ],
          ["/api/v1/ai/models", {}],
        ]) {
          const before = issuer.calls;
          const beforeData = issuer.databaseCalls;
          const response = await request(port, endpoint, {
            ...options,
            headers: {
              ...options.headers,
              authorization: `Bearer ${issuer.token(0)}`,
            },
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
    check(
      issuer.wrongServiceCalls === 0,
      "Auth and Data API destinations crossed"
    );
    passed = true;
  } finally {
    clearInterval(progress);
    const cleanup = await Promise.allSettled([
      active
        ? active.stop().finally(() => logs.push(active.log()))
        : Promise.resolve(),
      close(issuer.authServer),
      close(issuer.dataServer),
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
