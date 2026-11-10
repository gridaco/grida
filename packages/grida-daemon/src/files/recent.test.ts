import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RecentStore } from "./recent";

describe("RecentStore", () => {
  let root: string;
  let file: string;
  const prior = [
    { path: "/original.svg", pinned: false, opened_at: 2 },
    { path: "/retired.svg", pinned: false, opened_at: 1 },
  ];

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "grida-recent-"));
    file = path.join(root, "recent.json");
    await fs.writeFile(file, JSON.stringify(prior), { mode: 0o600 });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("serializes initial reads and overlapping changes to the retained list", async () => {
    const store = new RecentStore(root);
    const original = store.list();
    const pin = store.pin("/original.svg", true);
    const open = store.touch("/new.svg");
    const forget = store.forget("/retired.svg");
    const updated = store.list();
    await expect(original).resolves.toEqual(prior);
    await Promise.all([pin, open, forget]);
    const committed = [
      { path: "/new.svg", pinned: false, opened_at: expect.any(Number) },
      { ...prior[0], pinned: true },
    ];
    await expect(updated).resolves.toEqual(committed);
    await expect(new RecentStore(root).list()).resolves.toEqual(committed);
  });

  it("preserves the last saved list after a failed write and allows retry", async () => {
    const store = new RecentStore(root);
    await expect(store.list()).resolves.toEqual(prior);
    const retained = path.join(root, "prior.json");
    await fs.rename(file, retained);
    await fs.mkdir(file);
    await expect(store.pin("/original.svg", true)).rejects.toMatchObject({
      syscall: "rename",
    });
    await expect(store.list()).resolves.toEqual(prior);
    await fs.rmdir(file);
    await fs.rename(retained, file);
    await store.pin("/original.svg", true);
    await expect(new RecentStore(root).list()).resolves.toEqual([
      { ...prior[0], pinned: true },
      prior[1],
    ]);
  });
});
