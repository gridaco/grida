import fs from "node:fs/promises";
import { writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DesktopComposerPredictions } from "./desktop-composer-predictions";

let dir: string;
let file: string;
let owner: DesktopComposerPredictions;
const key = "composer-predictions-enabled";
beforeEach(async () => {
  dir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "grida-prediction-preference-"))
  );
  file = path.join(dir, "config.toml");
  owner = new DesktopComposerPredictions(file);
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

it("defaults off without creating a file, persists a choice and reloads hand edits across instances", async () => {
  expect(await owner.get()).toEqual({ enabled: false, revision: 0 });
  expect(owner.capture(0)).toBeUndefined();
  await expect(fs.stat(file)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await owner.set(true)).toEqual({ enabled: true, revision: 1 });
  const permission = owner.capture(1);
  expect(permission?.aborted).toBe(false);
  expect(await fs.readFile(file, "utf8")).toBe(
    `schema_version = 1\n\n[desktop]\n${key} = true\n`
  );
  expect((await new DesktopComposerPredictions(file).get()).enabled).toBe(true);
  await fs.writeFile(file, `schema_version = 1\n\n[desktop]\n${key} = false\n`);
  expect(await owner.get()).toEqual({ enabled: false, revision: 2 });
  expect(permission?.aborted).toBe(true);
  expect((await new DesktopComposerPredictions(file).get()).enabled).toBe(
    false
  );
  expect(await owner.set(true)).toEqual({ enabled: true, revision: 3 });
  expect(owner.capture(1)).toBeUndefined();
  expect(owner.capture(3)?.aborted).toBe(false);
  expect(permission?.aborted).toBe(true);
});

it.each([
  `[desktop] # panel\r\n"${key}" = true  # explicit\r\n`,
  `'desktop'."${key}" = true # user choice\n`,
  `desktop = { sibling = "true", '${key}' = true } # explicit\n`,
])("edits only the selected boolean token", async (body) => {
  const initial = "schema_version = 1\n" + body;
  await fs.writeFile(file, initial, { mode: 0o600 });
  await owner.set(false);
  expect(await fs.readFile(file, "utf8")).toBe(
    initial.replace(/= true(?=\s|$)/, "= false")
  );
});

it.each([
  "[desktop] # panel\nother = 'untouched'\n",
  "desktop = { other = 'untouched' } # styling\n",
  "desktop.other = 'untouched'\n",
  "[desktop.child]\ntext = 'untouched'\n",
])(
  "adds a preference to existing desktop tables and preserves sibling keys",
  async (body) => {
    await fs.writeFile(file, "schema_version = 1\n" + body);
    expect((await owner.set(true)).enabled).toBe(true);
    expect(await fs.readFile(file, "utf8")).toContain("'untouched'");
    expect((await owner.get()).enabled).toBe(true);
  }
);

it.each([
  ["schema_version = 2\n", "native_hooks_schema_invalid"],
  ["schema_version = 1\nunsupported = 42\n", "native_hooks_schema_invalid"],
  [
    "schema_version = 1\n[desktop]\ncomposer-predictions-enabled = 1\n",
    "composer_predictions_config_invalid",
  ],
  ["bad >>>", "native_hooks_toml_invalid"],
])("preserves unsupported content on read or set", async (initial, error) => {
  await fs.writeFile(file, initial);
  await expect(owner.get()).rejects.toThrow(error);
  await expect(owner.set(true)).rejects.toThrow(error);
  expect(owner.snapshot.enabled).toBe(false);
  expect(await fs.readFile(file, "utf8")).toBe(initial);
});

it("leaves concurrent manual changes and revoked writes intact", async () => {
  const initial = "schema_version = 1\n";
  await fs.writeFile(file, initial);
  const changed = initial + "# edited outside Desktop\n";
  let checks = 0;
  await expect(
    owner.set(true, () => {
      if (++checks === 1) writeFileSync(file, changed);
    })
  ).rejects.toThrow("global_config_changed");
  expect(await fs.readFile(file, "utf8")).toBe(changed);
  checks = 0;
  await expect(
    owner.set(true, () => {
      if (++checks === 2) throw Error("revoked");
    })
  ).rejects.toThrow("revoked");
  expect(await fs.readFile(file, "utf8")).toBe(changed);
});

it("observes external opt-outs while serializing reads and writes", async () => {
  const changed = vi.fn<(value: typeof owner.snapshot) => void>();
  const off = owner.onChange(changed);
  try {
    const turningOn = owner.set(true);
    const turningOff = owner.set(false);
    const turningBackOn = owner.set(true);
    expect((await turningOn).revision).toBe(1);
    expect((await turningOff).revision).toBe(2);
    expect((await turningBackOn).revision).toBe(3);
    await fs.writeFile(file, `schema_version = 1\n[desktop]\n${key} = false\n`);
    await vi.waitFor(
      () =>
        expect(changed).toHaveBeenCalledWith({ enabled: false, revision: 4 }),
      { timeout: 3000 }
    );
  } finally {
    off();
  }
});

it("refuses symlinked files and multiply linked files", async () => {
  const other = path.join(dir, "other");
  await fs.writeFile(other, "schema_version = 1\n", { mode: 0o600 });
  await fs.symlink(other, file);
  await expect(owner.set(true)).rejects.toMatchObject({ code: "ELOOP" });
  await fs.unlink(file);
  await fs.link(other, file);
  await expect(owner.set(true)).rejects.toThrow(
    "native_hook_configuration_invalid"
  );
  expect(await fs.readFile(other, "utf8")).toBe("schema_version = 1\n");
});

it("keeps the optional UTF-8 BOM accepted by the hook reader", async () => {
  await fs.writeFile(file, "\uFEFFschema_version = 1\n");
  await owner.set(true);
  expect(
    (await fs.readFile(file, "utf8")).startsWith("\uFEFFschema_version = 1")
  ).toBe(true);
});

it("fails closed on corrupt hand edits even when the next request is a write", async () => {
  const enabled = await owner.set(true);
  await fs.writeFile(file, "bad >>>");
  await expect(owner.set(false)).rejects.toThrow("native_hooks_toml_invalid");
  expect(owner.snapshot).toEqual({
    enabled: false,
    revision: enabled.revision + 1,
  });
});
