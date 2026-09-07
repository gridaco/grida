// GRIDA-SEC-010 — local destination, custody and browser-launch containment.
import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import {
  chmod,
  mkdtemp,
  mkdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPersistentNativeAuth } from "@grida/auth/node";
import { CliHost } from "./host";

vi.mock("node:child_process", () => ({ spawn: vi.fn<typeof spawn>() }));
vi.mock("node:os", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:os")>()),
  homedir: vi.fn<typeof homedir>(),
}));
vi.mock("@grida/auth/node", () => ({
  createPersistentNativeAuth: vi.fn<typeof createPersistentNativeAuth>(),
}));

const config = {
  clientId: "local-public-client",
  issuer: "http://127.0.0.1:55431/auth/v1",
  apiOrigin: "http://127.0.0.1:3041",
  redirectUris: [
    "http://127.0.0.1:55435/callback",
    "http://127.0.0.1:55436/callback",
  ],
};
const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
let root: string;
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  vi.clearAllMocks();
  root = await mkdtemp(path.join(tmpdir(), "grida-cli-host-"));
  const userHome = path.join(root, "user");
  await mkdir(userHome);
  vi.mocked(homedir).mockReturnValue(userHome);
  env = {
    GRIDA_CLI_LOCAL_CONFIG: path.join(root, "public-client.json"),
    GRIDA_HOME: path.join(root, "grida"),
  };
  await writeConfig(config);
  vi.mocked(createPersistentNativeAuth).mockResolvedValue({
    client: {},
    storage: {},
  } as CliHost.Runtime);
});

afterEach(async () => {
  vi.useRealTimers();
  Object.defineProperty(process, "platform", platform);
  await rm(root, { recursive: true, force: true });
});

async function writeConfig(value: unknown) {
  await writeFile(env.GRIDA_CLI_LOCAL_CONFIG!, JSON.stringify(value), {
    mode: 0o600,
  });
}

function browser() {
  const options = vi.mocked(createPersistentNativeAuth).mock.calls.at(-1)?.[1];
  if (!options) throw new Error("native host was not constructed");
  return options.openBrowser;
}

function authorizationUrl() {
  const url = new URL(`${config.issuer}/oauth/authorize`);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: config.redirectUris[0]!,
    scope: "email profile",
    state: "s".repeat(43),
    code_challenge: "c".repeat(43),
    code_challenge_method: "S256",
  }).toString();
  return url;
}

