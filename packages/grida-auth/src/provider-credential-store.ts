// GRIDA-SEC-014 — one private TOML authority, atomic mutations, irreversible import fence.
import path from "node:path";
import { lstat } from "node:fs/promises";
import { isMainThread } from "node:worker_threads";
import { parse, stringify } from "smol-toml";
import { AuthClient } from "./auth-client";
import { privateFiles } from "./private-files";
import { ProfileLock } from "./profile-lock";

/** Node 24+, local macOS/Linux filesystems, main thread only. Construction is I/O-free. */
export class ProviderCredentialStore {
  private readonly directory: string;
  private readonly filename: string;
  private readonly lock: ProfileLock;

  constructor(options: ProviderCredentialStore.Options) {
    try {
      const home = options.home;
      if (
        typeof home !== "string" ||
        !path.isAbsolute(home) ||
        path.resolve(home) !== home ||
        home === path.parse(home).root ||
        // eslint-disable-next-line no-control-regex -- Private paths exclude controls.
        /[\x00-\x1f\x7f]/.test(home) ||
        !home.isWellFormed()
      )
        throw new ProviderCredentialStore.Failure("invalid_input");
      this.directory = path.join(home, "providers");
      this.filename = path.join(this.directory, "credentials.toml");
      this.lock = new ProfileLock(this.directory);
    } catch {
      throw new ProviderCredentialStore.Failure("invalid_input");
    }
  }

  /** Secret-bearing output for trusted provider SDK injection only. */
  async read(provider: string): Promise<string | null> {
    ProviderDocument.provider(provider);
    return this.run(
      async (document) => document.providers[provider]?.api_key ?? null
    );
  }

  /** Sorted presence only; no credential values, lengths, prefixes, or fingerprints. */
  async list(): Promise<ProviderCredentialStore.Presence[]> {
    return this.run(async (document) =>
      Object.keys(document.providers)
        .sort()
        .map((provider) => ({ provider }))
    );
  }

  /** Replaces this provider only, preserving all other entries from a fresh locked read. */
  async set(provider: string, apiKey: string): Promise<void> {
    ProviderDocument.provider(provider);
    ProviderDocument.key(apiKey);
    return this.run(async (document) => {
      document.providers[provider] = { api_key: apiKey };
      document.migration.removed = document.migration.removed.filter(
        (id) => id !== provider
      );
      await this.write(document);
    });
  }

  /** Durable deletion, including a tombstone before the one-time import has begun. */
  async remove(provider: string): Promise<void> {
    ProviderDocument.provider(provider);
    return this.run(async (document) => {
      delete document.providers[provider];
      if (
        document.migration.state === "unstarted" &&
        !document.migration.removed.includes(provider)
      )
        document.migration.removed.push(provider);
      await this.write(document);
    });
  }

  /**
   * One-time import. Hold the source's exclusive writer lock before calling and
   * through completion. `retire` durably removes only source API keys, preserves
   * unrelated records, is idempotent, and must never reenter this store.
   * Pending retry never imports again. Completed migration never calls retire.
   */
  async migrate(
    source: ProviderCredentialStore.Migration
  ): Promise<{ state: "complete" }> {
    let read: () => Promise<readonly ProviderCredentialStore.Entry[]>;
    let retire: () => Promise<void>;
    try {
      const readSource = source.read;
      const retireSource = source.retire;
      if (
        typeof readSource !== "function" ||
        typeof retireSource !== "function"
      )
        throw new ProviderCredentialStore.Failure("invalid_input");
      read = readSource.bind(source);
      retire = retireSource.bind(source);
    } catch {
      throw new ProviderCredentialStore.Failure("invalid_input");
    }
    return this.run(async (document) => {
      if (document.migration.state === "complete") return { state: "complete" };
      if (document.migration.state === "unstarted") {
        let supplied: readonly ProviderCredentialStore.Entry[];
        try {
          supplied = await read();
        } catch {
          throw new ProviderCredentialStore.Failure("migration_failed");
        }
        const entries = ProviderDocument.entries(supplied);
        for (const { provider, apiKey } of entries) {
          if (
            !Object.hasOwn(document.providers, provider) &&
            !document.migration.removed.includes(provider)
          )
            document.providers[provider] = { api_key: apiKey };
        }
        document.migration = { state: "pending", removed: [] };
        // This durable fence precedes any retirement. A later failure retains it.
        await this.write(document);
      }
      try {
        await retire();
      } catch {
        throw new ProviderCredentialStore.Failure("migration_failed");
      }
      document.migration = { state: "complete", removed: [] };
      await this.write(document);
      return { state: "complete" };
    }, true);
  }

