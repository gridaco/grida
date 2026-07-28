import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDaemonFixture,
  type DaemonFixture,
} from "../../test/daemon-fixture";
import { workspaceFs } from "../../workspaces/fs";
import {
  MAX_BUFFERED_WORKSPACE_RESOURCE_BYTES,
  registerWorkspacesRoutes,
} from "./workspaces";

describe("POST /workspaces/readfilebytes", () => {
  let fixture: DaemonFixture;
  let app: Hono;

  beforeEach(async () => {
    fixture = await createDaemonFixture("grida-daemon-readfilebytes-");
    app = new Hono();
    registerWorkspacesRoutes(app, fixture.registry);
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  async function writeBytes(relPath: string, size: number): Promise<void> {
    await fs.writeFile(
      path.join(fixture.workspace_root, relPath),
      Buffer.alloc(size, 0xa5)
    );
  }

  async function read(route: "readfile" | "readfilebytes", relPath: string) {
    return await app.request(`/workspaces/${route}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspace_id: fixture.workspace.id,
        rel_path: relPath,
      }),
    });
  }

  it("buffers an ordinary resource above the source-text limit", async () => {
    const size = workspaceFs.MAX_FILE_BYTES + 4096;
    await writeBytes("cover.png", size);

    const bytesResponse = await read("readfilebytes", "cover.png");
    expect(bytesResponse.status).toBe(200);
    const result = (await bytesResponse.json()) as {
      base64: string;
      size: number;
    };
    expect(result.size).toBe(size);
    expect(Buffer.from(result.base64, "base64").byteLength).toBe(size);

    const textResponse = await read("readfile", "cover.png");
    expect(textResponse.status).toBe(400);
    expect(await textResponse.json()).toMatchObject({
      code: "file-too-large",
      size,
    });
  });

  it("retains an 8 MiB ceiling on whole-file buffering", async () => {
    expect(MAX_BUFFERED_WORKSPACE_RESOURCE_BYTES).toBe(8 * 1024 * 1024);
    const size = MAX_BUFFERED_WORKSPACE_RESOURCE_BYTES + 1;
    await writeBytes("oversized.png", size);

    const response = await read("readfilebytes", "oversized.png");

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "file-too-large",
      size,
    });
  });
});
