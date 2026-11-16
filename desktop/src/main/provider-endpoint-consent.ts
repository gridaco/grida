// GRIDA-SEC-004 — Main-owned saved endpoint consent, separate from sidecar config.
import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { atomicWrite } from "@grida/daemon/server";
import {
  isValidEndpointProviderId,
  mergeProbedModels,
  validateEndpointProviderConfig,
  type EndpointProviderConfig,
  type ProbedEndpointModel,
} from "@grida/ai-host";
import { AgentProviderEndpointMutation } from "./agent-provider-endpoint-mutation";
import { ProviderNetworkPolicy } from "../provider-network-policy";
import { requirePrivateDirectory } from "./native-agent-hooks";

type Options = {
  directory: string;
  configuration: {
    list(): Promise<EndpointProviderConfig[]>;
    set(config: EndpointProviderConfig): Promise<void>;
    delete(id: string): Promise<void>;
    probe(baseUrl: string): Promise<{
      source: "ollama" | "openai";
      models: ProbedEndpointModel[];
    }>;
  };
  describe(baseUrl: string): Promise<unknown>;
  approve(id: string, baseUrl: string): Promise<void>;
  revoke(id: string): Promise<void>;
  approved(id: string, baseUrl: string): boolean;
  generation(): number;
};

/** The config store is readable/writable by the service; this receipt is not.
 * Only an explicit Settings save writes consent. Reads and discovery consume it. */
export class ProviderEndpointConsent {
  private readonly mutations = new AgentProviderEndpointMutation.Coordinator();
  private readonly receipts = new Map<string, string>();
  private writes: Promise<void> = Promise.resolve();
  private writable = true;

  private constructor(private readonly options: Options) {}

  static directory(userData: string): string {
    return path.join(userData, "provider-authority");
  }

