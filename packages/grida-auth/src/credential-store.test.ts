// GRIDA-SEC-010 — disposable custody, failure recovery, and backend separation.
// GRIDA-SEC-006 / GRIDA-GG: token — invalid sink configuration precedes durable I/O.
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CredentialStore } from "./credential-store";
import { AuthClient } from "./auth-client";
import { createPersistentNativeAuth } from "./node";

const config: AuthClient.Config = {
  issuer: "http://127.0.0.1:55431/auth/v1",
  apiOrigin: "http://127.0.0.1:3041",
  clientId: "synthetic-public-client",
  publishableKey: "sb_publishable_synthetic",
  redirectUris: ["http://127.0.0.1:55435/callback"],
};
const session: AuthClient.Session = {
  issuer: config.issuer,
  apiOrigin: config.apiOrigin,
  clientId: config.clientId,
  accessToken: "synthetic-access",
  refreshToken: "synthetic-refresh",
  expiresAt: 4_000_000_000_000,
  identity: { id: "synthetic-account", email: null, display_name: "Test" },
};
const directories: string[] = [];
async function setup(storage?: CredentialStore.Backend) {
  const directory = await mkdtemp(join(tmpdir(), "grida-custody-"));
  directories.push(directory);
  const values = new Map<string, string>();
  const keyring = {
    read: vi.fn<(service: string, account: string) => Promise<string | null>>(
      async (service, account) => values.get(`${service}/${account}`) ?? null
    ),
    write: vi.fn<
      (service: string, account: string, value: string) => Promise<void>
    >(async (service, account, value) => {
      values.set(`${service}/${account}`, value);
    }),
  };
  const store = await CredentialStore.open(config, {
    home: directory,
    storage,
    keyring,
  });
  return { directory, store, keyring, values };
}
const snapshot = (store: CredentialStore) =>
  store.exclusive((transaction) => transaction.read());
const save = (store: CredentialStore, value = session) =>
  store.exclusive((transaction) => transaction.write(value));
