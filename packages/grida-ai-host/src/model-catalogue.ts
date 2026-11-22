// Node host owner of the public, credential-free V2 snapshot.
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { bundledModelCatalogue } from "@grida/ai/catalogue";
import {
  isModelCatalogueVersion,
  parseModelCatalogue,
  type ModelCatalogueSnapshot,
} from "@grida/ai/model-catalogue";

const RESOLVER =
  "https://data.jsdelivr.com/v1/packages/npm/@grida/ai-models/resolved?specifier=2";
const CDN = "https://cdn.jsdelivr.net/npm/@grida/ai-models@";
const HOUR = 60 * 60 * 1000;
const LIMITS = {
  models: 4 * 1024 * 1024,
  agents: 256 * 1024,
  manifest: 128 * 1024,
};
const MAX_CACHE_BYTES =
  2 * (LIMITS.models + LIMITS.agents + LIMITS.manifest) + 1024;

interface Release {
  version: string;
  manifest: string;
  models: string;
  agents: string;
}

function verified(release: Release): ModelCatalogueSnapshot {
  if (
    !isModelCatalogueVersion(release.version) ||
    typeof release.manifest !== "string" ||
    Buffer.byteLength(release.manifest) > LIMITS.manifest
  )
    throw new Error("Invalid Models release");
  const manifest = JSON.parse(release.manifest);
  if (
    manifest.version !== `v${release.version}` ||
    manifest.schema_version !== 2
  )
    throw new Error("Invalid Models manifest");
  for (const name of ["models", "agents"] as const) {
    const file = manifest.files?.[`${name}.json`];
    const content = release[name];
    if (
      typeof content !== "string" ||
      !file ||
      file.bytes !== Buffer.byteLength(content) ||
      file.bytes > LIMITS[name] ||
      file.sha256 !== createHash("sha256").update(content).digest("hex")
    )
      throw new Error("Invalid Models asset");
  }
  return parseModelCatalogue(
    release.version,
    JSON.parse(release.models),
    JSON.parse(release.agents)
  );
}

function newer(version: string, current: string): boolean {
  const [, day, iteration] = version.split(".").map(Number);
  const [, previousDay, previousIteration] = current.split(".").map(Number);
  return (
    day > previousDay || (day === previousDay && iteration > previousIteration)
  );
}

type CatalogueFetch = (url: string, init: RequestInit) => Promise<Response>;

export class ModelCatalogueStore {
  private current = bundledModelCatalogue();
  private readonly path: string;
  private readonly request: CatalogueFetch;
  private loaded?: Promise<void>;
  private reading?: Promise<void>;
  private cacheIdentity?: string;
  private pending?: Promise<boolean>;
  private timer?: ReturnType<typeof setInterval>;
  private readonly lifetime = new AbortController();

  constructor(
    private readonly options: {
      directory: string;
      fetch?: CatalogueFetch;
      offline?: boolean;
    }
  ) {
    this.path = join(options.directory, "catalogue-v2.json");
    this.request = options.fetch ?? globalThis.fetch;
  }

  view(): ModelCatalogueSnapshot {
    return this.current;
  }

  /** Read the app-owned cache from a process without network or write authority. */
  async read(): Promise<ModelCatalogueSnapshot> {
    await (this.reading ??= this.restore()
      .catch(() => {})
      .finally(() => {
        this.reading = undefined;
      }));
    return this.current;
  }

  /** Restore the disk snapshot before returning. The network check runs in the background. */
  async start(): Promise<void> {
    await this.load();
    if (this.options.offline || this.timer || this.lifetime.signal.aborted)
      return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), HOUR);
    this.timer.unref();
  }

  refresh(): Promise<boolean> {
    if (this.lifetime.signal.aborted) return Promise.resolve(false);
    if (this.options.offline) return this.load().then(() => false);
    return (this.pending ??= this.update()
      .catch(() => false)
      .finally(() => {
        this.pending = undefined;
      }));
  }

  dispose(): void {
    this.lifetime.abort();
    clearInterval(this.timer);
  }

  private load(): Promise<void> {
    return (this.loaded ??= this.restore().catch(() => {}));
  }

  private async restore(): Promise<void> {
    const file = await open(
      this.path,
      constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW
    );
    try {
      const stat = await file.stat({ bigint: true });
      const identity = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}`;
      if (
        !stat.isFile() ||
        stat.size > MAX_CACHE_BYTES ||
        identity === this.cacheIdentity
      )
        return;
      const raw = Buffer.alloc(Number(stat.size));
      let offset = 0;
      while (offset < raw.length) {
        const { bytesRead } = await file.read(
          raw,
          offset,
          raw.length - offset,
          offset
        );
        if (!bytesRead) return;
        offset += bytesRead;
      }
      const release: Release = JSON.parse(raw.toString("utf8"));
      if (
        isModelCatalogueVersion(release.version) &&
        newer(release.version, this.current.version)
      )
        this.current = verified(release);
      this.cacheIdentity = identity;
    } finally {
      await file.close();
    }
  }

  private async update(): Promise<boolean> {
    await this.load();
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      this.lifetime.signal,
      AbortSignal.timeout(15_000),
    ]);
    try {
      const { version } = JSON.parse(
        await this.download(RESOLVER, 4096, signal)
      );
      if (
        !isModelCatalogueVersion(version) ||
        !newer(version, this.current.version)
      )
        return false;
      const base = CDN + version + "/";
      const [manifest, models, agents] = await Promise.all([
        this.download(base + "manifest.json", LIMITS.manifest, signal),
        this.download(base + "models.json", LIMITS.models, signal),
        this.download(base + "agents.json", LIMITS.agents, signal),
      ]);
      const release = { version, manifest, models, agents };
      const next = verified(release);
      signal.throwIfAborted();
      await mkdir(this.options.directory, { recursive: true });
      const temporary = this.path + "." + randomUUID();
      try {
        await writeFile(temporary, JSON.stringify(release), {
          mode: 0o600,
          flag: "wx",
        });
        signal.throwIfAborted();
        await rename(temporary, this.path);
      } finally {
        await rm(temporary, { force: true });
      }
      this.current = next;
      return true;
    } finally {
      controller.abort();
    }
  }

  private async download(
    url: string,
    maximum: number,
    signal: AbortSignal
  ): Promise<string> {
    const response = await this.request(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "omit",
      redirect: "error",
      signal,
    });
    const reader = response.body?.getReader();
    try {
      if (
        !response.ok ||
        response.redirected ||
        !reader ||
        Number(response.headers.get("content-length")) > maximum
      )
        throw new Error("Models download unavailable");
      const chunks: Uint8Array[] = [];
      let length = 0;
      for (;;) {
        signal.throwIfAborted();
        const next = await reader.read();
        if (next.done) break;
        length += next.value.length;
        if (length > maximum) throw new Error("Models download exceeds limit");
        chunks.push(next.value);
      }
      return new TextDecoder("utf-8", { fatal: true }).decode(
        Buffer.concat(chunks, length)
      );
    } finally {
      void reader?.cancel().catch(() => {});
      reader?.releaseLock();
    }
  }
}
