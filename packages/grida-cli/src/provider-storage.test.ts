// GRIDA-SEC-014 / GRIDA-SEC-013 — real owner, private synthetic homes, no network.
import { ProviderCredentialStore } from "@grida/auth/providers";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cli } from "./cli";
import { ProviderCommands } from "./commands/providers";
import { Output } from "./output";
import { ProviderCredentials } from "./provider-credentials";
import { ProviderStore } from "./provider-store";

const KEY = "synthetic-private-stored-key";
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
  const host: ProviderCommands.Host = {
    env,
    stdin: Readable.from([Buffer.from(KEY)]),
    openStore: vi.fn<typeof ProviderStore.open>(ProviderStore.open),
    prompt: vi.fn<ProviderCommands.Host["prompt"]>(async () =>
      Buffer.from(KEY)
    ),
  };
  return {
    root,
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
      expect(stdout.join("") + stderr.join("")).not.toContain(
        "synthetic-private"
      );
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
