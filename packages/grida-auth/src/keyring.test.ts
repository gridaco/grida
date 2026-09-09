// GRIDA-SEC-010 — native errors are storage failures, never missing credentials or fallback.
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AuthClient } from "./auth-client";
import { Keyring } from "./keyring";

const service = "Grida Auth Adapter Test";
const account = "synthetic-profile";
const secret = "synthetic-credential-value";

function fake() {
  const values = new Map<string, string>();
  const binding: Keyring.Bindings = {
    getPassword: vi.fn<Keyring.Bindings["getPassword"]>(
      async (service, account) => values.get(`${service}/${account}`) ?? null
    ),
    setPassword: vi.fn<Keyring.Bindings["setPassword"]>(
      async (service, account, value) => {
        values.set(`${service}/${account}`, value);
      }
    ),
  };
  const load = vi.fn<Keyring.Loader>(async () => binding);
  return { binding, load, keyring: new Keyring(load) };
}

describe("Keyring", () => {
  it("loads the native binding lazily and shares one load across operations", async () => {
    const h = fake();
    expect(h.load).not.toHaveBeenCalled();
    await Promise.all([
      h.keyring.read(service, account),
      h.keyring.read(service, "another-profile"),
    ]);
    await h.keyring.write(service, account, secret);
    expect(h.load).toHaveBeenCalledOnce();
  });

  it("accepts the CJS default export without reading an alternate binding", async () => {
    const h = fake();
    const keyring = new Keyring(async () => ({ default: h.binding }));
    await expect(keyring.read(service, account)).resolves.toBeNull();
    expect(h.binding.getPassword).toHaveBeenCalledWith(service, account);
  });

  it("returns only explicit native absence as a missing entry", async () => {
    const h = fake();
    await expect(h.keyring.read(service, account)).resolves.toBeNull();
    expect(h.binding.setPassword).not.toHaveBeenCalled();
  });

  it.each([secret, "", "a credential with unicode: \u2713"])(
    "preserves stored strings for custody validation",
    async (value) => {
      const h = fake();
      vi.mocked(h.binding.getPassword).mockResolvedValue(value);
      await expect(h.keyring.read(service, account)).resolves.toBe(value);
    }
  );

  it.each([undefined, false, {}, 0])(
    "rejects malformed native read values instead of treating them as absence",
    async (value) => {
      const keyring = new Keyring(async () => ({
        getPassword: async () => value,
        setPassword: async () => undefined,
      }));
      await expect(keyring.read(service, account)).rejects.toMatchObject({
        code: "custody_failed",
      });
    }
  );

  it.each(["locked", "unavailable", "denied", "not found", "ambiguous"])(
    "sanitizes a %s read failure without writing or reporting absence",
    async (reason) => {
      const h = fake();
      vi.mocked(h.binding.getPassword).mockRejectedValue(
        new Error(`${reason}: ${secret}`, { cause: secret })
      );
      const error = await h.keyring
        .read(service, account)
        .catch((value) => value);
      expect(error).toBeInstanceOf(AuthClient.Failure);
      expect(error.code).toBe("custody_failed");
      expect(error.message).toBe(
        "Grida authentication failed (custody_failed)"
      );
      expect(error.cause).toBeUndefined();
      expect(String(error.stack)).not.toContain(secret);
      expect(JSON.stringify(error)).not.toContain(secret);
      expect(h.binding.setPassword).not.toHaveBeenCalled();
    }
  );

  it("sanitizes synchronous provider exceptions too", async () => {
    const h = fake();
    vi.mocked(h.binding.getPassword).mockImplementation(() => {
      throw new Error(secret);
    });
    await expect(h.keyring.read(service, account)).rejects.toMatchObject({
      code: "custody_failed",
      message: "Grida authentication failed (custody_failed)",
    });
  });

  it("keeps native load failure authoritative for this adapter", async () => {
    const load = vi.fn<Keyring.Loader>(async () => {
      throw new Error(secret);
    });
    const keyring = new Keyring(load);
    for (const operation of [
      () => keyring.read(service, account),
      () => keyring.write(service, account, secret),
    ]) {
      await expect(operation()).rejects.toMatchObject({
        code: "custody_failed",
        message: "Grida authentication failed (custody_failed)",
      });
    }
    expect(load).toHaveBeenCalledOnce();
  });

  it.each([null, undefined, {}, { getPassword() {} }, { default: null }])(
    "rejects an incompatible module without selecting another implementation",
    async (module) => {
      const keyring = new Keyring(async () => module);
      await expect(keyring.read(service, account)).rejects.toMatchObject({
        code: "custody_failed",
      });
    }
  );

  it("awaits the native write before resolving, including a logout tombstone", async () => {
    const h = fake();
    let finish!: () => void;
    vi.mocked(h.binding.setPassword).mockImplementation(
      () => new Promise<void>((resolve) => (finish = resolve))
    );
    const tombstone = JSON.stringify({ revision: 2, session: null });
    vi.mocked(h.binding.getPassword).mockResolvedValue(tombstone);
    let done = false;
    const write = h.keyring.write(service, account, tombstone).then(() => {
      done = true;
    });
    await vi.waitFor(() =>
      expect(h.binding.setPassword).toHaveBeenCalledWith(
        service,
        account,
        tombstone
      )
    );
    expect(done).toBe(false);
    finish();
    await write;
    expect(done).toBe(true);
  });

  it.each([null, "older-value"])(
    "rejects a native write that does not read back exactly",
    async (value) => {
      const h = fake();
      vi.mocked(h.binding.getPassword).mockResolvedValue(value);
      await expect(
        h.keyring.write(service, account, secret)
      ).rejects.toMatchObject({
        code: "custody_failed",
      });
      expect(h.binding.setPassword).toHaveBeenCalledOnce();
    }
  );

  it("sanitizes an error while verifying a completed native write", async () => {
    const h = fake();
    vi.mocked(h.binding.getPassword).mockRejectedValue(new Error(secret));
    await expect(
      h.keyring.write(service, account, secret)
    ).rejects.toMatchObject({
      code: "custody_failed",
      message: "Grida authentication failed (custody_failed)",
    });
    expect(h.binding.setPassword).toHaveBeenCalledOnce();
  });

  it("sanitizes a rejected write without retrying or converting it to success", async () => {
    const h = fake();
    vi.mocked(h.binding.setPassword).mockRejectedValue(new Error(secret));
    await expect(
      h.keyring.write(service, account, secret)
    ).rejects.toMatchObject({
      code: "custody_failed",
      message: "Grida authentication failed (custody_failed)",
    });
    expect(h.binding.setPassword).toHaveBeenCalledOnce();
  });

  it.each([
    ["", account, secret],
    [service, "", secret],
    [service, account, ""],
    ["other\0service", account, secret],
    [service, "other\0account", secret],
    [service, account, "prefix\0suffix"],
  ])(
    "rejects empty or truncatable inputs before native access",
    async (...args) => {
      const h = fake();
      await expect(
        h.keyring.write(...(args as [string, string, string]))
      ).rejects.toMatchObject({
        code: "custody_failed",
      });
      expect(h.load).not.toHaveBeenCalled();
    }
  );
});

