#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { appendFile, readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const githubApiVersion = "2022-11-28";
const githubRequestTimeoutMs = 30_000;
const githubUploadTimeoutMs = 300_000;
const githubReleaseVisibilityRetryDelaysMs = Object.freeze([
  500, 1_000, 2_000, 4_000, 8_000,
]);

export const DesktopRelease = Object.freeze({
  expectedAssetNames(version) {
    return [
      `Grida-${version}-1.arm64.rpm`,
      `Grida-${version}-1.x86_64.rpm`,
      `Grida-${version}-arm64.dmg`,
      `Grida-${version}-x64.dmg`,
      `Grida-darwin-arm64-${version}.zip`,
      `Grida-darwin-x64-${version}.zip`,
      `Grida.Setup.${version}.x64.exe`,
      "RELEASES",
      `co.grida.desktop.x64-${version}-full.nupkg`,
      `grida_${version}_amd64.deb`,
      `grida_${version}_arm64.deb`,
    ].sort();
  },

  sanitizeAssetName(name) {
    return path
      .basename(name)
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^\w_.@+-]+/g, ".")
      .replace(/\.+/g, ".")
      .replace(/^\./g, "")
      .replace(/\.$/g, "");
  },

  assertManifest(actualNames, expectedNames, label) {
    const actual = [...actualNames].sort();
    const expected = [...expectedNames].sort();
    const missing = expected.filter((name) => !actual.includes(name));
    const unexpected = actual.filter((name) => !expected.includes(name));
    const duplicates = actual.filter(
      (name, index) => actual.indexOf(name) !== index
    );
    if (
      missing.length === 0 &&
      unexpected.length === 0 &&
      duplicates.length === 0
    ) {
      return;
    }

    const details = [
      missing.length > 0 ? `missing: ${missing.join(", ")}` : null,
      unexpected.length > 0 ? `unexpected: ${unexpected.join(", ")}` : null,
      duplicates.length > 0
        ? `duplicates: ${[...new Set(duplicates)].join(", ")}`
        : null,
    ].filter(Boolean);
    throw new Error(`${label} manifest mismatch (${details.join("; ")})`);
  },

  assertManifestSubset(actualNames, expectedNames, label) {
    const expected = new Set(expectedNames);
    const unexpected = [...actualNames].filter((name) => !expected.has(name));
    if (unexpected.length === 0) return;
    throw new Error(
      `${label} contains unexpected assets: ${unexpected.sort().join(", ")}`
    );
  },

  selectDraft(releases, tag, target) {
    const matches = releases.filter((release) => release.tag_name === tag);
    if (matches.length > 1) {
      const ids = matches.map((release) => release.id).join(", ");
      throw new Error(
        `Refusing ambiguous ${tag}: found ${matches.length} releases (${ids})`
      );
    }
    if (matches[0] && !matches[0].draft) {
      throw new Error(`Refusing to modify published release ${tag}`);
    }
    if (matches[0]?.immutable) {
      throw new Error(`Refusing to modify immutable release ${tag}`);
    }
    if (matches[0] && target && matches[0].target_commitish !== target) {
      throw new Error(
        `Refusing ${tag} from ${matches[0].target_commitish}; expected ${target}`
      );
    }
    return matches[0];
  },
});

export class GitHubReleaseClient {
  constructor({
    repository,
    token,
    apiUrl = "https://api.github.com",
    fetchImpl = globalThis.fetch,
    requestTimeoutMs = githubRequestTimeoutMs,
  }) {
    if (!repository) throw new Error("GITHUB_REPOSITORY is required");
    if (!token) throw new Error("GITHUB_TOKEN is required");
    if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) {
      throw new Error("requestTimeoutMs must be a positive number");
    }
    if (typeof fetchImpl !== "function") {
      throw new Error("fetchImpl must be a function");
    }
    this.repository = repository;
    this.token = token;
    this.apiUrl = apiUrl.replace(/\/$/, "");
    this.fetchImpl = fetchImpl;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  async request(endpoint, options = {}) {
    const {
      signal: callerSignal,
      timeoutMs = this.requestTimeoutMs,
      ...fetchOptions
    } = options;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error("timeoutMs must be a positive number");
    }
    const url = endpoint.startsWith("http")
      ? endpoint
      : `${this.apiUrl}${endpoint}`;
    const method = fetchOptions.method ?? "GET";
    const controller = new AbortController();
    const timeoutError = new Error(
      `GitHub API ${method} ${url} timed out after ${timeoutMs}ms`
    );
    const timeout = setTimeout(() => controller.abort(timeoutError), timeoutMs);

