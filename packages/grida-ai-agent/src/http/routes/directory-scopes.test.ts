/** Route adapter pins for the GRIDA-SEC-004 directory-scope ingress. */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { DirectoryScopeRegistry } from "../../session/directory-scopes";
import { registerDirectoryScopesRoutes } from "./directory-scopes";

describe("POST /directory-scopes", () => {
  let root: string;
  let picked: string;
  let protectedRoot: string;
  let app: Hono;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "grida-dir-route-"));
    picked = path.join(root, "picked");
    protectedRoot = path.join(root, "secret");
    await fs.mkdir(picked);
    await fs.mkdir(protectedRoot);
    app = new Hono();
    registerDirectoryScopesRoutes(
      app,
      new DirectoryScopeRegistry({ protected_roots: [protectedRoot] })
    );
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  async function attach(pathname: unknown): Promise<Response> {
    return await app.request("/directory-scopes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: pathname }),
    });
  }

  it("returns only the opaque read descriptor", async () => {
    const res = await attach(picked);
    expect(res.status).toBe(200);
    const descriptor = (await res.json()) as Record<string, unknown>;
    expect(descriptor).toMatchObject({
      kind: "scope",
      name: "picked",
      access: "read",
    });
    expect(descriptor.path).toBe(`/__references__/${descriptor.id}`);
    expect(descriptor).not.toHaveProperty("root");
  });

  it("shape-gates the raw path", async () => {
    expect((await attach(42)).status).toBe(400);
  });

  it("maps an unreadable/missing path to a typed 400", async () => {
    const res = await attach(path.join(root, "missing"));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "directory-scope-invalid-path",
    });
  });

  it("maps a sensitive-root overlap to a typed 403", async () => {
    const res = await attach(protectedRoot);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      code: "directory-scope-protected-root",
    });
  });
});
