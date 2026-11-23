import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parse, stringify } from "smol-toml";
import type { NativeAgentConfig } from "./native-agent-config";
import { DesktopPersonalization } from "./desktop-personalization";

let dir: string;
let file: string;
let owner: DesktopPersonalization;
const set = vi.fn<NativeAgentConfig["set"]>();
const key = "composer-predictions-enabled";
beforeEach(async () => {
  dir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "grida-prediction-preference-"))
  );
  file = path.join(dir, "config.toml");
  set.mockReset().mockImplementation(async (change, check, signal) => {
    check();
    signal?.throwIfAborted();
    const table = parse(
      await fs.readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return "schema_version = 1";
        throw error;
      })
    );
    if ("suggestedPrompts" in change) {
      table.desktop = { [key]: change.suggestedPrompts };
    } else {
      table.web_search = change.webSearch;
    }
    await fs.writeFile(file, stringify(table));
  });
  owner = new DesktopPersonalization(file, { set });
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
  expect(set).toHaveBeenCalledExactlyOnceWith(
    { suggestedPrompts: true },
    expect.any(Function),
    undefined
  );
  expect((await new DesktopPersonalization(file).get()).enabled).toBe(true);
  await fs.writeFile(file, `schema_version = 1\n\n[desktop]\n${key} = false\n`);
  expect(await owner.get()).toEqual({ enabled: false, revision: 2 });
  expect(permission?.aborted).toBe(true);
  expect((await new DesktopPersonalization(file).get()).enabled).toBe(false);
  expect(await owner.set(true)).toEqual({ enabled: true, revision: 3 });
  expect(owner.capture(1)).toBeUndefined();
  expect(owner.capture(3)?.aborted).toBe(false);
  expect(permission?.aborted).toBe(true);
});

it("revokes the old preference if a committed write lost its acknowledgement", async () => {
  await owner.set(true);
  const permission = owner.capture(owner.snapshot.revision);
  set.mockImplementationOnce(async () => {
    await fs.writeFile(file, `schema_version = 1\n[desktop]\n${key} = false\n`);
    throw new Error("write acknowledgement lost");
  });
  await expect(owner.set(false)).rejects.toThrow("write acknowledgement lost");
  expect(owner.snapshot.enabled).toBe(false);
  expect(permission?.aborted).toBe(true);
});

it.each([
  ["schema_version = 2\n", "config_schema_unsupported"],
  [
    "schema_version = 1\n[desktop]\ncomposer-predictions-enabled = 1\n",
    "composer_predictions_config_invalid",
  ],
  ["bad >>>", "config_toml_invalid"],
])("preserves unsupported content on read or set", async (initial, error) => {
  await fs.writeFile(file, initial);
  await expect(owner.get()).rejects.toThrow(error);
  await expect(owner.set(true)).rejects.toThrow(error);
  expect(owner.snapshot.enabled).toBe(false);
  expect(await fs.readFile(file, "utf8")).toBe(initial);
});

it("does not invoke the writer when the stored personalization is invalid", async () => {
  await fs.writeFile(file, "schema_version = 1\nweb_search = true\n");
  await expect(owner.set(true)).rejects.toThrow(
    "personalization_config_invalid"
  );
  expect(set).not.toHaveBeenCalled();
});

it("reads its own settings in a file with unrelated settings and a typo", async () => {
  await fs.writeFile(
    file,
    "schema_version = 1\nmodel_auto_compact_token_limit = 1024\nunknown = 9223372036854775807\nhooks = 2\n[desktop]\ncomposer-predictions-enabled = true\n"
  );
  expect(await owner.getPersonalization()).toMatchObject({
    suggestedPrompts: true,
  });
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
  await expect(owner.set(true)).rejects.toThrow("config_file_unavailable");
  await fs.unlink(file);
  await fs.link(other, file);
  await expect(owner.set(true)).rejects.toThrow("config_file_unavailable");
  expect(await fs.readFile(other, "utf8")).toBe("schema_version = 1\n");
});

it("reads a file with an optional UTF-8 BOM", async () => {
  await fs.writeFile(file, "\uFEFFschema_version = 1\n");
  expect((await owner.get()).enabled).toBe(false);
});