  static async open(options: Options): Promise<ProviderEndpointConsent> {
    const owner = new ProviderEndpointConsent(options);
    await fs
      .mkdir(options.directory, { mode: 0o700 })
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error;
      });
    await privateDirectory(options.directory);
    await owner.read();
    return owner;
  }

  /** Reconcile on every service spawn, before the connection becomes public.
   * Re-read each current config inside its mutation queue, never a stale row. */
  async restore(): Promise<void> {
    // Pending work from the previous generation may change receipt entries
    // while this queue waits; a live Map iterator could revisit reinserted IDs.
    const ids = Array.from(this.receipts.keys());
    for (const id of ids) {
      await this.mutations.run(id, async () => {
        const check = this.check();
        const config = (await this.options.configuration.list()).find(
          (row) => row.id === id
        );
        check();
        if (!config || !this.matches(id, config.base_url)) return;
        try {
          await this.options.describe(config.base_url);
          check();
        } catch {
          return;
        }
        await this.options.approve(id, config.base_url);
        check();
      });
    }
  }

  async set(
    input: unknown,
    requireCurrent: () => void = () => {}
  ): Promise<void> {
    const config = this.validate(input);
    await this.mutations.run(config.id, async () => {
      const check = this.check(requireCurrent);
      await this.options.describe(config.base_url);
      check();
      // Replacements lose their former live and durable authority before any
      // sidecar write. A failed storage write leaves an inert config to retry.
      if (!this.matches(config.id, config.base_url)) {
        await this.revoke(config.id);
        check();
      }
      await this.options.configuration.set(config);
      check();
      try {
        await this.write(config.id, canonical(config.base_url));
        check();
        await this.options.approve(config.id, config.base_url);
        check();
      } catch (error) {
        // A navigated or failed Save must not leave a receipt that can acquire
        // authority later on a fresh process. Revocation still retires any
        // service that fails to acknowledge the rollback.
        await this.revoke(config.id).catch(() => {});
        throw error;
      }
    });
  }

  async remove(
    id: string,
    requireCurrent: () => void = () => {}
  ): Promise<void> {
    validId(id);
    await this.mutations.run(id, async () => {
      const check = this.check(requireCurrent);
      await this.revoke(id);
      check();
      await this.options.configuration.delete(id);
    });
  }

  async authorization(id: string, baseUrl: string): Promise<boolean> {
    validId(id);
    canonical(baseUrl);
    return await this.mutations.run(id, async () => {
      try {
        await this.current(id, baseUrl);
        return true;
      } catch {
        return false;
      }
    });
  }

  async updateModels(
    input: {
      id: string;
      base_url: string;
      models: ProbedEndpointModel[];
    },
    requireCurrent: () => void = () => {}
  ): Promise<void> {
    // Capture structured-clone input now and retain only detection-owned fields.
    const detected = this.validate({
      id: input?.id,
      base_url: input?.base_url,
      models: input?.models,
    });
    const models = detected.models.map(({ id, tool_call, contextWindow }) => ({
      id,
      tool_call,
      contextWindow,
    }));
    await this.mutations.run(detected.id, async () => {
      const check = this.check(requireCurrent);
      const current = await this.current(detected.id, detected.base_url);
      check();
      const next = this.validate({
        ...current,
        models: mergeProbedModels(current.models, models).models,
      });
      await this.options.configuration.set(next);
      check();
    });
  }

  async probe(baseUrl: string, requireCurrent: () => void = () => {}) {
    const target = canonical(baseUrl);
    const check = this.check(requireCurrent);
    const saved = (await this.options.configuration.list()).find(
      (row) =>
        canonical(row.base_url) === target && this.matches(row.id, target)
    );
    check();
    if (!saved) throw unavailable();
    return await this.mutations.run(saved.id, async () => {
      await this.current(saved.id, target);
      check();
      // No temporary grant: a probe is an ordinary consumer of saved consent.
      const result = await this.options.configuration.probe(target);
      check();
      return result;
    });
  }

  private check(requireCurrent: () => void = () => {}): () => void {
    const generation = this.options.generation();
    const check = () => {
      requireCurrent();
      if (generation !== this.options.generation()) throw unavailable();
    };
    check();
    return check;
  }

  private matches(id: string, baseUrl: string): boolean {
    return this.receipts.get(id) === canonical(baseUrl);
  }

  private async current(
    id: string,
    baseUrl: string
  ): Promise<EndpointProviderConfig> {
    const check = this.check();
    if (!this.matches(id, baseUrl)) throw unavailable();
    const input = (await this.options.configuration.list()).find(
      (row) => row.id === id
    );
    check();
    if (!input || canonical(input.base_url) !== canonical(baseUrl))
      throw unavailable();
    const config = this.validate(input);
    await this.options.describe(config.base_url);
    check();
    if (!this.options.approved(id, config.base_url)) throw unavailable();
    return config;
  }

  private validate(input: unknown): EndpointProviderConfig {
    const result = validateEndpointProviderConfig(input);
    if (!result.ok) throw new Error(result.error);
    return result.config;
  }

  private async revoke(id: string): Promise<void> {
    // Invalidate Main first, and await sidecar ACK even if durable storage fails.
    const publication = this.options.revoke(id);
    const persisted = this.write(id, null);
    const [live, durable] = await Promise.allSettled([publication, persisted]);
    if (live.status === "rejected") throw live.reason;
    if (durable.status === "rejected") throw durable.reason;
  }

  private async write(id: string, baseUrl: string | null): Promise<void> {
    const operation = this.writes.then(async () => {
      if (!this.writable)
        throw new Error("provider_endpoint_consent_newer_schema");
      await privateDirectory(this.options.directory);
      const next = new Map(this.receipts);
      if (baseUrl === null) next.delete(id);
      else next.set(id, baseUrl);
      await atomicWrite(
        path.join(this.options.directory, "consent.json"),
        JSON.stringify({
          version: 1,
          endpoints: [...next].map(([id, base_url]) => ({ id, base_url })),
        }) + "\n"
      );
      this.receipts.clear();
      for (const [key, value] of next) this.receipts.set(key, value);
    });
    this.writes = operation.catch(() => {});
    return await operation;
  }

  private async read(): Promise<void> {
    const file = path.join(this.options.directory, "consent.json");
    try {
      const handle = await fs.open(
        file,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
      );
      try {
        const metadata = await handle.stat();
        if (
          !metadata.isFile() ||
          metadata.nlink !== 1 ||
          metadata.size > 64 * 1024 ||
          (process.platform !== "win32" &&
            (metadata.uid !== process.geteuid?.() ||
              (metadata.mode & 0o7777) !== 0o600))
        )
          throw unavailable();
        if (process.platform === "darwin") {
          const { stdout } = await promisify(execFile)(
            "/bin/ls",
            ["-lde", file],
            {
              maxBuffer: 8192,
              env: { LC_ALL: "C", PATH: "/usr/bin:/bin" },
            }
          );
          if (/^\s*\d+:/m.test(stdout)) throw unavailable();
        }
        const bytes = Buffer.alloc(64 * 1024 + 1);
        const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
        if (bytesRead > 64 * 1024) throw unavailable();
        const parsed: unknown = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(
            bytes.subarray(0, bytesRead)
          )
        );
        if (
          !record(parsed) ||
          parsed.version !== 1 ||
          !Array.isArray(parsed.endpoints) ||
          parsed.endpoints.length > 256
        ) {
          if (
            record(parsed) &&
            typeof parsed.version === "number" &&
            parsed.version > 1
          )
            this.writable = false;
          throw unavailable();
        }
        const loaded = new Map<string, string>();
        for (const value of parsed.endpoints) {
          if (
            !record(value) ||
            typeof value.id !== "string" ||
            typeof value.base_url !== "string"
          )
            throw unavailable();
          validId(value.id);
          if (loaded.has(value.id)) throw unavailable();
          loaded.set(value.id, canonical(value.base_url));
        }
        for (const [id, baseUrl] of loaded) this.receipts.set(id, baseUrl);
      } finally {
        await handle.close();
      }
    } catch {
      // Missing, malformed, future or unsafe receipt files confer no authority.
      // An explicit Save may replace a malformed receipt; startup never does.
      this.receipts.clear();
    }
  }
}

function canonical(baseUrl: string): string {
  ProviderNetworkPolicy.canonicalOrigin(baseUrl);
  return new URL(baseUrl).href;
}
function validId(id: string): void {
  if (!isValidEndpointProviderId(id))
    throw new Error("provider endpoint id is invalid");
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function unavailable(): Error {
  return new Error("provider_endpoint_connect_required");
}
async function privateDirectory(directory: string): Promise<void> {
  if (process.platform !== "win32")
    return await requirePrivateDirectory(directory);
  // Windows retained services already use the inherited profile-directory ACL.
  // POSIX uid/mode checks have no meaning there; aliases still fail closed.
  const stat = await fs.lstat(directory);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    (await fs.realpath(directory)) !== directory
  )
    throw unavailable();
}
