// GRIDA-SEC-013 — CLI preflight, explicit BYOK, safe media publication.
// GRIDA-SEC-006 — only the public native scoped sink supplies GG to the real media SDK.
// GRIDA-GG: token — synthetic tokens only; no services, auth custody or provider calls.
import { MediaOperations } from "@grida/ai";
import { AuthClient } from "@grida/auth";
import { ProviderCredentialStore } from "@grida/auth/providers";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cli } from "./cli";
import type { CliHost } from "./host";
import { MediaFiles } from "./media-files";
import { MediaCommands } from "./media-run";
import { Output } from "./output";

const KEY = "synthetic-private-provider-key";
const TOKEN = "synthetic-private-scoped-token";
const ACCOUNT = "synthetic-private-account-token";
const PROMPT = "synthetic-private-prompt";
const PNG = Buffer.from("iVBORw0KGgo=", "base64");
const MP3 = Uint8Array.of(0x49, 0x44, 0x33);
const organization = { id: 7, name: "studio", display_name: "Studio" };
const discovery = new MediaOperations();
const image = discovery
  .list({ kind: "image", provider: "openrouter" })
  .find((entry) => entry.variant === "text")!;
const hostedImage = discovery.list({ kind: "image", provider: "gg" })[0]!;
const roots: string[] = [];

async function temporary() {
  const root = await realpath(
    await mkdtemp(path.join(tmpdir(), "grida-media-command-"))
  );
  roots.push(root);
  return root;
}

function fixture(env: NodeJS.ProcessEnv = {}) {
  const stdout: string[] = [],
    stderr: string[] = [];
  const request = vi.fn<typeof fetch>(async () => {
    throw new Error(KEY);
  });
  const download = vi.fn<typeof fetch>(async () => {
    throw new Error(KEY);
  });
  const openAuth = vi.fn<MediaCommands.Host["openAuth"]>(async () => {
    throw new Error(ACCOUNT);
  });
  const transport = vi.fn<MediaCommands.Host["transport"]>(() => ({
    request,
    download,
  }));
  const output = new Output(
    true,
    (text) => stdout.push(text),
    (text) => stderr.push(text)
  );
  let storeHome: Promise<string> | undefined;
  const openStore = vi.fn<MediaCommands.Host["openStore"]>(
    async () =>
      new ProviderCredentialStore({ home: await (storeHome ??= temporary()) })
  );
  const host: MediaCommands.Host = {
    env,
    stdin: Readable.from([]),
    openAuth,
    openStore,
    transport,
  };
  return {
    host,
    output,
    stdout,
    stderr,
    request,
    download,
    openAuth,
    openStore,
    transport,
    async invoke(args: string[], input?: unknown) {
      if (input !== undefined)
        host.stdin = Readable.from([Buffer.from(JSON.stringify(input))]);
      const invocation = Cli.parse([...args, "--json"]);
      if (
        ![
          "models list",
          "models inspect",
          "providers list",
          "voices list",
          "generate",
        ].includes(invocation.command)
      )
        throw new Error("Fixture requires a media invocation");
      return MediaCommands.run(invocation as Cli.MediaInvocation, output, host);
    },
    result: () => JSON.parse(stdout.at(-1)!),
    assertSafe() {
      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(stdout.join("") + stderr.join("")).not.toMatch(
        /synthetic-private-|upstream-private|responseBody|access_token|refresh_token/
      );
      expect(stderr).toEqual([]);
    },
  };
}

function forbiddenEnv() {
  const read = vi.fn<() => never>(() => {
    throw new Error(KEY);
  });
  return {
    read,
    env: new Proxy({}, { get: read, getOwnPropertyDescriptor: read }),
  };
}

function generateArgs(
  out: string,
  provider = "elevenlabs",
  model = "eleven_text_to_sound_v2"
) {
  return [
    "generate",
    "--provider",
    provider,
    "--model",
    model,
    "--input",
    "-",
    "--out",
    out,
  ];
}

