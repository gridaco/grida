import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { workspaceFs } from "./fs";
import type { Workspace } from "../workspaces";

// `readFileBytes` is the byte read behind the workspace image viewer AND the
// agent's `view_image` tool. The viewer wants a tight 1 MiB default; the agent
// raises it via `max_bytes` so an ordinary multi-MiB screenshot is viewable
// rather than rejected as too-large. These lock that parameterization.
describe("workspaceFs.readFileBytes — max_bytes", () => {
  let root: string;
  let ws: Workspace;

  beforeEach(async () => {
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "wsfs-")));
    ws = { id: "w", root, name: "w", opened_at: 0, pinned: false };
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  async function writeFile(rel: string, bytes: number): Promise<void> {
    await fs.writeFile(path.join(root, rel), Buffer.alloc(bytes, 0x41));
  }

  it("rejects a file past the 1 MiB default", async () => {
    await writeFile("big.png", workspaceFs.MAX_FILE_BYTES + 1);
    await expect(workspaceFs.readFileBytes(ws, "big.png")).rejects.toThrow(
      /too-large|too large/i
    );
  });

  it("serves a 1–8 MiB file when the cap is raised (the view_image path)", async () => {
    const size = workspaceFs.MAX_FILE_BYTES + 1; // > viewer default, < 8 MiB
    await writeFile("shot.png", size);
    const out = await workspaceFs.readFileBytes(ws, "shot.png", {
      max_bytes: 8 * 1024 * 1024,
    });
    expect(out.size).toBe(size);
    expect(Buffer.from(out.base64, "base64").byteLength).toBe(size);
  });

  it("still rejects past the raised cap", async () => {
    const cap = 2 * 1024 * 1024;
    await writeFile("huge.png", cap + 1);
    await expect(
      workspaceFs.readFileBytes(ws, "huge.png", { max_bytes: cap })
    ).rejects.toThrow(/too-large|too large/i);
  });
});
