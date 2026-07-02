/* eslint-disable jest/no-standalone-expect */
/**
 * Contract pins — auto-create route `POST /workspaces/create` (GRIDA-SEC-004).
 *
 * The desktop home's "auto-create, ask nothing" flow posts here to mint a fresh
 * project (a folder under the host's managed root) seeded with a `.canvas`
 * board. What must hold: it creates + registers a project, the seed is
 * field-constrained (only `src` + a numeric layout box reach the manifest — no
 * raw-manifest injection), a hostile `name` can't escape the managed root, and
 * a host without a managed root refuses with a 400.
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

  // The manifest lives inside the `<name>.canvas` bundle dir, not at the root.
  const readManifest = async (root: string) =>
    JSON.parse(
      await fs.readFile(
        path.join(root, `${path.basename(root)}.canvas`, ".canvas.json"),
        "utf8"
      )
    );

  it("creates + registers a project seeded with a board manifest", async () => {
    const res = await post(app, { name: "Poster" });
    expect(res.status).toBe(200);
    const ws = await res.json();
    expect(ws.name).toBe("Poster");
    const manifest = await readManifest(ws.root);
    expect(manifest.editor).toBe("board");
    expect(manifest.documents).toEqual([]);
  });

  it("field-constrains the seed: only src + numeric layout survive", async () => {
    const res = await post(app, {
      name: "Ref",
      seed: {
        documents: [
          {
            src: "https://library.grida.co/ref.png",
            layout: { x: 1, y: 2, evil: "rm -rf" },
            skip: true,
            thumbnail: "../../etc/passwd",
          },
          { notsrc: "dropme" }, // no src → dropped
          "junk", // not an object → dropped
        ],
      },
    });
    expect(res.status).toBe(200);
    const ws = await res.json();
    const manifest = await readManifest(ws.root);
    expect(manifest.documents).toEqual([
      { src: "https://library.grida.co/ref.png", layout: { x: 1, y: 2 } },
    ]);
    // The smuggled top-level fields never reached the manifest.
    expect(manifest.documents[0].skip).toBeUndefined();
    expect(manifest.documents[0].thumbnail).toBeUndefined();
  });

  it("rejects a seed with more documents than the cap", async () => {
    const res = await post(app, {
      name: "Flood",
      seed: {
        documents: Array.from({ length: 501 }, (_, i) => ({
          src: `https://library.grida.co/${i}.png`,
        })),
      },
    });
    expect(res.status).toBe(400);
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