function attachAccount(
  target: ReturnType<typeof fixture>,
  options: { allowed?: boolean; grant?: boolean } = {}
) {
  let sink: AuthClient.GgSink | undefined;
  const expires_at = new Date(Date.now() + 900_000).toISOString();
  const requestAccount = vi.fn<
    (operation: string, input?: unknown) => Promise<unknown>
  >(async (operation) => {
    if (operation === "organizations.list")
      return { organizations: [organization], next_cursor: null };
    if (operation === "credits.read")
      return {
        organization,
        account_present: true,
        state: "cached",
        source: "cache",
        currency: "USD",
        balance_cents: options.allowed ? 100 : 0,
        cache_updated_at: "2026-09-01T00:00:00Z",
        billing_gate: {
          allowed: options.allowed ?? false,
          reason: options.allowed ? "eligible" : "no_balance",
        },
      };
    throw new Error(ACCOUNT);
  });
  const requestGgAccess = vi.fn<AuthClient["requestGgAccess"]>(async () => {
    if (options.grant !== false)
      sink!.accept(Object.freeze({ token: TOKEN, expires_at, organization }));
    return { organization, expires_at };
  });
  // Mock only public account authority. AccountClient and every media client are real.
  const client = {
    requestAccount,
    requestGgAccess,
    config: { apiOrigin: "https://grida.example" },
  };
  Object.defineProperty(client, "accessToken", {
    get() {
      throw new Error(ACCOUNT);
    },
  });
  target.openAuth.mockImplementation(async (options) => {
    sink = options?.gg;
    return { client } as unknown as CliHost.Runtime;
  });
  return { requestAccount, requestGgAccess };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function interrupt(before: readonly Function[]) {
  const owned = process
    .listeners("SIGINT")
    .find((listener) => !before.includes(listener));
  if (!owned) throw new Error("Missing command-owned signal listener");
  owned("SIGINT");
}

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    throw new Error("Unexpected ambient network");
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("MediaCommands offline discovery and access observations", () => {
  it.each([
    { args: ["models", "list"] },
    {
      args: [
        "models",
        "inspect",
        "--provider",
        "gg",
        "--model",
        hostedImage.model_id,
      ],
    },
  ])(
    "keeps $args independent of credentials, account custody and transports",
    async ({ args }) => {
      const { env, read } = forbiddenEnv();
      const test = fixture(env);
      const before = process.listeners("SIGINT");
      expect(await test.invoke(args)).toBe(0);
      expect(read).not.toHaveBeenCalled();
      expect(test.openAuth).not.toHaveBeenCalled();
      expect(test.transport).not.toHaveBeenCalled();
      expect(process.listeners("SIGINT")).toEqual(before);
      test.assertSafe();
    }
  );

  it.each([false, true])(
    "reports BYOK presence=%s without claiming upstream access",
    async (configured) => {
      const test = fixture(configured ? { ELEVENLABS_API_KEY: KEY } : {});
      expect(
        await test.invoke([
          "models",
          "list",
          "--provider",
          "elevenlabs",
          "--available",
        ])
      ).toBe(0);
      const result = test.result();
      expect(result.access).toMatchObject({
        checked: true,
        basis: "key_presence",
        configured,
        provider_access: "unverified",
      });
      expect(result.operations.length > 0).toBe(configured);
      expect(test.openAuth).not.toHaveBeenCalled();
      expect(test.transport).not.toHaveBeenCalled();
      test.assertSafe();
    }
  );

  it.each([false, true])(
    "filters GG by cached credits=%s without minting or probing a model",
    async (allowed) => {
      const { env, read } = forbiddenEnv();
      const test = fixture(env);
      const account = attachAccount(test, { allowed });
      expect(
        await test.invoke([
          "models",
          "list",
          "--provider",
          "gg",
          "--available",
          "--org-id",
          "7",
        ])
      ).toBe(0);
      const result = test.result();
      expect(result.access).toMatchObject({
        checked: true,
        basis: "cached_credits",
        eligible: allowed,
        provider_access: "unverified",
        credits: { source: "cache", cache_updated_at: "2026-09-01T00:00:00Z" },
      });
      expect(result.operations.length > 0).toBe(allowed);
      expect(account.requestAccount.mock.calls).toEqual([
        ["organizations.list", undefined],
        ["credits.read", { organization_id: 7 }],
      ]);
      expect(account.requestGgAccess).not.toHaveBeenCalled();
      expect(test.transport).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
      test.assertSafe();
    }
  );
});

describe("MediaCommands preflight and BYOK", () => {
  it.each([
    "invalid-json",
    "invalid-schema",
    "unsupported-route",
    "existing-output",
  ])(
    "refuses %s before reading any authority or constructing transport",
    async (mode) => {
      const root = await temporary();
      const out = path.join(root, "result");
      const { env, read } = forbiddenEnv();
      const test = fixture(env);
      let input: unknown = { prompt: PROMPT };
      const args = generateArgs(
        out,
        "gg",
        mode === "unsupported-route" ? "not-a-model" : hostedImage.model_id
      );
      if (mode === "invalid-json") {
        test.host.stdin = Readable.from([Buffer.from('{"prompt":')]);
        input = undefined;
      }
      if (mode === "invalid-schema") input = { prompt: PROMPT, n: 17 };
      if (mode === "existing-output") await mkdir(out);
      expect(await test.invoke(args, input)).toBe(1);
      expect(test.result().error.code).toBe(
        mode === "unsupported-route"
          ? "operation_unavailable"
          : mode === "existing-output"
            ? "output_unavailable"
            : "invalid_input"
      );
      expect(read).not.toHaveBeenCalled();
      expect(test.openAuth).not.toHaveBeenCalled();
      expect(test.transport).not.toHaveBeenCalled();
      expect(await readdir(root)).toEqual(
        mode === "existing-output" ? ["result"] : []
      );
      test.assertSafe();
    }
  );

  it("keeps a missing selected BYOK key separate from Grida login and cleans its reservation", async () => {
    const root = await temporary();
    const test = fixture({ OPENROUTER_API_KEY: KEY });
    expect(
      await test.invoke(generateArgs(path.join(root, "result")), {
        prompt: PROMPT,
      })
    ).toBe(1);
    expect(test.result().error.code).toBe("provider_key_required");
    expect(test.openAuth).not.toHaveBeenCalled();
    expect(test.request).not.toHaveBeenCalled();
    expect(await readdir(root)).toEqual([]);
    test.assertSafe();
  });

  it("uses only the selected key and persists actual SDK SFX bytes without provider metadata", async () => {
    const out = path.join(await temporary(), "result");
    const env = { ELEVENLABS_API_KEY: KEY };
    const unrelated = vi.fn<() => never>(() => {
      throw new Error(ACCOUNT);
    });
    Object.defineProperty(env, "OPENROUTER_API_KEY", { get: unrelated });
    const test = fixture(env);
    test.request.mockResolvedValueOnce(
      new Response(MP3, {
        headers: { "content-type": "audio/mpeg", "x-provider-private": KEY },
      })
    );
    expect(
      await test.invoke(generateArgs(out), {
        prompt: ` ${PROMPT} `,
        loop: false,
        prompt_influence: 0,
      })
    ).toBe(0);
    expect(unrelated).not.toHaveBeenCalled();
    expect(test.openAuth).not.toHaveBeenCalled();
    expect(test.request).toHaveBeenCalledOnce();
    const [url, options] = test.request.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128"
    );
    expect(new Headers(options?.headers).get("xi-api-key")).toBe(KEY);
    expect(JSON.parse(String(options?.body))).toMatchObject({
      text: PROMPT,
      loop: false,
      prompt_influence: 0,
    });
    const receipt = test.result();
    expect(await readFile(receipt.artifacts[0].path)).toEqual(Buffer.from(MP3));
    expect(
      JSON.parse(await readFile(path.join(out, "receipt.json"), "utf8"))
    ).toEqual(receipt);
    expect(await readdir(out)).toEqual(["output-1.mp3", "receipt.json"]);
    test.assertSafe();
  });

  it("adapts JSON voice selection through the SDK while preserving speech text", async () => {
    const out = path.join(await temporary(), "speech");
    const test = fixture({ ELEVENLABS_API_KEY: KEY });
    test.request.mockResolvedValueOnce(
      new Response(MP3, { headers: { "content-type": "audio/mpeg" } })
    );
    const text = `  [whispers] ${PROMPT}\n `;
    expect(
      await test.invoke(generateArgs(out, "elevenlabs", "eleven_v3"), {
        voice_id: " voice/id ",
        text,
      })
    ).toBe(0);
    expect(test.request).toHaveBeenCalledOnce();
    expect(String(test.request.mock.calls[0]![0])).toContain("/voice%2Fid?");
    expect(JSON.parse(String(test.request.mock.calls[0]![1]?.body))).toEqual({
      model_id: "eleven_v3",
      text,
    });
    expect(test.openAuth).not.toHaveBeenCalled();
    test.assertSafe();
  });

  it("allocates stdin solely to the explicit provider key when JSON comes from a file", async () => {
    const root = await temporary();
    const input = path.join(root, "input.json");
    await writeFile(input, JSON.stringify({ prompt: PROMPT }));
    const env = {};
    const stale = vi.fn<() => never>(() => {
      throw new Error(ACCOUNT);
    });
    Object.defineProperty(env, "ELEVENLABS_API_KEY", { get: stale });
    const test = fixture(env);
    test.host.stdin = Readable.from([Buffer.from(KEY + "\n")]);
    test.request.mockResolvedValueOnce(
      new Response(MP3, { headers: { "content-type": "audio/mpeg" } })
    );
    expect(
      await test.invoke([
        "generate",
        "--provider",
        "elevenlabs",
        "--model",
        "eleven_text_to_sound_v2",
        "--input",
        "@" + input,
        "--out",
        path.join(root, "result"),
        "--key-stdin",
      ])
    ).toBe(0);
    expect(stale).not.toHaveBeenCalled();
    expect(
      new Headers(test.request.mock.calls[0]![1]?.headers).get("xi-api-key")
    ).toBe(KEY);
    expect(test.openAuth).not.toHaveBeenCalled();
    test.assertSafe();
  });

  it("lists voices with the same explicit key and returns only the public voice fields", async () => {
    const test = fixture({ ELEVENLABS_API_KEY: KEY });
    test.request.mockResolvedValueOnce(
      Response.json({
        voices: [{ voice_id: "voice", name: "Voice", preview_url: KEY }],
        has_more: false,
      })
    );
    expect(
      await test.invoke(["voices", "list", "--provider", "elevenlabs"])
    ).toBe(0);
    expect(test.result()).toEqual({
      provider: "elevenlabs",
      voices: [{ voice_id: "voice", name: "Voice" }],
    });
    expect(test.openAuth).not.toHaveBeenCalled();
    expect(test.request).toHaveBeenCalledOnce();
    test.assertSafe();
  });
});