    const forwardCallerAbort = () => controller.abort(callerSignal.reason);
    if (callerSignal?.aborted) {
      forwardCallerAbort();
    } else {
      callerSignal?.addEventListener("abort", forwardCallerAbort, {
        once: true,
      });
    }

    try {
      const response = await this.fetchImpl(url, {
        ...fetchOptions,
        signal: controller.signal,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${this.token}`,
          "User-Agent": "grida-desktop-release",
          "X-GitHub-Api-Version": githubApiVersion,
          ...fetchOptions.headers,
        },
      });
      if (!response.ok) {
        const body = (await response.text()).slice(0, 2_000);
        throw new Error(
          `GitHub API ${method} ${url} failed (${response.status}): ${body}`
        );
      }
      if (response.status === 204) return null;
      return await response.json();
    } catch (error) {
      if (controller.signal.reason === timeoutError) throw timeoutError;
      throw error;
    } finally {
      clearTimeout(timeout);
      callerSignal?.removeEventListener("abort", forwardCallerAbort);
    }
  }

  async listReleases() {
    const releases = [];
    for (let page = 1; ; page += 1) {
      const batch = await this.request(
        `/repos/${this.repository}/releases?per_page=100&page=${page}`
      );
      releases.push(...batch);
      if (batch.length < 100) return releases;
    }
  }

  createDraft({ tag, target, notes, prerelease }) {
    return this.request(`/repos/${this.repository}/releases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tag_name: tag,
        target_commitish: target,
        name: tag,
        body: notes,
        draft: true,
        prerelease,
      }),
    });
  }

  updateDraft(releaseId, { tag, target, notes, prerelease }) {
    return this.request(`/repos/${this.repository}/releases/${releaseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tag_name: tag,
        target_commitish: target,
        name: tag,
        body: notes,
        draft: true,
        prerelease,
      }),
    });
  }

  getRelease(releaseId) {
    return this.request(`/repos/${this.repository}/releases/${releaseId}`);
  }

  deleteAsset(assetId) {
    return this.request(
      `/repos/${this.repository}/releases/assets/${assetId}`,
      { method: "DELETE" }
    );
  }

  async uploadAsset(release, asset) {
    const uploadUrl = release.upload_url.replace(
      /\{\?name,label\}$/,
      `?name=${encodeURIComponent(asset.sourceName)}`
    );
    return this.request(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Length": String(asset.size),
        "Content-Type": "application/octet-stream",
      },
      body: createReadStream(asset.path),
      duplex: "half",
      timeoutMs: githubUploadTimeoutMs,
    });
  }
}

async function walkFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walkFiles(entryPath)));
    if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return `sha256:${hash.digest("hex")}`;
}

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function confirmDraftIdentity(
  client,
  { expectedId, retryDelaysMs, tag, target, waitForRetry = wait }
) {
  for (let attempt = 0; ; attempt += 1) {
    const selected = DesktopRelease.selectDraft(
      await client.listReleases(),
      tag,
      target
    );
    if (selected) {
      if (selected.id !== expectedId) {
        throw new Error(
          `Release identity changed while assembling ${tag}: expected ${expectedId}, found ${selected.id}`
        );
      }
      return selected;
    }

    const delayMs = retryDelaysMs[attempt];
    if (delayMs === undefined) {
      throw new Error(
        `Release ${expectedId} did not become visible while assembling ${tag} after ${attempt + 1} checks`
      );
    }
    if (!Number.isFinite(delayMs) || delayMs < 0) {
      throw new Error("Release visibility retry delays must be non-negative");
    }
    console.log(
      `Waiting ${delayMs}ms for GitHub to list ${tag} release ${expectedId}`
    );
    await waitForRetry(delayMs);
  }
}

export async function collectReleaseAssets(directory, expectedNames) {
  const assets = new Map();
  for (const filePath of await walkFiles(directory)) {
    const sourceName = path.basename(filePath);
    const name = DesktopRelease.sanitizeAssetName(sourceName);
    if (assets.has(name)) {
      throw new Error(`Duplicate release asset after sanitization: ${name}`);
    }
    const fileStat = await stat(filePath);
    if (fileStat.size === 0) {
      throw new Error(`Refusing empty release asset: ${filePath}`);
    }
    assets.set(name, {
      digest: await sha256(filePath),
      name,
      path: filePath,
      size: fileStat.size,
      sourceName,
    });
  }
  DesktopRelease.assertManifest(
    assets.keys(),
    expectedNames,
    "Local desktop release"
  );
  return assets;
}

export async function assembleDesktopRelease(options, client) {
  const {
    assetsDirectory,
    draftVisibility = {},
    notes,
    prerelease,
    target,
    version,
  } = options;
  const tag = `v${version}`;
  const expectedNames = DesktopRelease.expectedAssetNames(version);
  const localAssets = await collectReleaseAssets(
    assetsDirectory,
    expectedNames
  );

  let release = DesktopRelease.selectDraft(
    await client.listReleases(),
    tag,
    target
  );
  const created = !release;
  if (!release) {
    release = await client.createDraft({
      tag,
      target,
      notes,
      prerelease,
    });
  }

  if (created) {
    // GitHub's list endpoint can briefly lag behind createDraft(). Retry only
    // that absent state; conflicting, duplicate, published, immutable, and
    // wrong-target releases still fail immediately through selectDraft().
    await confirmDraftIdentity(client, {
      expectedId: release.id,
      retryDelaysMs:
        draftVisibility.retryDelaysMs ?? githubReleaseVisibilityRetryDelaysMs,
      tag,
      target,
      waitForRetry: draftVisibility.wait,
    });
  } else {
    const selected = DesktopRelease.selectDraft(
      await client.listReleases(),
      tag,
      target
    );
    if (!selected || selected.id !== release.id) {
      throw new Error(`Release identity changed while assembling ${tag}`);
    }
  }

  release = await client.updateDraft(release.id, {
    tag,
    target,
    notes,
    prerelease,
  });

  const existingAssets = new Map(
    release.assets.map((asset) => [asset.name, asset])
  );
  DesktopRelease.assertManifestSubset(
    existingAssets.keys(),
    expectedNames,
    `Existing ${tag}`
  );
  for (const asset of localAssets.values()) {
    const existing = existingAssets.get(asset.name);
    if (
      existing?.state === "uploaded" &&
      existing.size === asset.size &&
      existing.digest === asset.digest
    ) {
      console.log(`Reusing verified asset: ${asset.name}`);
      continue;
    }
    if (existing) await client.deleteAsset(existing.id);
    const uploaded = await client.uploadAsset(release, asset);
    if (
      uploaded.name !== asset.name ||
      uploaded.size !== asset.size ||
      uploaded.digest !== asset.digest
    ) {
      throw new Error(
        `Uploaded asset mismatch for ${asset.name}: got ${uploaded.name} (${uploaded.size} bytes, ${uploaded.digest})`
      );
    }
  }

  const finalRelease = await client.getRelease(release.id);
  DesktopRelease.assertManifest(
    finalRelease.assets.map((asset) => asset.name),
    expectedNames,
    `Remote ${tag}`
  );
  for (const asset of finalRelease.assets) {
    const local = localAssets.get(asset.name);
    if (
      !local ||
      asset.size !== local.size ||
      asset.digest !== local.digest ||
      asset.state !== "uploaded"
    ) {
      throw new Error(`Remote asset verification failed for ${asset.name}`);
    }
  }
  if (
    !finalRelease.draft ||
    finalRelease.name !== tag ||
    finalRelease.tag_name !== tag ||
    finalRelease.prerelease !== prerelease ||
    finalRelease.target_commitish !== target ||
    finalRelease.body !== notes
  ) {
    throw new Error(`Remote release metadata verification failed for ${tag}`);
  }

  const finalSelection = DesktopRelease.selectDraft(
    await client.listReleases(),
    tag,
    target
  );
  if (!finalSelection || finalSelection.id !== release.id) {
    throw new Error(`Release identity changed after assembling ${tag}`);
  }
  return finalRelease;
}

async function main() {
  const packageJson = JSON.parse(
    await readFile(path.join(repositoryRoot, "desktop/package.json"), "utf8")
  );
  const notesTemplate = await readFile(
    path.join(repositoryRoot, ".github/release-notes/desktop.md"),
    "utf8"
  );
  const version = packageJson.version;
  const assetsDirectory = path.resolve(
    repositoryRoot,
    process.env.DESKTOP_RELEASE_ASSETS_DIR ?? "release-assets"
  );
  const prerelease = process.env.DESKTOP_RELEASE_PRERELEASE === "true";
  if (!process.env.GITHUB_SHA) throw new Error("GITHUB_SHA is required");
  const client = new GitHubReleaseClient({
    repository: process.env.GITHUB_REPOSITORY,
    token: process.env.GITHUB_TOKEN,
    apiUrl: process.env.GITHUB_API_URL,
  });
  const release = await assembleDesktopRelease(
    {
      assetsDirectory,
      notes: notesTemplate.replaceAll("{{version}}", version),
      prerelease,
      target: process.env.GITHUB_SHA,
      version,
    },
    client
  );
  const result = `Draft release assembled: ${release.html_url} (${release.assets.length} assets)`;
  console.log(result);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `## Desktop release\n\n[${release.tag_name}](${release.html_url}) is ready with ${release.assets.length} verified assets.\n`
    );
  }
}

const isEntrypoint =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
