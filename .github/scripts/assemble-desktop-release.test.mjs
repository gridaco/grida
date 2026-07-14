import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assembleDesktopRelease,
  collectReleaseAssets,
  DesktopRelease,
  GitHubReleaseClient,
} from "./assemble-desktop-release.mjs";

const version = "0.0.8";

async function writeReleaseAssets(directory) {
  const expected = DesktopRelease.expectedAssetNames(version);
  for (const [index, name] of expected.entries()) {
    const nested = path.join(directory, String(index));
    await mkdir(nested);
    await writeFile(path.join(nested, name), name);
  }
  return collectReleaseAssets(directory, expected);
}

function createRelease({ assets = [], id = 42 } = {}) {
  return {
    id,
    assets,
    body: "release notes",
    draft: true,
    html_url: "https://example.test/draft",
    immutable: false,
    name: `v${version}`,
    prerelease: false,
    tag_name: `v${version}`,
    target_commitish: "expected-sha",
    upload_url: "https://uploads.example.test/{?name,label}",
  };
}

const assemblyOptions = {
  notes: "release notes",
  prerelease: false,
  target: "expected-sha",
  version,
};

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

test("assembles one complete draft after delayed list visibility", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "desktop-release-"));
  try {
    await writeReleaseAssets(directory);

    const uploads = [];
    let visibilityMisses = 1;
    const client = {
      release: undefined,
      async listReleases() {
        if (!this.release) return [];
        if (visibilityMisses > 0) {
          visibilityMisses -= 1;
          return [];
        }
        return [this.release];
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
        ...assemblyOptions,
        assetsDirectory: directory,
        draftVisibility: {
          retryDelaysMs: [0],
          wait: async () => {},
        },
      },
      client
    );
    assert.equal(release.id, 42);
    assert.equal(visibilityMisses, 0);
    assert.deepEqual(uploads, Array(11).fill(42));
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("reuses verified assets while uploading the rest of an existing draft", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "desktop-release-"));
  try {
    const localAssets = await writeReleaseAssets(directory);
    const [reusedAsset] = localAssets.values();
    const release = createRelease({
      assets: [
        {
          digest: reusedAsset.digest,
          id: 1,
          name: reusedAsset.name,
          size: reusedAsset.size,
          state: "uploaded",
        },
      ],
    });
    const uploads = [];
    const client = {
      async listReleases() {
        return [release];
      },
      async createDraft() {
        assert.fail("an existing draft must be reused");
      },
      async updateDraft(releaseId) {
        assert.equal(releaseId, release.id);
        return release;
      },
      async deleteAsset() {
        assert.fail("a verified asset must not be deleted");
      },
      async uploadAsset(existingRelease, asset) {
        uploads.push(asset.name);
        const uploaded = {
          digest: asset.digest,
          id: uploads.length + 1,
          name: asset.name,
          size: asset.size,
          state: "uploaded",
        };
        existingRelease.assets.push(uploaded);
        return uploaded;
      },
      async getRelease(releaseId) {
        assert.equal(releaseId, release.id);
        return release;
      },
    };

    const assembled = await assembleDesktopRelease(
      { ...assemblyOptions, assetsDirectory: directory },
      client
    );
    assert.equal(assembled.id, release.id);
    assert.equal(uploads.length, localAssets.size - 1);
    assert.equal(uploads.includes(reusedAsset.name), false);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("rejects a release identity change after draft creation", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "desktop-release-"));
  try {
    await writeReleaseAssets(directory);
    const created = createRelease({ id: 42 });
    const replacement = createRelease({ id: 43 });
    let listCount = 0;
    const client = {
      async listReleases() {
        listCount += 1;
        return listCount === 1 ? [] : [replacement];
      },
      async createDraft() {
        return created;
      },
    };

    await assert.rejects(
      assembleDesktopRelease(
        {
          ...assemblyOptions,
          assetsDirectory: directory,
          draftVisibility: {
            retryDelaysMs: [0],
            wait: async () => assert.fail("a conflicting ID must not retry"),
          },
        },
        client
      ),
      /Release identity changed while assembling v0\.0\.8: expected 42, found 43/
    );
    assert.equal(listCount, 2);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("rejects duplicate drafts immediately after creation", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "desktop-release-"));
  try {
    await writeReleaseAssets(directory);
    const created = createRelease({ id: 42 });
    const competitor = createRelease({ id: 43 });
    let listCount = 0;
    const client = {
      async listReleases() {
        listCount += 1;
        return listCount === 1 ? [] : [created, competitor];
      },
      async createDraft() {
        return created;
      },
    };

    await assert.rejects(
      assembleDesktopRelease(
        {
          ...assemblyOptions,
          assetsDirectory: directory,
          draftVisibility: {
            retryDelaysMs: [0],
            wait: async () => assert.fail("duplicate drafts must not retry"),
          },
        },
        client
      ),
      /Refusing ambiguous v0\.0\.8: found 2 releases \(42, 43\)/
    );
    assert.equal(listCount, 2);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("fails when a created draft never becomes list-visible", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "desktop-release-"));
  try {
    await writeReleaseAssets(directory);
    const created = createRelease({ id: 42 });
    let listCount = 0;
    const client = {
      async listReleases() {
        listCount += 1;
        return [];
      },
      async createDraft() {
        return created;
      },
    };

    await assert.rejects(
      assembleDesktopRelease(
        {
          ...assemblyOptions,
          assetsDirectory: directory,
          draftVisibility: {
            retryDelaysMs: [0, 0],
            wait: async () => {},
          },
        },
        client
      ),
      /Release 42 did not become visible while assembling v0\.0\.8 after 3 checks/
    );
    assert.equal(listCount, 4);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("times out stalled GitHub API requests with request context", async () => {
  const stalledFetch = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
    });
  const client = new GitHubReleaseClient({
    repository: "gridaco/grida",
    token: "test-token",
    fetchImpl: stalledFetch,
    requestTimeoutMs: 10,
  });
  await assert.rejects(
    client.request("/repos/gridaco/grida/releases"),
    /GitHub API GET https:\/\/api\.github\.com\/repos\/gridaco\/grida\/releases timed out after 10ms/
  );
});

test("preserves caller cancellation of GitHub API requests", async () => {
  const caller = new AbortController();
  const callerReason = new Error("caller cancelled");
  const client = new GitHubReleaseClient({
    repository: "gridaco/grida",
    token: "test-token",
    fetchImpl: (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      }),
  });

  const request = client.request("/repos/gridaco/grida/releases", {
    signal: caller.signal,
  });
  caller.abort(callerReason);
  await assert.rejects(request, (error) => error === callerReason);
});
