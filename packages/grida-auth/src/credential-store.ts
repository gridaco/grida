// GRIDA-SEC-010 — durable native credentials, backend authority, and revision fencing.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, realpath } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { isMainThread } from "node:worker_threads";
import { home } from "@grida/home";
import { AuthClient } from "./auth-client";
import { Keyring } from "./keyring";
import { privateFiles } from "./private-files";
import { ProfileLock } from "./profile-lock";

/** Internal Node custody owner. Only safe storage controls leave the native factory. */
export class CredentialStore implements AuthClient.CoordinatedCustody {
  private readonly lock: ProfileLock;
  private readonly path: string;
  private readonly account: string;
  private static readonly service = "Grida Native Auth";

  private constructor(
    private readonly binding: CredentialStore.Binding,
    private readonly profile: string,
    directory: string,
    private requested: CredentialStore.Backend | undefined,
    private readonly keyring: Pick<Keyring, "read" | "write">
  ) {
    this.path = join(directory, "credentials.json");
    this.account = profile;
    this.lock = new ProfileLock(directory);
  }

  static async open(
    config: AuthClient.Config,
    options: {
      home?: string;
      storage?: CredentialStore.Backend;
      /** Internal test seam; never exposed by the native factory. */
      keyring?: Pick<Keyring, "read" | "write">;
    } = {}
  ): Promise<CredentialStore> {
    try {
      if (!isMainThread || !["darwin", "linux"].includes(process.platform))
        fail();
      if (options.storage !== undefined && !isBackend(options.storage)) fail();
      const directory = options.home ?? home.dir();
      if (!isAbsolute(directory)) fail();
      // The Grida home is shared with other products; never chmod it. The auth
      // subtree is private and validated independently by privateFiles.
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const canonicalHome = await realpath(directory);
      const binding: CredentialStore.Binding = {
        home: canonicalHome,
        issuer: config.issuer,
        clientId: config.clientId,
        apiOrigin: config.apiOrigin,
      };
      const profile = createHash("sha256")
        .update(JSON.stringify(binding))
        .digest("hex");
      const authDirectory = join(canonicalHome, "auth");
      await privateFiles.directory(authDirectory);
      const profileDirectory = join(authDirectory, profile);
      await privateFiles.directory(profileDirectory);
      return new CredentialStore(
        binding,
        profile,
        profileDirectory,
        options.storage,
        options.keyring ?? new Keyring()
      );
    } catch (error) {
      throw safe(error);
    }
  }

  async exclusive<T>(
    operation: (transaction: AuthClient.CustodyTransaction) => Promise<T>
  ): Promise<T> {
    return this.lock.run(async () => {
      let metadata = await this.load();
      if (metadata.migration) fail();
      metadata = await this.initialize(metadata);
      let active = true;
      const check = () => {
        if (!active) fail();
      };
      const transaction: AuthClient.CustodyTransaction = {
        read: async () => {
          check();
          const envelope = await this.readEnvelope(metadata);
          return structuredClone(envelope);
        },
        write: async (session) => {
          check();
          this.validateSession(session);
          metadata = await this.writeEnvelope(metadata, {
            revision: randomUUID(),
            session: canonicalSession(session),
          });
        },
        clear: async () => {
          check();
          // Retain a secret-free tombstone, including when already signed out.
          // Deleting the revision would let an earlier consent commit after logout.
          metadata = await this.writeEnvelope(metadata, empty());
        },
      };
      try {
        return await operation(transaction);
      } finally {
        active = false;
      }
    });
  }

  /** Local non-secret metadata; does not read/unlock the credential backend. */
  async info(): Promise<CredentialStore.Info> {
    return this.lock.run(async () => this.describe(await this.load(false)));
  }