it("fails closed on corrupt hand edits even when the next request is a write", async () => {
  const enabled = await owner.set(true);
  await fs.writeFile(file, "bad >>>");
  await expect(owner.set(false)).rejects.toThrow("config_toml_invalid");
  expect(owner.snapshot).toEqual({
    enabled: false,
    revision: enabled.revision + 1,
  });
});

it("shares one file and serialized writer between all Personalization choices", async () => {
  const first = await owner.getPersonalization();
  expect(first).toEqual({
    revision: 0,
    suggestedPrompts: false,
    webSearch: "live",
  });
  expect(first).toBe(owner.personalizationSnapshot);
  const prediction = owner.set(true);
  const search = owner.setPersonalization({ webSearch: "disabled" });
  const allowed = await prediction;
  expect(await search).toEqual({
    revision: 2,
    suggestedPrompts: true,
    webSearch: "disabled",
  });
  expect(await fs.readFile(file, "utf8")).toContain('web_search = "disabled"');
  expect(owner.capture(allowed.revision)?.aborted).toBe(false);
  const reopened = new DesktopPersonalization(file);
  expect(await reopened.getPersonalization()).toMatchObject({
    suggestedPrompts: true,
    webSearch: "disabled",
  });
  await owner.setPersonalization({ webSearch: "live" });
  expect(await fs.readFile(file, "utf8")).toContain('web_search = "automatic"');
  expect(await reopened.getPersonalization()).toMatchObject({
    webSearch: "live",
  });
});

it.each([
  ["on_demand", "disabled"],
  ["live", "live"],
  ["cached", "disabled"],
  ["indexed", "disabled"],
] as const)(
  "reads %s as %s without rewriting the source",
  async (policy, webSearch) => {
    const initial = `schema_version = 1\nweb_search = "${policy}"\n`;
    await fs.writeFile(file, initial);
    expect(await owner.getPersonalization()).toMatchObject({ webSearch });
    expect(await fs.readFile(file, "utf8")).toBe(initial);
  }
);

it.each(["web_search = true", 'web_search = "onDemand"'])(
  "fails closed on invalid personalization without replacing the hand edit",
  async (fragment) => {
    await owner.setPersonalization({ suggestedPrompts: true });
    const token = owner.capture(owner.snapshot.revision);
    const invalid = "schema_version = 1\n" + fragment + "\n";
    await fs.writeFile(file, invalid);
    await expect(owner.getPersonalization()).rejects.toThrow(
      "personalization_config_invalid"
    );
    expect(token?.aborted).toBe(true);
    expect(owner.personalizationSnapshot).toMatchObject({
      webSearch: "disabled",
      suggestedPrompts: false,
    });
    await expect(
      owner.setPersonalization({ webSearch: "live" })
    ).rejects.toThrow("personalization_config_invalid");
    expect(await fs.readFile(file, "utf8")).toBe(invalid);
  }
);

it("watches external search edits independently of the legacy predictions listener", async () => {
  await owner.set(true);
  const permission = owner.capture(owner.snapshot.revision);
  const changed =
    vi.fn<(state: typeof owner.personalizationSnapshot) => void>();
  const off = owner.onPersonalizationChange(changed);
  const old = owner.onChange(() => {});
  old();
  try {
    const previous = await owner.getPersonalization();
    await fs.writeFile(
      file,
      'schema_version = 1\nweb_search = "automatic"\nfeatures.fast_mode = false\ndesktop.composer-predictions-enabled = true\n'
    );
    expect(await owner.getPersonalization()).toBe(previous);
    expect(changed).not.toHaveBeenCalled();
    await fs.writeFile(
      file,
      'schema_version = 1\nweb_search = "disabled"\nfeatures.fast_mode = false\ndesktop.composer-predictions-enabled = true\n'
    );
    await vi.waitFor(
      () =>
        expect(changed).toHaveBeenCalledWith({
          webSearch: "disabled",
          suggestedPrompts: true,
          revision: 2,
        }),
      { timeout: 3000 }
    );
    expect(permission?.aborted).toBe(false);
  } finally {
    off();
  }
});

it("treats a legacy renderer's on-demand write as disabling search", async () => {
  await owner.setPersonalization({ webSearch: "live" });
  expect(
    await owner.setPersonalization({ webSearch: "onDemand" })
  ).toMatchObject({
    webSearch: "disabled",
  });
  expect(set).toHaveBeenLastCalledWith(
    { webSearch: "disabled" },
    expect.any(Function),
    undefined
  );
});