  private async run<T>(
    operation: (document: ProviderDocument.Document) => Promise<T>,
    migration = false
  ): Promise<T> {
    if (
      !["darwin", "linux"].includes(process.platform) ||
      !isMainThread ||
      !process.geteuid
    )
      throw new ProviderCredentialStore.Failure("unsupported_platform");
    try {
      return await this.lock.run(async () => {
        await privateFiles.cleanup(this.filename);
        const document = await this.readDocument();
        if (!migration && document.migration.state === "pending")
          throw new ProviderCredentialStore.Failure("migration_pending");
        return operation(document);
      });
    } catch (error) {
      if (error instanceof ProviderCredentialStore.Failure) throw error;
      if (error instanceof AuthClient.Failure && error.code === "session_busy")
        throw new ProviderCredentialStore.Failure("store_busy");
      throw new ProviderCredentialStore.Failure("storage_failed");
    }
  }

  private async readDocument(): Promise<ProviderDocument.Document> {
    try {
      await lstat(this.filename);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT")
        return {
          version: 1,
          migration: { state: "unstarted", removed: [] },
          providers: Object.create(null),
        };
      throw error;
    }
    const handle = await privateFiles.open(this.filename, "read");
    try {
      if ((await handle.stat()).size > 1_048_576)
        throw new ProviderCredentialStore.Failure("invalid_store");
      const bytes = await handle.readFile();
      if (bytes.length > 1_048_576)
        throw new ProviderCredentialStore.Failure("invalid_store");
      let raw: unknown;
      try {
        // Fatal decoding forbids replacement of malformed persisted key bytes.
        // Preserve a BOM so it is rejected instead of silently stripped.
        const text = new TextDecoder("utf-8", {
          fatal: true,
          ignoreBOM: true,
        }).decode(bytes);
        if (text.startsWith("\uFEFF")) throw new Error();
        raw = parse(text, { integersAsBigInt: true, maxDepth: 4 });
      } catch {
        throw new ProviderCredentialStore.Failure("invalid_store");
      }
      const version = (raw as Record<string, unknown>).version;
      if (typeof version !== "bigint")
        throw new ProviderCredentialStore.Failure("invalid_store");
      if (version !== 1n)
        throw new ProviderCredentialStore.Failure("unsupported_version");
      return ProviderDocument.document({
        ...(raw as Record<string, unknown>),
        version: 1,
      });
    } finally {
      await handle.close();
    }
  }

  private async write(document: ProviderDocument.Document): Promise<void> {
    ProviderDocument.document(document);
    const providers = Object.create(null) as Record<
      string,
      { api_key: string }
    >;
    for (const provider of Object.keys(document.providers).sort())
      providers[provider] = document.providers[provider]!;
    let text: string;
    try {
      text =
        "# Contains secrets. Do not commit, log, or share this file.\n" +
        stringify({
          version: 1,
          migration: {
            state: document.migration.state,
            removed: [...document.migration.removed].sort(),
          },
          providers,
        });
      if (Buffer.byteLength(text, "utf8") > 1_048_576) throw new Error();
    } catch {
      throw new ProviderCredentialStore.Failure("invalid_store");
    }
    await privateFiles.atomicWrite(this.filename, text);
  }
}

export namespace ProviderCredentialStore {
  export type Options = { home: string };
  export type Presence = { provider: string };
  export type Entry = { provider: string; apiKey: string };
  export type Migration = {
    read(): Promise<readonly Entry[]>;
    retire(): Promise<void>;
  };
  export type FailureCode =
    | "invalid_input"
    | "invalid_store"
    | "unsupported_version"
    | "storage_failed"
    | "store_busy"
    | "migration_failed"
    | "migration_pending"
    | "unsupported_platform";