describe("MediaCommands scoped GG handoff", () => {
  it("contains a native auth refusal before mint or media transport and removes the empty reservation", async () => {
    const root = await temporary();
    const test = fixture();
    const failure = new AuthClient.Failure("signed_out");
    failure.message = ACCOUNT;
    failure.cause = { refresh_token: ACCOUNT };
    test.openAuth.mockRejectedValueOnce(failure);
    expect(
      await test.invoke(
        generateArgs(path.join(root, "hosted"), "gg", hostedImage.model_id),
        { prompt: PROMPT }
      )
    ).toBe(1);
    expect(test.result().error).toMatchObject({
      code: "signed_out",
      message: "GG needs a Grida session. Run grida auth login.",
    });
    expect(test.transport).not.toHaveBeenCalled();
    expect(await readdir(root)).toEqual([]);
    test.assertSafe();
  });

  it("selects membership then hands a scoped grant to actual SDK transport, never account or BYOK authority", async () => {
    const out = path.join(await temporary(), "hosted");
    const { env, read } = forbiddenEnv();
    const test = fixture(env);
    const account = attachAccount(test);
    test.request.mockResolvedValueOnce(
      Response.json({
        images: [
          { base64: PNG.toString("base64"), stored_media: { token: TOKEN } },
        ],
      })
    );
    expect(
      await test.invoke(
        [...generateArgs(out, "gg", hostedImage.model_id), "--org-id", "7"],
        { prompt: PROMPT }
      )
    ).toBe(0);
    expect(account.requestAccount.mock.calls).toEqual([
      ["organizations.list", undefined],
    ]);
    expect(account.requestGgAccess).toHaveBeenCalledExactlyOnceWith({
      organization_id: 7,
    });
    expect(account.requestAccount.mock.invocationCallOrder[0]).toBeLessThan(
      account.requestGgAccess.mock.invocationCallOrder[0]!
    );
    expect(test.transport).toHaveBeenCalledExactlyOnceWith(
      "https://grida.example"
    );
    expect(test.request).toHaveBeenCalledOnce();
    const [url, options] = test.request.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://grida.example/api/v1/ai/images/generations"
    );
    expect(new Headers(options?.headers).get("authorization")).toBe(
      "Bearer " + TOKEN
    );
    expect(JSON.stringify(options)).not.toContain(ACCOUNT);
    expect(read).not.toHaveBeenCalled();
    expect(test.download).not.toHaveBeenCalled();
    expect(await readFile(test.result().artifacts[0].path)).toEqual(PNG);
    test.assertSafe();
  });

  it("does not treat a safe mint status as a token grant or reuse the previous invocation's grant", async () => {
    const root = await temporary();
    const test = fixture();
    attachAccount(test);
    test.request.mockResolvedValueOnce(
      Response.json({ images: [{ base64: PNG.toString("base64") }] })
    );
    expect(
      await test.invoke(
        generateArgs(path.join(root, "first"), "gg", hostedImage.model_id),
        { prompt: PROMPT }
      )
    ).toBe(0);
    attachAccount(test, { grant: false });
    expect(
      await test.invoke(
        generateArgs(path.join(root, "hosted"), "gg", hostedImage.model_id),
        { prompt: PROMPT }
      )
    ).toBe(1);
    expect(test.result().error.code).toBe("gg_token_expired");
    expect(test.request).toHaveBeenCalledOnce();
    expect(await readdir(root)).toEqual(["first"]);
    test.assertSafe();
  });
});