describe("CliHost.open", () => {
  it("requires explicit registration before constructing custody", async () => {
    await expect(CliHost.open({}, {})).rejects.toMatchObject({
      code: "not_configured",
    });
    expect(createPersistentNativeAuth).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it.each([
    () => undefined,
    () => "",
    () => "relative-home",
    () => path.parse(homedir()).root,
    () => homedir(),
    () => path.join(homedir(), ".grida"),
    () => path.join(homedir(), ".grida", "existing-profile"),
  ])("rejects a missing or nonisolated GRIDA_HOME", async (home) => {
    await expect(
      CliHost.open({}, { ...env, GRIDA_HOME: home() })
    ).rejects.toMatchObject({ code: "invalid_config" });
    expect(createPersistentNativeAuth).not.toHaveBeenCalled();
  });

  it("rejects symlink aliases of the ordinary home, including uncreated descendants", async () => {
    const ordinary = path.join(homedir(), ".grida");
    await mkdir(ordinary);
    const alias = path.join(root, "home-alias");
    await symlink(homedir(), alias);
    for (const directory of [
      alias,
      path.join(alias, ".grida"),
      path.join(alias, ".grida", "new"),
    ]) {
      await expect(
        CliHost.open({}, { ...env, GRIDA_HOME: directory })
      ).rejects.toMatchObject({
        code: "invalid_config",
      });
    }
    expect(createPersistentNativeAuth).not.toHaveBeenCalled();
  });

  it("rejects macOS case aliases even before the ordinary home exists", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    await expect(
      CliHost.open(
        {},
        {
          ...env,
          GRIDA_HOME: path.join(homedir(), ".GRIDA", "new"),
        }
      )
    ).rejects.toMatchObject({ code: "invalid_config" });
    expect(createPersistentNativeAuth).not.toHaveBeenCalled();
  });

  it("passes frozen explicit registration, home and file choice to public custody", async () => {
    const runtime = await CliHost.open({ storage: "file" }, env);
    const [actual, options] = vi.mocked(createPersistentNativeAuth).mock
      .calls[0]!;
    expect(actual).toEqual(config);
    expect(Object.isFrozen(actual)).toBe(true);
    expect(Object.isFrozen(actual.redirectUris)).toBe(true);
    expect(options).toEqual({
      home: env.GRIDA_HOME,
      storage: "file",
      openBrowser: expect.any(Function),
    });
    expect(runtime).toBe(
      await vi.mocked(createPersistentNativeAuth).mock.results[0]!.value
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  it("omits backend selection so an established producer choice stays authoritative", async () => {
    await CliHost.open({}, env);
    expect(
      vi.mocked(createPersistentNativeAuth).mock.calls[0]![1]
    ).not.toHaveProperty("storage");
  });

  it("propagates public custody failure without fallback or browser launch", async () => {
    const failure = new Error("synthetic public custody failure");
    vi.mocked(createPersistentNativeAuth).mockRejectedValueOnce(failure);
    await expect(CliHost.open({}, env)).rejects.toBe(failure);
    expect(createPersistentNativeAuth).toHaveBeenCalledTimes(1);
    expect(spawn).not.toHaveBeenCalled();
  });

  it.each([
    { issuer: "https://example.com/auth/v1" },
    { issuer: "http://localhost:55431/auth/v1" },
    { issuer: "http://127.0.0.1:55431/auth/v1/" },
    { issuer: "http://127.0.0.1:55432/auth/v1" },
    { apiOrigin: "http://127.0.0.1:3042" },
    { apiOrigin: "http://127.0.0.1:3041?private=value" },
    { redirectUris: ["http://127.0.0.1:0/callback"] },
    { redirectUris: ["http://127.0.0.1:55435/other"] },
    { redirectUris: [config.redirectUris[0], config.redirectUris[0]] },
    { redirectUris: [] },
    { clientId: "untrusted client id" },
    { clientId: "" },
    { client_secret: "must-never-be-read" },
  ])("rejects untrusted registration before custody: %j", async (change) => {
    await writeConfig({ ...config, ...change });
    await expect(CliHost.open({}, env)).rejects.toMatchObject({
      code: "invalid_config",
      message: "The local CLI configuration is invalid.",
    });
    expect(createPersistentNativeAuth).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it.each([
    null,
    [],
    "private-config-content",
    {},
    { ...config, apiOrigin: null },
  ])(
    "rejects malformed registration shape without printing input",
    async (value) => {
      await writeConfig(value);
      await expect(CliHost.open({}, env)).rejects.toMatchObject({
        message: "The local CLI configuration is invalid.",
      });
      expect(createPersistentNativeAuth).not.toHaveBeenCalled();
    }
  );

  it("rejects relative, absent, linked, shared-writable, directory and oversized files", async () => {
    for (const file of [
      "relative.json",
      path.join(root, "missing.json"),
      root,
    ]) {
      await expect(
        CliHost.open({}, { ...env, GRIDA_CLI_LOCAL_CONFIG: file })
      ).rejects.toMatchObject({ code: "invalid_config" });
    }
    const link = path.join(root, "link.json");
    await symlink(env.GRIDA_CLI_LOCAL_CONFIG!, link);
    await expect(
      CliHost.open({}, { ...env, GRIDA_CLI_LOCAL_CONFIG: link })
    ).rejects.toMatchObject({ code: "invalid_config" });
    await chmod(env.GRIDA_CLI_LOCAL_CONFIG!, 0o666);
    await expect(CliHost.open({}, env)).rejects.toMatchObject({
      code: "invalid_config",
    });
    await chmod(env.GRIDA_CLI_LOCAL_CONFIG!, 0o600);
    await writeFile(env.GRIDA_CLI_LOCAL_CONFIG!, "x".repeat(8193));
    await expect(CliHost.open({}, env)).rejects.toMatchObject({
      code: "invalid_config",
    });
    expect(createPersistentNativeAuth).not.toHaveBeenCalled();
  });

  it("never falls back to a cwd registration or dotenv file", async () => {
    const repo = path.join(root, "repository");
    await mkdir(repo);
    await writeFile(path.join(repo, ".env"), "GRIDA_HOME=must-not-load");
    await writeFile(
      path.join(repo, "public-client.json"),
      JSON.stringify(config)
    );
    await expect(CliHost.open({}, { PWD: repo })).rejects.toMatchObject({
      code: "not_configured",
    });
    expect(createPersistentNativeAuth).not.toHaveBeenCalled();
  });
});

describe("CliHost browser capability", () => {
  it("requires explicit manual mode and output together before custody", async () => {
    await expect(CliHost.open({ noBrowser: true }, env)).rejects.toMatchObject({
      code: "invalid_config",
    });
    await expect(
      CliHost.open({ onAuthorizationUrl: vi.fn<(url: string) => void>() }, env)
    ).rejects.toMatchObject({ code: "invalid_config" });
    expect(createPersistentNativeAuth).not.toHaveBeenCalled();
  });

  it("delivers only the validated URL to explicit manual output, never spawn", async () => {
    const output = vi.fn<(url: string) => void>();
    const options = { noBrowser: true, onAuthorizationUrl: output };
    await CliHost.open(options, env);
    options.onAuthorizationUrl = vi.fn<(url: string) => void>();
    await browser()(authorizationUrl().href);
    expect(output).toHaveBeenCalledExactlyOnceWith(authorizationUrl().href);
    expect(options.onAuthorizationUrl).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it.each([
    (url: URL) => {
      url.hostname = "example.com";
    },
    (url: URL) => {
      url.username = "private";
    },
    (url: URL) => {
      url.pathname = "/other";
    },
    (url: URL) => {
      url.hash = "private-fragment";
    },
  ])(
    "rejects a foreign or fragment-bearing URL before output or spawn",
    async (change) => {
      const output = vi.fn<(url: string) => void>();
      await CliHost.open({ noBrowser: true, onAuthorizationUrl: output }, env);
      const url = authorizationUrl();
      change(url);
      await expect(browser()(url.href)).rejects.toMatchObject({
        code: "browser_failed",
      });
      expect(output).not.toHaveBeenCalled();
      expect(spawn).not.toHaveBeenCalled();
    }
  );

  it.each(["\n", "\r", "\0", "\u001b", " "])(
    "rejects raw terminal controls and noncanonical URL whitespace",
    async (prefix) => {
      const output = vi.fn<(url: string) => void>();
      await CliHost.open({ noBrowser: true, onAuthorizationUrl: output }, env);
      await expect(
        browser()(prefix + authorizationUrl().href)
      ).rejects.toMatchObject({
        code: "browser_failed",
      });
      expect(output).not.toHaveBeenCalled();
    }
  );

  it("leaves OAuth parameter policy with the trusted auth producer", async () => {
    const output = vi.fn<(url: string) => void>();
    await CliHost.open({ noBrowser: true, onAuthorizationUrl: output }, env);
    const url = authorizationUrl();
    url.searchParams.set("scope", "future-scope");
    url.searchParams.set("future_parameter", "producer-owned");
    await browser()(url.href);
    expect(output).toHaveBeenCalledExactlyOnceWith(url.href);
  });

  it("sanitizes manual output failures", async () => {
    await CliHost.open(
      {
        noBrowser: true,
        onAuthorizationUrl: () => {
          throw new Error("private host details");
        },
      },
      env
    );
    await expect(browser()(authorizationUrl().href)).rejects.toMatchObject({
      message: "The authorization browser could not be opened.",
    });
  });

  it.each(["darwin", "linux"])(
    "launches fixed %s argv with no shell or inherited secret hooks",
    async (target) => {
      Object.defineProperty(process, "platform", { value: target });
      const child = Object.assign(new EventEmitter(), {
        kill: vi.fn<(signal?: string) => void>(),
      });
      vi.mocked(spawn).mockReturnValue(
        child as unknown as ReturnType<typeof spawn>
      );
      const unsafeEnv = {
        ...env,
        HOME: root,
        DISPLAY: ":0",
        PATH: "/untrusted/bin",
        BROWSER: "sh -c private-command",
        NODE_OPTIONS: "--require private-preload",
        LD_PRELOAD: "private-loader",
        HTTP_PROXY: "http://private-proxy",
        SUPABASE_ACCESS_TOKEN: "private-token",
      };
      await CliHost.open({}, unsafeEnv);
      unsafeEnv.DISPLAY = ":changed";
      const opening = browser()(authorizationUrl().href);
      expect(spawn).toHaveBeenCalledExactlyOnceWith(
        target === "darwin" ? "/usr/bin/open" : "/usr/bin/xdg-open",
        target === "darwin"
          ? ["--", authorizationUrl().href]
          : [authorizationUrl().href],
        {
          shell: false,
          stdio: "ignore",
          env: { PATH: "/usr/bin:/bin", HOME: root, DISPLAY: ":0" },
        }
      );
      child.emit("exit", 0);
      await opening;
    }
  );

  it.each(["throw", "error", "exit"])(
    "sanitizes launcher %s failures",
    async (mode) => {
      Object.defineProperty(process, "platform", { value: "darwin" });
      const child = Object.assign(new EventEmitter(), {
        kill: vi.fn<(signal?: string) => void>(),
      });
      vi.mocked(spawn).mockImplementation(() => {
        if (mode === "throw") throw new Error("private spawn details");
        return child as unknown as ReturnType<typeof spawn>;
      });
      await CliHost.open({}, env);
      const opening = browser()(authorizationUrl().href);
      const result = (async () => {
        await expect(opening).rejects.toMatchObject({
          code: "browser_failed",
          message: "The authorization browser could not be opened.",
        });
      })();
      if (mode === "error") child.emit("error", new Error("private exec path"));
      if (mode === "exit") child.emit("exit", 1);
      await result;
    }
  );

  it("bounds an unresponsive launcher", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    const child = Object.assign(new EventEmitter(), {
      kill: vi.fn<(signal?: string) => void>(),
    });
    vi.mocked(spawn).mockReturnValue(
      child as unknown as ReturnType<typeof spawn>
    );
    await CliHost.open({}, env);
    vi.useFakeTimers();
    const result = (async () => {
      await expect(browser()(authorizationUrl().href)).rejects.toMatchObject({
        code: "browser_failed",
      });
    })();
    await vi.advanceTimersByTimeAsync(10_000);
    await result;
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it("fails closed on an unsupported browser platform", async () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    await CliHost.open({}, env);
    await expect(browser()(authorizationUrl().href)).rejects.toMatchObject({
      code: "browser_failed",
    });
    expect(spawn).not.toHaveBeenCalled();
  });
});
