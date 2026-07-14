import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assembleDesktopRelease,
  collectReleaseAssets,
  DesktopRelease,
} from "./assemble-desktop-release.mjs";

const version = "0.0.8";

test("defines the complete cross-platform desktop asset manifest", () => {
  assert.deepEqual(DesktopRelease.expectedAssetNames(version), [
    "Grida-0.0.8-1.arm64.rpm",
    "Grida-0.0.8-1.x86_64.rpm",
    "Grida-0.0.8-arm64.dmg",
    "Grida-0.0.8-x64.dmg",
    "Grida-darwin-arm64-0.0.8.zip",
    "Grida-darwin-x64-0.0.8.zip",
    "Grida.Setup.0.0.8.x64.exe",
    "RELEASES",
    "co.grida.desktop.x64-0.0.8-full.nupkg",
    "grida_0.0.8_amd64.deb",
    "grida_0.0.8_arm64.deb",
  ]);
});

test("uses the same release asset sanitization as Electron Forge", () => {
  assert.equal(
    DesktopRelease.sanitizeAssetName("Grida Setup 0.0.8 x64.exe"),
    "Grida.Setup.0.0.8.x64.exe"
  );
});

test("refuses duplicate and published releases for one tag", () => {
  assert.throws(
    () =>
      DesktopRelease.selectDraft(
        [
          { id: 1, tag_name: "v0.0.8", draft: true },
          { id: 2, tag_name: "v0.0.8", draft: true },
        ],
        "v0.0.8"
      ),
    /Refusing ambiguous v0\.0\.8/
  );
  assert.throws(
    () =>
      DesktopRelease.selectDraft(
        [{ id: 1, tag_name: "v0.0.8", draft: false }],
        "v0.0.8"
      ),
    /Refusing to modify published release v0\.0\.8/
  );
});

test("refuses immutable drafts and drafts from another commit", () => {
  assert.throws(
    () =>
      DesktopRelease.selectDraft(
        [
          {
            id: 1,
            tag_name: "v0.0.8",
            draft: true,
            immutable: true,
          },
        ],
        "v0.0.8",
        "expected-sha"
      ),
    /Refusing to modify immutable release v0\.0\.8/
  );
  assert.throws(
    () =>
      DesktopRelease.selectDraft(
        [
          {
            id: 1,
            tag_name: "v0.0.8",
            draft: true,
            target_commitish: "other-sha",
          },
        ],
        "v0.0.8",
        "expected-sha"
      ),
    /Refusing v0\.0\.8 from other-sha; expected expected-sha/
  );
});

test("collects nested build artifacts by their sanitized release names", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "desktop-release-"));
  try {
    const expected = DesktopRelease.expectedAssetNames(version);
    for (const [index, name] of expected.entries()) {
      const nested = path.join(directory, String(index));
      await mkdir(nested);
      const sourceName =
        name === "Grida.Setup.0.0.8.x64.exe"
          ? "Grida Setup 0.0.8 x64.exe"
          : name;
      await writeFile(path.join(nested, sourceName), name);
    }
    const assets = await collectReleaseAssets(directory, expected);
    assert.deepEqual([...assets.keys()].sort(), expected);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("refuses incomplete local artifacts", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "desktop-release-"));
  try {
    await writeFile(path.join(directory, "RELEASES"), "fixture");
    await assert.rejects(
      collectReleaseAssets(
        directory,
        DesktopRelease.expectedAssetNames(version)
      ),
      /Local desktop release manifest mismatch \(missing:/
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("assembles one complete draft through one numeric release ID", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "desktop-release-"));
  try {
    const expected = DesktopRelease.expectedAssetNames(version);
    for (const [index, name] of expected.entries()) {
      const nested = path.join(directory, String(index));
      await mkdir(nested);
      await writeFile(path.join(nested, name), name);
    }

    const uploads = [];
    const client = {
      release: undefined,
      async listReleases() {
        return this.release ? [this.release] : [];
      },
      async createDraft({ tag, target, notes, prerelease }) {
        this.release = {
          id: 42,
          assets: [],
          body: notes,
          draft: true,
          html_url: "https://example.test/draft",
          immutable: false,
          name: tag,
          prerelease,
          tag_name: tag,
          target_commitish: target,
          upload_url: "https://uploads.example.test/{?name,label}",
        };
        return this.release;
      },
      async updateDraft(releaseId, { tag, target, notes, prerelease }) {
        assert.equal(releaseId, 42);
        Object.assign(this.release, {
          body: notes,
          draft: true,
          name: tag,
          prerelease,
          tag_name: tag,
          target_commitish: target,
        });
        return this.release;
      },
      async deleteAsset() {
        assert.fail("a new release must not delete assets");
      },
      async uploadAsset(release, asset) {
        uploads.push(release.id);
        const uploaded = {
          digest: asset.digest,
          id: uploads.length,
          name: asset.name,
          size: asset.size,
          state: "uploaded",
        };
        release.assets.push(uploaded);
        return uploaded;
      },
      async getRelease(releaseId) {
        assert.equal(releaseId, 42);
        return this.release;
      },
    };

    const release = await assembleDesktopRelease(
      {
        assetsDirectory: directory,
        notes: "release notes",
        prerelease: false,
        target: "expected-sha",
        version,
      },
      client
    );
    assert.equal(release.id, 42);
    assert.deepEqual(uploads, Array(11).fill(42));
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
