// GRIDA-SEC-014 / GRIDA-SEC-013 — real owner, private synthetic homes, no network.
import { ProviderCredentialStore } from "@grida/auth/providers";
import {
  chmod,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cli } from "./cli";
import { ProviderCommands } from "./commands/providers";
import { Output } from "./output";
import { ProviderCredentials } from "./provider-credentials";
import { ProviderStore } from "./provider-store";

const KEY = "synthetic:private-stored-key";
const roots: string[] = [];
async function fixture() {
  const root = await realpath(
    await mkdtemp(path.join(tmpdir(), "grida-byok-cli-"))
  );
  roots.push(root);
  const store = new ProviderCredentialStore({ home: root });
  const env: NodeJS.ProcessEnv = { GRIDA_HOME: root };
  Object.defineProperty(env, "GRIDA_CLI_LOCAL_CONFIG", {
    get() {
      throw new Error("Account config must not be read");
    },
  });
  const stdout: string[] = [],
    stderr: string[] = [];
  const output = new Output(
    true,
    (text) => stdout.push(text),
    (text) => stderr.push(text)
  );
  const request = vi.fn<typeof fetch>(async () =>
    Response.json({
      prices: [
        {
          endpoint_id: "fal-ai/flux/dev",
          unit_price: 0.025,
          unit: "image",
          currency: "USD",
        },
      ],
    })
  );
  const host: ProviderCommands.Host = {
    env,
    transport: () => ({
      request,
      download: async () => {
        throw new Error("No download allowed");
      },
    }),
    stdin: Readable.from([Buffer.from(KEY)]),
    openStore: vi.fn<typeof ProviderStore.open>(ProviderStore.open),
    prompt: vi.fn<ProviderCommands.Host["prompt"]>(async () =>
      Buffer.from(KEY)
    ),
  };
  return {
    root,
    request,
    store,
    env,
    stdout,
    stderr,
    host,
    result: () => JSON.parse(stdout.at(-1)!),
    invoke(args: string[]) {
      const invocation = Cli.parse(args);
      if (
        invocation.command !== "providers configure" &&
        invocation.command !== "providers remove"
      )
        throw new Error("Wrong fixture command");
      return ProviderCommands.run(invocation, output, host);
    },
    safe() {
      expect(stdout.join("") + stderr.join("")).not.toContain(KEY);
      expect(fetch).not.toHaveBeenCalled();
    },
  };
}

beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("No network allowed");
    })
  )
);
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("shared CLI provider credentials", () => {
  it("preserves invalid native-home configuration as input failure", async () => {
    await expect(ProviderStore.open({ GRIDA_HOME: "/" })).rejects.toMatchObject(
      {
        code: "invalid_input",
      }
    );
  });
  it("checks the entered key once before opening custody, ignoring stored and environment keys", async () => {
    const f = await fixture();
    await f.store.set("fal", "previous:stored-key");
    f.host.env.FAL_KEY = "environment:ignored-key";
    const respond = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (input, init) => {
      expect(f.host.openStore).not.toHaveBeenCalled();
      expect(new Headers(init?.headers).get("authorization")).toBe(
        `Key ${KEY}`
      );
      return respond(input, init);
    });
    expect(
      await f.invoke(["providers", "configure", "fal", "--key-stdin", "--json"])
    ).toBe(0);
    expect(f.request).toHaveBeenCalledOnce();
    expect(f.result().verification).toEqual({ status: "accepted" });
    expect(await f.store.read("fal")).toBe(KEY);
    f.safe();
  });

  it("saves opaque ElevenLabs keys with an explicit unsupported check and no network", async () => {
    const f = await fixture();
    expect(
      await f.invoke([
        "providers",
        "configure",
        "elevenlabs",
        "--key-stdin",
        "--json",
      ])
    ).toBe(0);
    expect(f.request).not.toHaveBeenCalled();
    expect(f.result().verification).toEqual({ status: "not_supported" });
    expect(await f.store.read("elevenlabs")).toBe(KEY);
    f.safe();
  });

  it.each([
    [401, "credential_rejected"],
    [403, "access_denied"],
    [429, "unavailable"],
    [500, "unavailable"],
    [302, "invalid_response"],
    [200, "invalid_response"],
  ] as const)(
    "failed probe %i preserves the old file and exposes only a safe code",
    async (status, code) => {
      const f = await fixture();
      await f.store.set("fal", "previous:stored-key");
      const file = path.join(f.root, "providers", "credentials.toml");
      const before = await readFile(file);
      f.request.mockResolvedValueOnce(new Response(KEY, { status }));
      expect(
        await f.invoke([
          "providers",
          "configure",
          "fal",
          "--key-stdin",
          "--json",
        ])
      ).toBe(1);
      expect(f.result().error.code).toBe(code);
      expect(f.request).toHaveBeenCalledOnce();
      expect(f.host.openStore).not.toHaveBeenCalled();
      expect(await readFile(file)).toEqual(before);
      f.safe();
    }
  );

  it.each(["file", "environment", "stdin"] as const)(
    "rejects a %s placeholder before any provider request",
    async (source) => {
      const f = await fixture();
      const placeholder = "PASTE_FAL_KEY_HERE";
      if (source === "file") await f.store.set("fal", placeholder);
      const open = vi.fn<() => ProviderCredentialStore>(() => f.store);
      await expect(
        ProviderCredentials.open({
          provider: "fal",
          env: source === "environment" ? { FAL_KEY: placeholder } : {},
          store: open,
          ...(source === "stdin"
            ? {
                stdin: {
                  provider: "fal" as const,
                  input: Readable.from([Buffer.from(placeholder)]),
                },
              }
            : {}),
        })
      ).rejects.toMatchObject({ code: "invalid_credentials" });
      expect(open).toHaveBeenCalledTimes(source === "file" ? 1 : 0);
      expect(f.request).not.toHaveBeenCalled();
      f.safe();
    }
  );

  it("rejects an invalid configure key before custody and network", async () => {
    const f = await fixture();
    f.host.stdin = Readable.from([Buffer.from("PASTE_FAL_KEY_HERE")]);
    expect(
      await f.invoke(["providers", "configure", "fal", "--key-stdin", "--json"])
    ).toBe(1);
    expect(f.result().error.code).toBe("invalid_credentials");
    expect(f.host.openStore).not.toHaveBeenCalled();
    expect(f.request).not.toHaveBeenCalled();
    f.safe();
  });

  it("cancels after an accepted check without opening custody", async () => {
    const f = await fixture();
    const prior = new Set(process.listeners("SIGINT"));
    const respond = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (input, init) => {
      const result = await respond(input, init);
      process.listeners("SIGINT").find((handler) => !prior.has(handler))!(
        "SIGINT"
      );
      return result;
    });
    expect(
      await f.invoke(["providers", "configure", "fal", "--key-stdin", "--json"])
    ).toBe(1);
    expect(f.result().error.code).toBe("aborted");
    expect(f.host.openStore).not.toHaveBeenCalled();
    f.safe();
  });

  it("settles a durable write already started when a signal arrives", async () => {
    const f = await fixture();
    const prior = new Set(process.listeners("SIGINT"));
    const set = f.store.set.bind(f.store);
    f.host.openStore = vi.fn<ProviderCommands.Host["openStore"]>(
      async () => f.store
    );
    const mutate = vi
      .spyOn(f.store, "set")
      .mockImplementation(async (provider, key) => {
        process.listeners("SIGINT").find((handler) => !prior.has(handler))!(
          "SIGINT"
        );
        await set(provider, key);
      });
    expect(
      await f.invoke(["providers", "configure", "fal", "--key-stdin", "--json"])
    ).toBe(0);
    expect(mutate).toHaveBeenCalledOnce();
    expect(await f.store.read("fal")).toBe(KEY);
    f.safe();
  });

  it("configures without account setup and survives a new reader; removal is shared", async () => {
    const f = await fixture();
    expect(
      await f.invoke(["providers", "configure", "fal", "--key-stdin", "--json"])
    ).toBe(0);
    expect(f.result()).toMatchObject({
      provider: "fal",
      stored: true,
      storage: "plaintext_file",
      shared: true,
    });
    const reader = await ProviderCredentials.open({
      env: f.env,
      provider: "fal",
      store: () => ProviderStore.open(f.env),
    });
    expect(reader.get("fal")).toBe(KEY);
    expect(reader.status().find((row) => row.provider === "fal")).toMatchObject(
      { source: "file", configured: true }
    );
    reader.dispose();
    expect(reader.get("fal")).toBeNull();
    expect(await f.invoke(["providers", "remove", "fal", "--json"])).toBe(0);
    expect(await f.store.read("fal")).toBeNull();
    expect(f.result()).toMatchObject({
      stored: false,
      environment_checked: false,
    });
    f.safe();
  });

  it("supports hidden input without persisting any ambient provider key", async () => {
    const f = await fixture();
    f.env.FAL_KEY = "unused-environment-key";
    expect(await f.invoke(["providers", "configure", "fal"])).toBe(0);
    expect(f.host.prompt).toHaveBeenCalledOnce();
    expect(await f.store.read("fal")).toBe(KEY);
    f.safe();
  });

  it("validates empty input before opening persistent storage", async () => {
    const f = await fixture();
    f.host.stdin = Readable.from([]);
    expect(
      await f.invoke(["providers", "configure", "fal", "--key-stdin", "--json"])
    ).toBe(1);
    expect(f.host.openStore).not.toHaveBeenCalled();
    expect(f.result().error.code).toBe("invalid_credentials");
    f.safe();
  });

  it("removes stored keys without consulting environment credentials", async () => {
    const f = await fixture();
    await f.store.set("fal", KEY);
    Object.defineProperty(f.env, "FAL_KEY", {
      get() {
        throw new Error(KEY);
      },
    });
    expect(await f.invoke(["providers", "remove", "fal", "--json"])).toBe(0);
    expect(await f.store.read("fal")).toBeNull();
    f.safe();
  });

  it.each(["environment", "stdin"])(
    "%s bypasses store opening and does not persist",
    async (source) => {
      const f = await fixture();
      const open = vi.fn<() => ProviderCredentialStore>(() => {
        throw new Error(KEY);
      });
      const owner = await ProviderCredentials.open({
        env:
          source === "environment"
            ? { FAL_KEY: KEY }
            : { FAL_KEY: "invalid unused key" },
        provider: "fal",
        store: open,
        ...(source === "stdin"
          ? {
              stdin: {
                provider: "fal" as const,
                input: Readable.from([Buffer.from(KEY)]),
              },
            }
          : {}),
      });
      expect(owner.get("fal")).toBe(KEY);
      expect(open).not.toHaveBeenCalled();
      expect(await f.store.read("fal")).toBeNull();
      owner.dispose();
      f.safe();
    }
  );

  it("does not fall back from malformed explicit input to a valid stored key", async () => {
    const f = await fixture();
    await f.store.set("fal", KEY);
    const open = vi.fn<() => ProviderCredentialStore>(() => f.store);
    await expect(
      ProviderCredentials.open({
        env: { FAL_KEY: " " },
        provider: "fal",
        store: open,
      })
    ).rejects.toMatchObject({ code: "invalid_credentials" });
    expect(open).not.toHaveBeenCalled();
    f.safe();
  });

  it("reports corrupt selected custody safely and leaves its bytes untouched", async () => {
    const f = await fixture();
    await f.store.set("fal", KEY);
    const file = path.join(f.root, "providers", "credentials.toml");
    await writeFile(file, `invalid synthetic-private-key = [`, { mode: 0o600 });
    expect(await f.invoke(["providers", "remove", "fal", "--json"])).toBe(1);
    expect(f.result().error.code).toBe("invalid_store");
    expect(f.result().error.message).toContain(
      "TOML syntax and required fields"
    );
    expect(await readFile(file, "utf8")).toBe(
      "invalid synthetic-private-key = ["
    );
    await expect(
      ProviderCredentials.open({
        env: f.env,
        provider: "fal",
        store: () => f.store,
      })
    ).rejects.toMatchObject({ code: "invalid_store" });
    f.safe();
  });

  it("reports inaccessible private custody without suggesting malformed TOML or changing it", async () => {
    const f = await fixture();
    await f.store.set("fal", KEY);
    const file = path.join(f.root, "providers", "credentials.toml");
    const before = await readFile(file);
    await chmod(file, 0o644);
    expect(await f.invoke(["providers", "remove", "fal", "--json"])).toBe(1);
    expect(f.result().error.code).toBe("storage_failed");
    expect(f.result().error.message).toMatch(
      /access or lock.*filesystem or sandbox access/
    );
    expect(f.result().error.message).not.toMatch(/TOML syntax|format version/);
    expect(await readFile(file)).toEqual(before);
    expect(f.result().error.message).not.toContain(f.root);
    f.safe();
  });

  it.each([
    ["store_busy", /busy in another process/],
    ["unsupported_version", /unsupported format version.*Update Grida/],
    ["storage_failed", /filesystem or sandbox access/],
  ] as const)(
    "preserves safe %s guidance from the credential owner",
    async (code, guidance) => {
      const f = await fixture();
      f.host.openStore = async () => {
        throw new ProviderCredentialStore.Failure(code);
      };
      expect(await f.invoke(["providers", "remove", "fal", "--json"])).toBe(1);
      expect(f.result().error).toMatchObject({
        code,
        message: expect.stringMatching(guidance),
      });
      f.safe();
    }
  );

  it("sanitizes arbitrary host failures and does not leak input contents", async () => {
    const f = await fixture();
    f.host.openStore = async () => {
      throw new Error(KEY);
    };
    expect(
      await f.invoke(["providers", "configure", "fal", "--key-stdin", "--json"])
    ).toBe(1);
    expect(f.result().error.code).toBe("credentials_unavailable");
    f.safe();
  });
});
