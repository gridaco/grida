/**
 * GRIDA-SEC-004 — endpoint provider config store (issue #806).
 *
 * Persists user-configured OpenAI-compatible endpoints (Ollama, self-
 * hosted gateways) at `${userData}/endpoints.json` with the same
 * atomic-write pattern as `workspaces.json` / `recent.json`.
 *
 * Deliberately a SIBLING of `SecretsStore`, not part of it: an endpoint
 * config (base URL + registered models) is plain readable config the
 * renderer may list back, while secrets are write/presence/delete-only.
 * If a gateway needs an API key, that key goes through the secrets
 * surface under the endpoint's id — it never lands in this file.
 *
 * Every load re-validates entries through the protocol validator, so a
 * hand-edited or corrupted file degrades to "entry dropped", never to
 * an invalid config reaching the provider factory.
 */

import fs from "node:fs/promises";
import path from "node:path";
import {
  resolveEndpointModels,
  validateEndpointProviderConfig,
  type EndpointModelSpec,
  type EndpointProviderConfig,
} from "../protocol/endpoints";
import { isByokProviderId } from "../protocol/provider-ids";
import { atomicWrite } from "../storage/atomic-write";

const FILE_NAME = "endpoints.json";
const MAX_ENTRIES = 16;

/**
 * THE provider-id namespace gate: BYOK ids ∪ configured endpoint ids.
 * Shared by every boundary that accepts a provider id (`/secrets/*`
 * allowlist, the run-input `provider_id` gate) — a closed set; anything
 * else must 400.
 */
export async function isKnownProviderId(
  id: string,
  endpoints?: EndpointProvidersStore
): Promise<boolean> {
  if (isByokProviderId(id)) return true;
  return (await endpoints?.get(id)) != null;
}

export class EndpointProvidersStore {
  private entries: EndpointProviderConfig[] = [];
  private load_promise: Promise<void> | null = null;
  private write_chain: Promise<void> = Promise.resolve();
  private readonly file_path: string;

  constructor(userDataPath: string) {
    this.file_path = path.join(userDataPath, FILE_NAME);
  }

  /** Absolute path of the backing JSON — surfaced so the settings UI can
   *  point developers at the hand-editable file (overrides live there). */
  get filePath(): string {
    return this.file_path;
  }

  /** One shared load: concurrent first calls await the SAME read instead
   *  of a second caller observing the default empty cache mid-load. */
  private ensureLoaded(): Promise<void> {
    this.load_promise ??= this.loadOnce();
    return this.load_promise;
  }

  private async loadOnce(): Promise<void> {
    try {
      const raw = await fs.readFile(this.file_path, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const valid: EndpointProviderConfig[] = [];
        for (const entry of parsed) {
          const result = validateEndpointProviderConfig(entry);
          if (result.ok && !valid.some((e) => e.id === result.config.id)) {
            valid.push(result.config);
          }
        }
        this.entries = valid.slice(0, MAX_ENTRIES);
      }
    } catch {
      // Missing or corrupt file → empty. Endpoint config is cheap to
      // re-enter; a hand-edit-the-JSON-to-recover UX would be hostile.
      this.entries = [];
    }
  }

  /** Serialize mutations: each read-modify-persist runs against the
   *  previous one's result, so concurrent `set()`/`delete()` calls can't
   *  compute from stale snapshots and overwrite each other on disk. */
  private withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.write_chain.then(fn);
    this.write_chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private async persist(): Promise<void> {
    await atomicWrite(this.file_path, JSON.stringify(this.entries, null, 2));
  }

  async list(): Promise<EndpointProviderConfig[]> {
    await this.ensureLoaded();
    return [...this.entries];
  }

  async get(id: string): Promise<EndpointProviderConfig | null> {
    await this.ensureLoaded();
    return this.entries.find((e) => e.id === id) ?? null;
  }

  /**
   * Insert or replace the config with the same id. The caller (route)
   * validates the shape; this re-validates anyway so a non-route caller
   * can't persist an invalid entry.
   */
  async set(config: EndpointProviderConfig): Promise<void> {
    const result = validateEndpointProviderConfig(config);
    if (!result.ok) {
      throw new Error(`[agent-host-endpoints] invalid config: ${result.error}`);
    }
    await this.withWriteLock(async () => {
      await this.ensureLoaded();
      const next = this.entries.filter((e) => e.id !== result.config.id);
      if (next.length >= MAX_ENTRIES) {
        throw new Error(
          `[agent-host-endpoints] too many endpoint providers (max ${MAX_ENTRIES})`
        );
      }
      next.push(result.config);
      this.entries = next;
      await this.persist();
    });
  }

  async delete(id: string): Promise<void> {
    await this.withWriteLock(async () => {
      await this.ensureLoaded();
      const next = this.entries.filter((e) => e.id !== id);
      if (next.length === this.entries.length) return;
      this.entries = next;
      await this.persist();
    });
  }

  /**
   * Every model registered across all endpoints, OVERRIDE-RESOLVED —
   * the custom half of the model-registry seam
   * (`models.text.registry.resolve(id, THIS)`). Consumers: the run-input
   * model gate, compaction limits, multimodal/tool_call capability
   * checks — all of them must see the effective values, never the raw
   * detected fields.
   */
  async registeredModels(): Promise<EndpointModelSpec[]> {
    await this.ensureLoaded();
    return this.entries.flatMap((e) => resolveEndpointModels(e));
  }
}
