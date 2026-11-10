// GRIDA-SEC-004 / GRIDA-SEC-014 — exact settings adoption under disposable custody.
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RetainedMediaLaunch } from "./retained-media-launch";

const roots: string[] = [];
const bytes = Buffer.from('[ { "id": "fixture" } ]\n');

async function fixture() {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "grida-retained-settings-"))
  );
  roots.push(root);
  const agent = path.join(root, "agent");
  await fs.mkdir(agent, { mode: 0o700 });
  return {
    root,
    agent,
    source: path.join(agent, "endpoints.json"),
    settings: path.join(agent, "retained-settings"),
  };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
  );
});

describe.skipIf(process.platform !== "darwin" || process.arch !== "arm64")(
  "retained media settings partition",
  () => {
    it("copies exact settings once while retaining other owners and later deletions", async () => {
      const { agent, source, settings } = await fixture();
      await fs.writeFile(source, bytes, { mode: 0o600 });
      const oauth = path.join(agent, "auth.json");
      await fs.writeFile(oauth, "synthetic OAuth owner", { mode: 0o600 });
      await fs.mkdir(path.join(agent, "providers"), { mode: 0o700 });
      expect(
        await Promise.all([
          RetainedMediaLaunch.prepareSettings(agent),
          RetainedMediaLaunch.prepareSettings(agent),
        ])
      ).toEqual([settings, settings]);
      const copied = path.join(settings, "endpoints.json");
      expect(await fs.readFile(copied)).toEqual(bytes);
      expect((await fs.readdir(settings)).sort()).toEqual([
        ".source",
        "endpoints.json",
      ]);
      expect(await fs.readFile(source)).toEqual(bytes);
      expect(await fs.readFile(oauth, "utf8")).toBe("synthetic OAuth owner");
      await fs.unlink(copied);
      expect(await RetainedMediaLaunch.prepareSettings(agent)).toBe(settings);
      await expect(fs.stat(copied)).rejects.toMatchObject({ code: "ENOENT" });
      expect(await fs.readFile(source)).toEqual(bytes);
    });

    it("refuses aliases and oversized legacy files without publishing settings", async () => {
      const { root, agent, source, settings } = await fixture();
      const outside = path.join(root, "outside");
      await fs.writeFile(outside, bytes, { mode: 0o600 });
      await fs.symlink(outside, source);
      await expect(
        RetainedMediaLaunch.prepareSettings(agent)
      ).rejects.toMatchObject({ code: "ELOOP" });
      await fs.unlink(source);
      await fs.link(outside, source);
      await expect(RetainedMediaLaunch.prepareSettings(agent)).rejects.toThrow(
        "retained_media_settings_file_invalid"
      );
      await fs.unlink(source);
      await fs.writeFile(source, bytes, { mode: 0o600 });
      await fs.truncate(source, 16 * 1024 * 1024 + 1);
      await expect(RetainedMediaLaunch.prepareSettings(agent)).rejects.toThrow(
        "retained_media_settings_file_invalid"
      );
      await expect(fs.stat(settings)).rejects.toMatchObject({ code: "ENOENT" });
      expect(await fs.readFile(outside)).toEqual(bytes);
    });

    it("refuses a source directory with extra macOS ACL access", async () => {
      const { agent, settings } = await fixture();
      execFileSync("/bin/chmod", ["+a", "everyone allow list", agent]);
      await expect(RetainedMediaLaunch.prepareSettings(agent)).rejects.toThrow(
        "retained_media_directory_invalid"
      );
      await expect(fs.stat(settings)).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("ignores incomplete staging and refuses to adopt an unverified target or replaced source", async () => {
      const { agent, source, settings } = await fixture();
      const interrupted = await fs.mkdtemp(
        path.join(agent, ".retained-settings-")
      );
      await fs.writeFile(
        path.join(interrupted, "endpoints.json"),
        "incomplete"
      );
      await fs.mkdir(settings, { mode: 0o700 });
      await fs.writeFile(source, bytes, { mode: 0o600 });
      await expect(RetainedMediaLaunch.prepareSettings(agent)).rejects.toThrow(
        "retained_media_settings_unverified"
      );
      await fs.rmdir(settings);
      expect(await RetainedMediaLaunch.prepareSettings(agent)).toBe(settings);
      expect(await fs.readFile(path.join(settings, "endpoints.json"))).toEqual(
        bytes
      );
      expect(
        await fs.readFile(path.join(interrupted, "endpoints.json"), "utf8")
      ).toBe("incomplete");
      await fs.rename(agent, agent + "-old");
      await fs.mkdir(agent, { mode: 0o700 });
      await fs.rename(path.join(agent + "-old", "retained-settings"), settings);
      await expect(RetainedMediaLaunch.prepareSettings(agent)).rejects.toThrow(
        "retained_media_settings_unverified"
      );
    });
  }
);