  /** Explicit, resumable backend change; ordinary reads never perform migration. */
  async migrate(
    backend: CredentialStore.Backend
  ): Promise<CredentialStore.Info> {
    if (!isBackend(backend)) fail();
    return this.lock.run(async () => {
      let metadata = await this.load(false);
      // Recover uninitialized metadata by explicit file selection without
      // opening that keyring. Manually lost metadata can leave untracked OS
      // entries; this recovery branch cannot certify their cleanup.
      if (!metadata.initialized && backend === "file") {
        metadata = {
          version: 1,
          binding: this.binding,
          backend: "file",
          initialized: true,
          envelope: empty(),
        };
        await this.save(metadata);
        this.requested = backend;
        return this.describe(metadata);
      }
      metadata = await this.initialize(metadata);
      if (metadata.migration && metadata.migration.to !== backend) fail();
      if (!metadata.migration && metadata.backend === backend)
        return this.describe(metadata);
      if (!metadata.migration) {
        metadata = {
          ...metadata,
          migration: { from: metadata.backend, to: backend },
        };
        await this.save(metadata);
      }
      if (metadata.backend !== backend) {
        const previous = await this.readEnvelope(metadata);
        const next = { ...previous, revision: randomUUID() };
        // Persist the intent before copying any secret. A crash leaves an
        // explicit pending migration; all auth operations then fail closed.
        const destination: CredentialStore.Metadata = {
          version: 1,
          binding: this.binding,
          backend,
          initialized: true,
          migration: metadata.migration,
          ...(backend === "file" ? { envelope: next } : {}),
        };
        if (backend === "keyring") await this.writeKeyring(next);
        await this.save(destination);
        metadata = destination;
      }
      if (metadata.migration?.from === "keyring")
        await this.writeKeyring(empty());
      // File -> keyring replaced the entire plaintext envelope atomically.
      // No claim of physical erasure from filesystem snapshots or backups.
      const { migration: _completed, ...complete } = metadata;
      await this.save(complete);
      this.requested = backend;
      return this.describe(complete);
    });
  }

  private async load(
    enforceRequested = true
  ): Promise<CredentialStore.Metadata> {
    await privateFiles.cleanup(this.path);
    const value = await privateFiles.read(this.path);
    if (value === null) {
      const backend = this.requested ?? "keyring";
      const metadata: CredentialStore.Metadata = {
        version: 1,
        binding: this.binding,
        backend,
        initialized: backend === "file",
        ...(backend === "file" ? { envelope: empty() } : {}),
      };
      await this.save(metadata);
      return metadata;
    }
    let metadata: CredentialStore.Metadata;
    try {
      metadata = JSON.parse(value);
      if (
        !record(metadata) ||
        metadata.version !== 1 ||
        !this.matchesBinding(metadata.binding) ||
        !isBackend(metadata.backend) ||
        typeof metadata.initialized !== "boolean" ||
        (metadata.backend === "file" && !metadata.initialized) ||
        (metadata.backend === "keyring" && metadata.envelope !== undefined) ||
        (metadata.migration !== undefined &&
          (!record(metadata.migration) ||
            !isBackend(metadata.migration.from) ||
            !isBackend(metadata.migration.to) ||
            metadata.migration.from === metadata.migration.to))
      )
        fail();
      if (metadata.backend === "file") this.validateEnvelope(metadata.envelope);
    } catch {
      fail();
    }
    if (
      enforceRequested &&
      !metadata.initialized &&
      this.requested === "file"
    ) {
      const initial: CredentialStore.Metadata = {
        version: 1,
        binding: this.binding,
        backend: "file",
        initialized: true,
        envelope: empty(),
      };
      await this.save(initial);
      return initial;
    }
    if (
      enforceRequested &&
      this.requested &&
      this.requested !== metadata.backend
    )
      fail();
    return metadata;
  }

  private async initialize(
    metadata: CredentialStore.Metadata
  ): Promise<CredentialStore.Metadata> {
    if (metadata.initialized) return metadata;
    try {
      const existing = await this.keyring.read(
        CredentialStore.service,
        this.account
      );
      if (existing !== null) {
        const envelope = this.parseKeyring(existing);
        // Never adopt a residual login after lost metadata. An interrupted
        // initialization can leave only an empty, bound envelope.
        if (envelope.session !== null) fail();
      }
      await this.writeKeyring(empty());
      const next = { ...metadata, initialized: true };
      await this.save(next);
      return next;
    } catch (error) {
      throw safe(error);
    }
  }

  private async readEnvelope(
    metadata: CredentialStore.Metadata
  ): Promise<CredentialStore.Envelope> {
    try {
      if (metadata.backend === "file") {
        this.validateEnvelope(metadata.envelope);
        return {
          revision: metadata.envelope.revision,
          session: metadata.envelope.session
            ? canonicalSession(metadata.envelope.session)
            : null,
        };
      }
      const value = await this.keyring.read(
        CredentialStore.service,
        this.account
      );
      if (value === null) fail(); // Missing an established store is corruption, not logout.
      return this.parseKeyring(value);
    } catch (error) {
      throw safe(error);
    }
  }

