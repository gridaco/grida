/**
 * GRIDA-SEC-004 / GRIDA-SEC-014 — shared BYOK custody behind presence/set/delete.
 * Raw keys stay in the native host. No renderer or HTTP secret-read operation.
 * Account logout and ChatGPT OAuth remain separate from this provider file.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { ProviderCredentialStore } from "@grida/auth/providers";
import type { AuthStore } from "./auth/file";

/** Compatibility façade over the canonical native provider credential owner. */
export class SecretsStore {
  readonly directory: string;
  private readonly home: string;
  private ready: Promise<ProviderCredentialStore> | undefined;

  constructor(
    private readonly auth: AuthStore,
    providerHome = auth.userDataPath
  ) {
    this.home = path.resolve(providerHome);
    this.directory = path.join(this.home, "providers");
  }

  private store(): Promise<ProviderCredentialStore> {
    this.ready ??= this.initialize().catch((error) => {
      this.ready = undefined;
      throw error instanceof ProviderCredentialStore.Failure
        ? error
        : new ProviderCredentialStore.Failure("storage_failed");
    });
    return this.ready;
  }

  private async initialize(): Promise<ProviderCredentialStore> {
    if (!["darwin", "linux"].includes(process.platform)) {
      throw new ProviderCredentialStore.Failure("unsupported_platform");
    }
    // Only the explicit host path is canonicalized. This accommodates native
    // temporary-directory aliases without reading another application's home.
    await fs.mkdir(this.home, { recursive: true, mode: 0o700 });
    const store = new ProviderCredentialStore({
      home: await fs.realpath(this.home),
    });
    await this.auth.migrateProviderKeys(store);
    return store;
  }

  async has(providerId: string): Promise<boolean> {
    return (await this._getKey(providerId)) !== null;
  }

  async set(
    providerId: string,
    key: string,
    _metadata?: Record<string, string>
  ): Promise<void> {
    if (!key.trim()) throw new ProviderCredentialStore.Failure("invalid_input");
    await (await this.store()).set(providerId, key);
  }

  async delete(providerId: string): Promise<void> {
    await (await this.store()).remove(providerId);
  }

  /** Trusted SDK injection only. Never expose through the daemon transport. */
  async _getKey(providerId: string): Promise<string | null> {
    const key = await (await this.store()).read(providerId);
    return key?.trim() ? key : null;
  }
}