async function metadataPath(directory: string) {
  const [profile] = await readdir(join(directory, "auth"));
  return join(directory, "auth", profile!, "credentials.json");
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe.skipIf(process.platform === "win32")("durable native custody", () => {
  it("defaults to keyring and leaves no tokens in metadata", async () => {
    const { store, directory, keyring } = await setup();
    expect(await store.info()).toMatchObject({
      backend: "keyring",
      initialized: false,
    });
    expect(keyring.read).not.toHaveBeenCalled();
    await save(store);
    expect((await snapshot(store)).session).toEqual(session);
    const text = await readFile(await metadataPath(directory), "utf8");
    expect(text).not.toContain(session.accessToken);
    expect(text).not.toContain(session.refreshToken);
    expect(text).not.toContain(session.identity.id);
  });

  it("restarts from explicit file mode without loading a keyring", async () => {
    const { store, directory, keyring } = await setup("file");
    await save(store);
    const next = await CredentialStore.open(config, {
      home: directory,
      keyring,
    });
    expect((await snapshot(next)).session).toEqual(session);
    expect(await next.info()).toMatchObject({ backend: "file" });
    expect(keyring.read).not.toHaveBeenCalled();
    expect(keyring.write).not.toHaveBeenCalled();
  });

  it("keeps the credential profile and revision across public admission-key rotation", async () => {
    const { store, directory, keyring } = await setup("file");
    await save(store);
    const before = await snapshot(store);
    const rotated = await CredentialStore.open(
      {
        ...config,
        publishableKey: "sb_publishable_rotated",
      },
      { home: directory, keyring }
    );
    expect(await rotated.info()).toEqual(await store.info());
    expect(await snapshot(rotated)).toEqual(before);
    expect(await readdir(join(directory, "auth"))).toHaveLength(1);
    expect(await readFile(await metadataPath(directory), "utf8")).not.toContain(
      config.publishableKey
    );
  });

  it("keeps invalidation durable even when already signed out", async () => {
    const { store } = await setup("file");
    const before = await snapshot(store);
    await store.exclusive((transaction) => transaction.clear());
    const after = await snapshot(store);
    expect(after.session).toBeNull();
    expect(after.revision).not.toBe(before.revision);
  });

  it("keeps a secret-free keyring tombstone after logout", async () => {
    const { store, values } = await setup();
    await save(store);
    const before = await snapshot(store);
    await store.exclusive((transaction) => transaction.clear());
    const after = await snapshot(store);
    expect(after.session).toBeNull();
    expect(after.revision).not.toBe(before.revision);
    expect([...values.values()].join()).not.toContain(session.refreshToken);
  });

  it("treats a missing established keyring entry as failure, never sign-out", async () => {
    const { store, values } = await setup();
    await save(store);
    values.clear();
    await expect(snapshot(store)).rejects.toMatchObject({
      code: "custody_failed",
    });
  });

  it("refuses to adopt a residual keyring login after manual metadata loss", async () => {
    const { store, directory, keyring } = await setup();
    await save(store);
    await rm(await metadataPath(directory));
    const restarted = await CredentialStore.open(config, {
      home: directory,
      keyring,
    });
    await expect(snapshot(restarted)).rejects.toMatchObject({
      code: "custody_failed",
    });
  });

  it("explicit file recovery after metadata loss never adopts or certifies cleanup of an untracked keyring login", async () => {
    const { store, directory, values } = await setup();
    await save(store);
    await rm(await metadataPath(directory));
    expect(await store.migrate("file")).toMatchObject({ backend: "file" });
    expect((await snapshot(store)).session).toBeNull();
    expect([...values.values()].join()).toContain(session.refreshToken);
  });

  it("never falls back when a keyring is locked or unavailable", async () => {
    const { store, directory, keyring } = await setup();
    keyring.read.mockRejectedValue(
      new Error("private-native-error synthetic-access")
    );
    await expect(snapshot(store)).rejects.toMatchObject({
      code: "custody_failed",
      message: "Grida authentication failed (custody_failed)",
    });
    const metadata = await readFile(await metadataPath(directory), "utf8");
    expect(metadata).not.toContain("synthetic-access");
    expect(JSON.parse(metadata).backend).toBe("keyring");
  });

  it("requires write read-back before accepting initial keyring custody", async () => {
    const { store, keyring } = await setup();
    keyring.write.mockResolvedValue(undefined);
    await expect(snapshot(store)).rejects.toMatchObject({
      code: "custody_failed",
    });
    expect(await store.info()).toMatchObject({ initialized: false });
  });

  it("allows explicit file choice after a failed empty keyring initialization", async () => {
    const { store, directory, keyring } = await setup();
    keyring.write.mockRejectedValue(new Error("locked"));
    await expect(snapshot(store)).rejects.toMatchObject({
      code: "custody_failed",
    });
    const file = await CredentialStore.open(config, {
      home: directory,
      storage: "file",
      keyring,
    });
    expect((await snapshot(file)).session).toBeNull();
    expect(await file.info()).toMatchObject({
      backend: "file",
      initialized: true,
    });
  });

  it("refuses an implicit switch between established backends", async () => {
    const { store, directory, keyring } = await setup("file");
    await save(store);
    const conflicting = await CredentialStore.open(config, {
      home: directory,
      storage: "keyring",
      keyring,
    });
    await expect(snapshot(conflicting)).rejects.toMatchObject({
      code: "custody_failed",
    });
    expect(keyring.read).not.toHaveBeenCalled();
    expect((await snapshot(store)).session).toEqual(session);
  });

  it.each(["issuer", "clientId", "apiOrigin"] as const)(
    "partitions credentials by %s",
    async (field) => {
      const { store, directory, keyring } = await setup("file");
      await save(store);
      const otherConfig = { ...config, [field]: `${config[field]}-other` };
      const other = await CredentialStore.open(otherConfig, {
        home: directory,
        storage: "file",
        keyring,
      });
      expect((await snapshot(other)).session).toBeNull();
      expect((await store.info()).profile).not.toBe(
        (await other.info()).profile
      );
    }
  );

  it("binds keyring namespaces to the canonical credential home", async () => {
    const first = await setup();
    await save(first.store);
    const second = await setup();
    const other = await CredentialStore.open(config, {
      home: second.directory,
      keyring: first.keyring,
    });
    expect((await snapshot(other)).session).toBeNull();
    expect(first.values.size).toBe(2);
  });

  it("refuses malformed, rebound, and oversized credential contents", async () => {
    const { store, directory } = await setup("file");
    await save(store);
    const path = await metadataPath(directory);
    const valid = JSON.parse(await readFile(path, "utf8"));
    for (const invalid of [
      "{broken",
      JSON.stringify({ ...valid, binding: {} }),
      JSON.stringify({
        ...valid,
        envelope: { revision: valid.envelope.revision, session: {} },
      }),
      "x".repeat(1_048_577),
    ]) {
      await writeFile(path, invalid);
      await expect(snapshot(store)).rejects.toMatchObject({
        code: "custody_failed",
      });
    }
  });

  it("refuses a session from a different registration", async () => {
    const { store } = await setup("file");
    await expect(
      save(store, { ...session, clientId: "other" })
    ).rejects.toMatchObject({ code: "custody_failed" });
    expect((await snapshot(store)).session).toBeNull();
  });

  it("projects stored identity fields before they can become public status", async () => {
    const { store, directory } = await setup("file");
    await save(store);
    const filename = await metadataPath(directory);
    const metadata = JSON.parse(await readFile(filename, "utf8"));
    metadata.envelope.session.identity.refreshToken = "must-not-leak";
    await writeFile(filename, JSON.stringify(metadata));
    expect((await snapshot(store)).session).toEqual(session);
  });

  it("removes unpublished credential temporaries before logout completes", async () => {
    const { store, directory } = await setup("file");
    await save(store);
    const filename = await metadataPath(directory);
    const orphan = `${filename}.c8e768aa-4c3b-4f2d-8901-77837789e4e2.tmp`;
    await writeFile(orphan, JSON.stringify(session), { mode: 0o600 });
    await store.exclusive((transaction) => transaction.clear());
    await expect(readFile(orphan)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await snapshot(store)).session).toBeNull();
  });

  it("does not roll back accepted mutations after a later operation fails", async () => {
    const { store } = await setup("file");
    await expect(
      store.exclusive(async (transaction) => {
        await transaction.write(session);
        throw new AuthClient.Failure("unavailable");
      })
    ).rejects.toMatchObject({ code: "unavailable" });
    expect((await snapshot(store)).session).toEqual(session);
  });

  it("revokes the transaction capability when exclusivity ends", async () => {
    const { store } = await setup("file");
    let escaped!: AuthClient.CustodyTransaction;
    await store.exclusive(async (transaction) => {
      escaped = transaction;
    });
    await expect(escaped.clear()).rejects.toMatchObject({
      code: "custody_failed",
    });
  });

  it("migrates file to keyring and removes the plaintext envelope", async () => {
    const { store, directory } = await setup("file");
    await save(store);
    const before = await snapshot(store);
    expect(await store.migrate("keyring")).toMatchObject({
      backend: "keyring",
      migration: null,
    });
    const after = await snapshot(store);
    expect(after.session).toEqual(session);
    expect(after.revision).not.toBe(before.revision);
    expect(await readFile(await metadataPath(directory), "utf8")).not.toContain(
      session.refreshToken
    );
  });

  it("migrates keyring to file and clears the old keyring credential", async () => {
    const { store, values } = await setup();
    await save(store);
    expect(await store.migrate("file")).toMatchObject({
      backend: "file",
      migration: null,
    });
    expect((await snapshot(store)).session).toEqual(session);
    expect([...values.values()].join()).not.toContain(session.refreshToken);
  });

  it("keeps a failed migration explicit and resumable without reviving old custody", async () => {
    const { store, directory, keyring } = await setup();
    await save(store);
    keyring.write.mockRejectedValueOnce(new Error("locked during cleanup"));
    await expect(store.migrate("file")).rejects.toMatchObject({
      code: "custody_failed",
    });
    expect(await store.info()).toMatchObject({
      backend: "file",
      migration: "pending",
    });
    await expect(snapshot(store)).rejects.toMatchObject({
      code: "custody_failed",
    });
    const restarted = await CredentialStore.open(config, {
      home: directory,
      keyring,
    });
    await expect(restarted.migrate("keyring")).rejects.toMatchObject({
      code: "custody_failed",
    });
    expect(await restarted.migrate("file")).toMatchObject({ migration: null });
    expect((await snapshot(restarted)).session).toEqual(session);
  });

  it("can resume a failed copy into the destination keyring", async () => {
    const { store, keyring } = await setup("file");
    await save(store);
    keyring.write.mockRejectedValueOnce(new Error("unavailable"));
    await expect(store.migrate("keyring")).rejects.toMatchObject({
      code: "custody_failed",
    });
    await expect(snapshot(store)).rejects.toMatchObject({
      code: "custody_failed",
    });
    expect(await store.migrate("keyring")).toMatchObject({ migration: null });
    expect((await snapshot(store)).session).toEqual(session);
  });

  it("exposes safe native storage controls and validates config before disk access", async () => {
    const { directory } = await setup("file");
    const native = await createPersistentNativeAuth(config, {
      home: directory,
      storage: "file",
      openBrowser: async () => {},
    });
    expect(await native.client.status()).toEqual({ state: "signed-out" });
    expect(await native.storage.info()).toMatchObject({ backend: "file" });
    await expect(
      createPersistentNativeAuth(
        { ...config, issuer: "https://invalid.example" },
        { home: join(directory, "must-not-exist"), openBrowser: async () => {} }
      )
    ).rejects.toMatchObject({ code: "invalid_config" });
    expect(await readdir(directory)).not.toContain("must-not-exist");
    await expect(
      createPersistentNativeAuth(config, {
        home: join(directory, "invalid-sink-must-not-exist"),
        openBrowser: async () => {},
        get gg(): AuthClient.GgSink {
          throw new Error("private-sink-config");
        },
      })
    ).rejects.toMatchObject({
      code: "invalid_config",
      message: "Grida authentication failed (invalid_config)",
    });
    expect(await readdir(directory)).not.toContain(
      "invalid-sink-must-not-exist"
    );
  });
});
