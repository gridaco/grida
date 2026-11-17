// GRIDA-SEC-016 — explicit legacy cleanup stays within recognized browser stores.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { BrowserLegacyProfiles } from "./browser-legacy-profiles";

const roots: string[] = [];
async function fixture() {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "grida-browser-profile-test-")
  );
  roots.push(root);
  const partitions = path.join(root, "Partitions");
  await fs.mkdir(partitions);
  return { root, partitions, shared: path.join(partitions, "grida-browser") };
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
  );
});

it("removes only strictly recognized legacy workspace directories on explicit clear", async () => {
  const f = await fixture();
  const legacy = "grida-browser-workspace-eac20941e6a410aa";
  const survivors = [
    "grida-browser",
    "account",
    "provider-network",
    "grida-browser-page-eac20941e6a410aa",
    "grida-browser-workspace-UPPERCASE00000000",
    "grida-browser-workspace-eac20941e6a410aa-extra",
  ];
  for (const name of [legacy, ...survivors]) {
    await fs.mkdir(path.join(f.partitions, name));
    await fs.writeFile(path.join(f.partitions, name, "data"), "fixture");
  }
  await fs.writeFile(
    path.join(f.partitions, "grida-browser-workspace-1234567890abcdef"),
    "not a directory"
  );
  await BrowserLegacyProfiles.clear(f.shared);
  await expect(fs.lstat(path.join(f.partitions, legacy))).rejects.toMatchObject(
    { code: "ENOENT" }
  );
  expect((await fs.readdir(f.partitions)).sort()).toEqual(
    [...survivors, "grida-browser-workspace-1234567890abcdef"].sort()
  );
});

it.skipIf(process.platform === "win32")(
  "skips matching symlinks and never traverses nested links while removing a legacy directory",
  async () => {
    const f = await fixture();
    const outside = path.join(f.root, "outside");
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, "keep"), "safe");
    const link = path.join(
      f.partitions,
      "grida-browser-workspace-eac20941e6a410aa"
    );
    await fs.symlink(outside, link, "dir");
    const legacy = path.join(
      f.partitions,
      "grida-browser-workspace-1234567890abcdef"
    );
    await fs.mkdir(legacy);
    await fs.symlink(outside, path.join(legacy, "nested"), "dir");
    await BrowserLegacyProfiles.clear(f.shared);
    expect((await fs.lstat(link)).isSymbolicLink()).toBe(true);
    expect(await fs.readFile(path.join(outside, "keep"), "utf8")).toBe("safe");
    await expect(fs.lstat(legacy)).rejects.toMatchObject({ code: "ENOENT" });
  }
);

it.skipIf(process.platform === "win32")(
  "skips a symlinked Partitions parent",
  async () => {
    const f = await fixture();
    const target = path.join(f.root, "real-partitions");
    await fs.rename(f.partitions, target);
    const legacy = path.join(
      target,
      "grida-browser-workspace-eac20941e6a410aa"
    );
    await fs.mkdir(legacy);
    await fs.symlink(target, f.partitions, "dir");
    await BrowserLegacyProfiles.clear(f.shared);
    expect((await fs.lstat(legacy)).isDirectory()).toBe(true);
  }
);

it("does nothing for absent storage and refuses unrelated native storage roots", async () => {
  await BrowserLegacyProfiles.clear(null);
  const f = await fixture();
  await BrowserLegacyProfiles.clear(f.shared); // An unused shared child need not exist yet.
  await expect(
    BrowserLegacyProfiles.clear(path.join(f.partitions, "account"))
  ).rejects.toThrow("browser_legacy_profile_root_invalid");
  await expect(
    BrowserLegacyProfiles.clear("Partitions/grida-browser")
  ).rejects.toThrow("browser_legacy_profile_root_invalid");
});