// Explicit opt-in only. This accesses one randomly named throwaway entry and
// never enumerates or reads real account credentials. The OS may prompt for
// access/unlock. Cleanup also targets only that newly created entry.
it.skipIf(process.env.GRIDA_AUTH_KEYRING_SMOKE !== "1")(
  "round-trips and removes an owned throwaway OS keyring entry",
  async () => {
    const native = await import("@github/keytar");
    const binding = "default" in native ? native.default : native;
    const keyring = new Keyring();
    const smokeService = `Grida Auth Smoke ${randomUUID()}`;
    const smokeAccount = randomUUID();
    const value = `throwaway-${randomUUID()}`;
    const cleanup = async () => {
      const removed = await binding
        .deletePassword(smokeService, smokeAccount)
        .catch(() => {
          throw new AuthClient.Failure("custody_failed");
        });
      expect(removed).toBe(true);
      expect(await keyring.read(smokeService, smokeAccount)).toBeNull();
    };
    let attemptedWrite = false;
    try {
      expect(await keyring.read(smokeService, smokeAccount)).toBeNull();
      attemptedWrite = true;
      await keyring.write(smokeService, smokeAccount, value);
      expect((await keyring.read(smokeService, smokeAccount)) === value).toBe(
        true
      );
      const tombstone = JSON.stringify({ revision: 1, session: null });
      await keyring.write(smokeService, smokeAccount, tombstone);
      expect(
        (await keyring.read(smokeService, smokeAccount)) === tombstone
      ).toBe(true);
    } finally {
      if (attemptedWrite) {
        await cleanup();
      }
    }
  },
  60_000
);
