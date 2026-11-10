// GRIDA-SEC-004 — the strict sidecar keeps its process-level writer lock.
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { RetainedMediaOwner } from "./retained-media-owner";

it.skipIf(process.platform === "win32")(
  "keeps the writer lock after refusing a duplicate in-process acquire",
  async () => {
    const settings = await fs.mkdtemp(path.join(os.tmpdir(), "media-owner-"));
    try {
      await RetainedMediaOwner.acquire(settings);
      await expect(RetainedMediaOwner.acquire(settings)).rejects.toThrow(
        "retained_media_owner_unavailable"
      );
      const contender = spawnSync(
        process.execPath,
        [
          "-e",
          'const { DatabaseSync } = require("node:sqlite"); new DatabaseSync(process.argv[1]).exec("PRAGMA busy_timeout=0; BEGIN IMMEDIATE;");',
          path.join(settings, ".sidecar-owner.sqlite"),
        ],
        { encoding: "utf8", timeout: 5_000 }
      );
      expect(contender.error).toBeUndefined();
      expect(contender.status).toBe(1);
      expect(contender.stderr).toContain("database is locked");
    } finally {
      await fs.rm(settings, { recursive: true, force: true });
    }
  }
);
