/* eslint-disable jest/no-standalone-expect */
/**
 * Contract pins — auto-create route `POST /workspaces/create` (GRIDA-SEC-004).
 *
 * The desktop home's "auto-create, ask nothing" flow posts here to mint a fresh
 * EMPTY project (a folder under the host's managed root). No document is
 * seeded — the agent creates that on its first turn, so the route has no seed
 * body to field-constrain. What must hold: it creates + registers an empty
 * project, a hostile `name` can't escape the managed root, and a host without a
 * managed root refuses with a 400.
 *
 * Routes are registered onto a bare Hono app and driven via `app.request()`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { WorkspaceRegistry } from "../../workspaces";
import { registerWorkspacesRoutes } from "./workspaces";

describe("POST /workspaces/create (auto-create)", () => {
  let baseDir: string;
  let userDataDir: string;
  let projectsRoot: string;
  let app: Hono;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-create-route-"));
    userDataDir = path.join(baseDir, "userdata");
    projectsRoot = path.join(baseDir, "Grida");
    await fs.mkdir(userDataDir);
    app = new Hono();
    registerWorkspacesRoutes(
      app,
      new WorkspaceRegistry(userDataDir, projectsRoot)
    );
  });
  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  const post = (appToUse: Hono, jsonBody: unknown) =>
    appToUse.request("/workspaces/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(jsonBody),
    });

  it("creates + registers an EMPTY project (no seeded document)", async () => {
    const res = await post(app, { name: "Poster" });
    expect(res.status).toBe(200);
    const ws = await res.json();
    expect(ws.name).toBe("Poster");
    // The project folder is empty — the host seeds nothing; the agent creates
    // whatever document the task needs on its first turn.
    expect(await fs.readdir(ws.root)).toEqual([]);
  });

  it("ignores an unexpected `seed` body — no document reaches disk", async () => {
    // A stale/hostile client might still post a `seed`. It must be inert: the
    // route no longer accepts it, so the project stays empty (no injection).
    const res = await post(app, {
      name: "Ref",
      seed: {
        documents: [
          { src: "https://library.grida.co/ref.png", evil: "rm -rf" },
        ],
      },
    });
    expect(res.status).toBe(200);
    const ws = await res.json();
    expect(await fs.readdir(ws.root)).toEqual([]);
  });

  it("slugifies a traversal name so it stays inside the managed root", async () => {
    const res = await post(app, { name: "../../pwned" });
    expect(res.status).toBe(200);
    const ws = await res.json();
    const rootReal = await fs.realpath(projectsRoot);
    expect(path.dirname(await fs.realpath(ws.root))).toBe(rootReal);
  });

  it("400s when the host wired no managed root", async () => {
    const noRootApp = new Hono();
    registerWorkspacesRoutes(noRootApp, new WorkspaceRegistry(userDataDir));
    const res = await post(noRootApp, { name: "x" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("projects-root-not-configured");
  });
});