  private async writeEnvelope(
    metadata: CredentialStore.Metadata,
    envelope: CredentialStore.Envelope
  ): Promise<CredentialStore.Metadata> {
    if (metadata.backend === "keyring") {
      await this.writeKeyring(envelope);
      return metadata;
    }
    const next = { ...metadata, envelope };
    await this.save(next);
    return next;
  }

  private async writeKeyring(envelope: CredentialStore.Envelope) {
    try {
      const value = JSON.stringify({
        version: 1,
        binding: this.binding,
        ...envelope,
      });
      await this.keyring.write(CredentialStore.service, this.account, value);
      // In particular, Linux libsecret can report no value after a refused
      // unlock. Never turn that ambiguity into a successful save or sign-out.
      if (
        (await this.keyring.read(CredentialStore.service, this.account)) !==
        value
      )
        fail();
    } catch (error) {
      throw safe(error);
    }
  }

  private parseKeyring(value: string): CredentialStore.Envelope {
    if (value.length > 131_072) fail();
    const parsed = JSON.parse(value);
    if (
      !record(parsed) ||
      parsed.version !== 1 ||
      !this.matchesBinding(parsed.binding)
    )
      fail();
    this.validateEnvelope(parsed);
    return {
      revision: parsed.revision,
      session: parsed.session ? canonicalSession(parsed.session) : null,
    };
  }

  private validateEnvelope(
    value: unknown
  ): asserts value is CredentialStore.Envelope {
    if (
      !record(value) ||
      typeof value.revision !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        value.revision
      )
    )
      fail();
    if (value.session !== null) this.validateSession(value.session);
  }

  private validateSession(value: unknown): asserts value is AuthClient.Session {
    if (
      !record(value) ||
      value.issuer !== this.binding.issuer ||
      value.clientId !== this.binding.clientId ||
      value.apiOrigin !== this.binding.apiOrigin ||
      !opaque(value.accessToken) ||
      !opaque(value.refreshToken) ||
      !Number.isSafeInteger(value.expiresAt) ||
      (value.expiresAt as number) < 0 ||
      !record(value.identity) ||
      !opaque(value.identity.id) ||
      !nullableText(value.identity.email) ||
      !nullableText(value.identity.display_name)
    )
      fail();
  }

  private matchesBinding(value: unknown) {
    return (
      record(value) &&
      value.home === this.binding.home &&
      value.issuer === this.binding.issuer &&
      value.clientId === this.binding.clientId &&
      value.apiOrigin === this.binding.apiOrigin
    );
  }

  private async save(metadata: CredentialStore.Metadata) {
    await privateFiles.atomicWrite(this.path, JSON.stringify(metadata));
  }

  private describe(metadata: CredentialStore.Metadata): CredentialStore.Info {
    return {
      backend: metadata.backend,
      profile: this.profile,
      initialized: metadata.initialized,
      migration: metadata.migration ? "pending" : null,
    };
  }
}

export namespace CredentialStore {
  export type Backend = "keyring" | "file";
  export type Info = {
    backend: Backend;
    profile: string;
    initialized: boolean;
    migration: "pending" | null;
  };
  export type Binding = {
    home: string;
    issuer: string;
    clientId: string;
    apiOrigin: string;
  };
  export type Envelope = {
    revision: string;
    session: AuthClient.Session | null;
  };
  export type Metadata = {
    version: 1;
    binding: Binding;
    backend: Backend;
    initialized: boolean;
    envelope?: Envelope;
    migration?: { from: Backend; to: Backend };
  };
}

function empty(): CredentialStore.Envelope {
  return { revision: randomUUID(), session: null };
}
function canonicalSession(value: AuthClient.Session): AuthClient.Session {
  return {
    issuer: value.issuer,
    clientId: value.clientId,
    apiOrigin: value.apiOrigin,
    accessToken: value.accessToken,
    refreshToken: value.refreshToken,
    expiresAt: value.expiresAt,
    identity: {
      id: value.identity.id,
      email: value.identity.email,
      display_name: value.identity.display_name,
    },
  };
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function opaque(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 16_384 &&
    !/\s/.test(value)
  );
}
function nullableText(value: unknown) {
  return (
    value === null || (typeof value === "string" && value.length <= 16_384)
  );
}
function isBackend(value: unknown): value is CredentialStore.Backend {
  return value === "keyring" || value === "file";
}
function fail(): never {
  throw new AuthClient.Failure("custody_failed");
}
function safe(error: unknown): AuthClient.Failure {
  return error instanceof AuthClient.Failure
    ? error
    : new AuthClient.Failure("custody_failed");
}