describe("MediaCommands failure and signal lifetime", () => {
  it("does not retry or expose a provider failure body", async () => {
    const root = await temporary();
    const test = fixture({ ELEVENLABS_API_KEY: KEY });
    test.request.mockResolvedValueOnce(
      new Response(`upstream-private ${KEY}`, { status: 503 })
    );
    expect(
      await test.invoke(generateArgs(path.join(root, "result")), {
        prompt: PROMPT,
      })
    ).toBe(1);
    expect(test.result().error.code).toBe("generation_failed");
    expect(test.request).toHaveBeenCalledOnce();
    expect(await readdir(root)).toEqual([]);
    test.assertSafe();
  });

  it("cancels an in-flight SDK request, removes its listeners and abandons only the empty reservation", async () => {
    const root = await temporary();
    const test = fixture({ ELEVENLABS_API_KEY: KEY });
    const started = deferred<void>();
    test.request.mockImplementation(
      async (_url, options) =>
        new Promise<Response>((_resolve, reject) => {
          options!.signal!.addEventListener(
            "abort",
            () => reject(new DOMException(KEY, "AbortError")),
            { once: true }
          );
          started.resolve();
        })
    );
    const before = process.listeners("SIGINT");
    const task = test.invoke(generateArgs(path.join(root, "result")), {
      prompt: PROMPT,
    });
    await started.promise;
    interrupt(before);
    expect(await task).toBe(1);
    expect(test.result().error.code).toBe("aborted");
    expect(test.request).toHaveBeenCalledOnce();
    expect(process.listeners("SIGINT")).toEqual(before);
    expect(await readdir(root)).toEqual([]);
    test.assertSafe();
  });

  it("finishes saving already-returned paid bytes when interrupted at the publication boundary", async () => {
    const out = path.join(await temporary(), "result");
    const test = fixture({ ELEVENLABS_API_KEY: KEY });
    test.request.mockResolvedValueOnce(
      new Response(MP3, { headers: { "content-type": "audio/mpeg" } })
    );
    const before = process.listeners("SIGINT");
    const save = MediaFiles.Directory.prototype.save;
    vi.spyOn(MediaFiles.Directory.prototype, "save").mockImplementation(
      function (this: MediaFiles.Directory, metadata, artifacts) {
        interrupt(before);
        return save.call(this, metadata, artifacts);
      }
    );
    expect(await test.invoke(generateArgs(out), { prompt: PROMPT })).toBe(0);
    expect(await readFile(test.result().artifacts[0].path)).toEqual(
      Buffer.from(MP3)
    );
    expect(await readdir(out)).toEqual(["output-1.mp3", "receipt.json"]);
    expect(test.request).toHaveBeenCalledOnce();
    expect(process.listeners("SIGINT")).toEqual(before);
    test.assertSafe();
  });

  it("retains a partial result and safe saved paths after an output collision without retrying generation", async () => {
    const out = path.join(await temporary(), "result");
    const test = fixture({ OPENROUTER_API_KEY: KEY });
    test.request.mockImplementation(async () => {
      await writeFile(
        path.join(out, "output-2.png"),
        "preserve-owned-collision"
      );
      return Response.json({
        data: [
          { b64_json: PNG.toString("base64") },
          { b64_json: PNG.toString("base64") },
        ],
      });
    });
    expect(
      await test.invoke(generateArgs(out, "openrouter", image.model_id), {
        prompt: PROMPT,
        n: 2,
      })
    ).toBe(1);
    expect(test.result().error).toMatchObject({
      code: "save_failed",
      directory: out,
      saved: [
        {
          path: path.join(out, "output-1.png"),
          media_type: "image/png",
          bytes: PNG.length,
        },
      ],
    });
    expect(await readFile(path.join(out, "output-1.png"))).toEqual(PNG);
    expect(await readFile(path.join(out, "output-2.png"), "utf8")).toBe(
      "preserve-owned-collision"
    );
    expect(await readdir(out)).toEqual(["output-1.png", "output-2.png"]);
    expect(test.request).toHaveBeenCalledOnce();
    test.assertSafe();
  });
});