  export class Failure extends Error {
    readonly code: FailureCode;
    constructor(code: FailureCode) {
      super(`Grida provider credentials failed (${code})`);
      this.name = "ProviderCredentialStore.Failure";
      this.code = code;
    }
  }
}

/** Internal schema and bounds; never a public credential inspection surface. */
namespace ProviderDocument {
  const Failure = ProviderCredentialStore.Failure;

  export type Document = {
    version: 1;
    migration: {
      state: "unstarted" | "pending" | "complete";
      removed: string[];
    };
    providers: Record<string, { api_key: string }>;
  };

  export function provider(value: unknown): asserts value is string {
    if (typeof value !== "string" || !/^[a-z][a-z0-9_-]{0,63}$/.test(value))
      throw new Failure("invalid_input");
  }

  export function key(value: unknown): asserts value is string {
    if (
      typeof value !== "string" ||
      value.length === 0 ||
      !value.isWellFormed() ||
      // eslint-disable-next-line no-control-regex -- API keys exclude C0/C1 controls.
      /[\x00-\x1f\x7f-\x9f]/.test(value) ||
      Buffer.byteLength(value, "utf8") > 16_384
    )
      throw new Failure("invalid_input");
  }

  export function entries(value: unknown): ProviderCredentialStore.Entry[] {
    try {
      if (!Array.isArray(value) || value.length > 128)
        throw new Failure("invalid_input");
      const seen = new Set<string>();
      return value.map((entry) => {
        const { provider: id, apiKey } = entry;
        provider(id);
        key(apiKey);
        if (seen.has(id)) throw new Failure("invalid_input");
        seen.add(id);
        return { provider: id, apiKey };
      });
    } catch {
      throw new Failure("invalid_input");
    }
  }

  function object(value: unknown): value is Record<string, unknown> {
    return (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      [Object.prototype, null].includes(Object.getPrototypeOf(value))
    );
  }

  function fields(value: Record<string, unknown>, expected: string[]) {
    if (
      Object.keys(value).length !== expected.length ||
      expected.some((name) => !Object.hasOwn(value, name))
    )
      throw new Failure("invalid_store");
  }

  export function document(value: unknown): Document {
    try {
      if (!object(value)) throw new Failure("invalid_store");
      if (
        typeof value.version === "number" &&
        Number.isInteger(value.version) &&
        value.version !== 1
      )
        throw new Failure("unsupported_version");
      fields(value, ["version", "migration", "providers"]);
      if (
        value.version !== 1 ||
        !object(value.migration) ||
        !object(value.providers)
      )
        throw new Failure("invalid_store");
      const migration = value.migration;
      fields(migration, ["state", "removed"]);
      if (
        !["unstarted", "pending", "complete"].includes(
          migration.state as string
        ) ||
        !Array.isArray(migration.removed) ||
        migration.removed.length > 128
      )
        throw new Failure("invalid_store");
      const removed = new Set<string>();
      for (const id of migration.removed) {
        provider(id);
        if (removed.has(id)) throw new Failure("invalid_store");
        removed.add(id);
      }
      if (migration.state !== "unstarted" && removed.size !== 0)
        throw new Failure("invalid_store");
      const ids = Object.keys(value.providers);
      if (ids.length + removed.size > 128) throw new Failure("invalid_store");
      const providers = Object.create(null) as Document["providers"];
      for (const id of ids) {
        provider(id);
        const entry = value.providers[id];
        if (!object(entry) || removed.has(id))
          throw new Failure("invalid_store");
        fields(entry, ["api_key"]);
        key(entry.api_key);
        providers[id] = { api_key: entry.api_key };
      }
      return {
        version: 1,
        migration: {
          state: migration.state as Document["migration"]["state"],
          removed: [...removed],
        },
        providers,
      };
    } catch (error) {
      if (error instanceof Failure && error.code === "unsupported_version")
        throw error;
      throw new Failure("invalid_store");
    }
  }
}
