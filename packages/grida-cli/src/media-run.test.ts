// GRIDA-SEC-013 — CLI preflight, explicit BYOK, safe media publication.
// GRIDA-SEC-015 — composing real media clients does not mix account, GG and BYOK authority.
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

function glbFixture() {
  const json = JSON.stringify({ asset: { version: "2.0" } });
  const chunk = Buffer.from(json.padEnd(Math.ceil(json.length / 4) * 4, " "));
  const bytes = Buffer.alloc(20 + chunk.length);
  bytes.writeUInt32LE(0x46546c67, 0);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(chunk.length, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  chunk.copy(bytes, 20);
  return bytes;
}

async function temporary() {
  const root = await realpath(
    await mkdtemp(path.join(tmpdir(), "grida-media-command-"))
  );
  roots.push(root);
  return root;
}

function fixture(env: NodeJS.ProcessEnv = {}, json = true) {
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
    json,
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
      const invocation = Cli.parse([...args, ...(json ? ["--json"] : [])]);
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
      if (json) expect(stderr).toEqual([]);
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
  it("uses the service catalogue without hiding explicit legacy or staged operations", async () => {
    const { env, read } = forbiddenEnv();
    const test = fixture(env);
    expect(await test.invoke(["models", "list"])).toBe(0);
    const operations = test.result().operations;
    for (const [model_id, status, deprecated] of [
      ["openai/gpt-image-2", "listed", true],
      ["openai/gpt-image-2.5-flare", "listed", undefined],
      ["fal-ai/trellis-2", "staged", undefined],
    ]) {
      const operation = operations.find(
        (entry: { model_id: string }) => entry.model_id === model_id
      );
      expect(operation).toBeDefined();
      expect(operation.status).toBe(status);
      expect(operation.deprecated === true).toBe(deprecated === true);
    }
    expect(read).not.toHaveBeenCalled();
    expect(test.openStore).not.toHaveBeenCalled();
    expect(test.openAuth).not.toHaveBeenCalled();
    expect(test.transport).not.toHaveBeenCalled();
    test.assertSafe();
  });

  it.each([
    "missing-file",
    "malformed-image",
    "field-collision",
    "existing-output",
    "invalid-model-option",
  ])(
    "refuses friendly %s before credentials or any transport",
    async (mode) => {
      const root = await temporary();
      const out = path.join(root, "result");
      const local = path.join(root, "private-image.png");
      if (mode === "malformed-image")
        await writeFile(local, "synthetic-private-not-an-image");
      if (mode === "existing-output") await mkdir(out);
      const { env, read } = forbiddenEnv();
      const test = fixture(env);
      const args = [
        "generate",
        "--provider",
        "openrouter",
        "--model",
        "openai/gpt-image-2",
        "--prompt",
        PROMPT,
        "--out",
        out,
      ];
      if (mode === "missing-file" || mode === "malformed-image")
        args.push("--reference", local);
      if (mode === "field-collision")
        args.push("--param", "prompt=synthetic-private-collision");
      if (mode === "invalid-model-option") args.push("--param", "n=17");
      expect(await test.invoke(args)).not.toBe(0);
      expect(read).not.toHaveBeenCalled();
      expect(test.openAuth).not.toHaveBeenCalled();
      expect(test.openStore).not.toHaveBeenCalled();
      expect(test.transport).not.toHaveBeenCalled();
      test.assertSafe();
    }
  );
  it.each([
    { args: ["models", "list"] },
    { args: ["models", "list", "--local-image"] },
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

  it("filters and reports local-image support from schemas without authority", async () => {
    const { env, read } = forbiddenEnv();
    const test = fixture(env);
    expect(
      await test.invoke([
        "models",
        "list",
        "--modality",
        "video",
        "--local-image",
      ])
    ).toBe(0);
    expect(test.result().operations).toEqual([
      expect.objectContaining({
        provider_id: "fal",
        model_id: "google/veo-3.1-lite",
        variant: "image",
        local_image_flags: ["--image"],
      }),
    ]);
    expect(
      await test.invoke([
        "models",
        "list",
        "--modality",
        "video",
        "--provider",
        "openrouter",
        "--local-image",
      ])
    ).toBe(0);
    expect(test.result().operations).toEqual([]);
    expect(
      await test.invoke([
        "models",
        "list",
        "--provider",
        "openrouter",
        "--kind",
        "image",
        "--local-image",
      ])
    ).toBe(0);
    expect(test.result().operations.length).toBeGreaterThan(0);
    for (const row of test.result().operations) {
      expect(row.local_image_flags).toEqual(["--reference"]);
      expect(row).not.toHaveProperty("input_schema");
    }
    expect(read).not.toHaveBeenCalled();
    expect(test.openStore).not.toHaveBeenCalled();
    expect(test.openAuth).not.toHaveBeenCalled();
    expect(test.transport).not.toHaveBeenCalled();
    test.assertSafe();
  });

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
  it.each(
    (["tripo/h3.1", "tripo/p1", "tripo/p2"] as const).flatMap((model) =>
      (["text", "image", "multiview"] as const).map((variant) => ({
        model,
        variant,
      }))
    )
  )(
    "submits $model $variant once and saves the GLB without exposing task or provider data",
    async ({ model, variant }) => {
      const out = path.join(await temporary(), "model");
      const test = fixture({ TRIPO_API_KEY: KEY });
      const asset = glbFixture();
      const url =
        "https://tripo-data.rg1.data.tripo3d.com/task/model.glb?signature=upstream-private";
      let uploads = 0;
      test.request.mockImplementation(async (input, init) => {
        const target = new URL(String(input));
        expect(target.origin).toBe("https://openapi.tripo3d.ai");
        expect(new Headers(init?.headers).get("authorization")).toBe(
          `Bearer ${KEY}`
        );
        if (target.pathname === "/v3/files") {
          return Response.json({
            code: 0,
            data: { file_token: `file_${++uploads}` },
          });
        }
        if (target.pathname === `/v3/generation/${variant}-to-model`) {
          return Response.json({ code: 0, data: { task_id: "task_test" } });
        }
        expect(target.pathname).toBe("/v3/tasks/task_test");
        expect(init?.method).toBe("GET");
        return Response.json({
          code: 0,
          data: {
            task_id: "task_test",
            type: `${variant}_to_model`,
            status: "success",
            progress: 100,
            output: { model_url: url },
            credits_consumed: 20,
          },
        });
      });
      test.download.mockImplementation(async (input, init) => {
        expect(String(input)).toBe(url);
        expect(new Headers(init?.headers).has("authorization")).toBe(false);
        return new Response(new Uint8Array(asset), {
          headers: { "content-type": "model/gltf-binary" },
        });
      });
      const image = { data: PNG.toString("base64"), media_type: "image/png" };
      const input =
        variant === "text"
          ? { prompt: PROMPT }
          : variant === "image"
            ? { image }
            : { images: { front: image, left: image } };
      expect(
        await test.invoke(
          [...generateArgs(out, "tripo", model), "--variant", variant],
          input
        )
      ).toBe(0);
      const generations = test.request.mock.calls.filter(([input]) =>
        String(input).includes("/generation/")
      );
      expect(generations).toHaveLength(1);
      expect(generations[0]?.[1]?.method).toBe("POST");
      expect(JSON.parse(String(generations[0]?.[1]?.body))).toMatchObject({
        model: {
          "tripo/h3.1": "v3.1-20260211",
          "tripo/p1": "P1-20260311",
          "tripo/p2": "P2-20260801",
        }[model],
      });
      const fileUploads = test.request.mock.calls.filter(
        ([input]) => new URL(String(input)).pathname === "/v3/files"
      );
      expect(fileUploads).toHaveLength(uploads);
      for (const [, init] of fileUploads) {
        expect(init?.method).toBe("POST");
        expect(init?.body).toBeInstanceOf(Uint8Array);
      }
      expect(uploads).toBe(
        variant === "text" ? 0 : variant === "image" ? 1 : 2
      );
      expect(await readFile(test.result().artifacts[0].path)).toEqual(asset);
      expect(test.result()).toMatchObject({
        provider_id: "tripo",
        model_id: model,
        variant,
      });
      expect(test.result()).not.toHaveProperty("task");
      expect(test.openStore).not.toHaveBeenCalled();
      expect(test.openAuth).not.toHaveBeenCalled();
      test.assertSafe();
    }
  );

  it("does not substitute another configured provider for a missing Tripo key", async () => {
    const root = await temporary();
    const test = fixture({ FAL_KEY: "synthetic:fal-key" });
    expect(
      await test.invoke(
        generateArgs(path.join(root, "result"), "tripo", "tripo/h3.1"),
        { prompt: PROMPT }
      )
    ).toBe(1);
    expect(test.result().error.code).toBe("provider_key_required");
    expect(test.request).not.toHaveBeenCalled();
    expect(test.openAuth).not.toHaveBeenCalled();
    expect(await readdir(root)).toEqual([]);
    test.assertSafe();
  });

  it.each([true, false])(
    "retains only the accepted Tripo task ID after download failure (json=%s)",
    async (json) => {
      const root = await temporary();
      const test = fixture({ TRIPO_API_KEY: KEY }, json);
      const taskId = "task_accepted";
      test.request.mockResolvedValueOnce(
        Response.json({ code: 0, data: { task_id: taskId } })
      );
      test.request.mockResolvedValueOnce(
        Response.json({
          code: 0,
          data: {
            task_id: taskId,
            type: "text_to_model",
            status: "success",
            progress: 100,
            output: {
              model_url:
                "https://tripo-data.rg1.data.tripo3d.com/model.glb?signature=upstream-private",
            },
            private_metadata: KEY,
          },
        })
      );
      test.download.mockRejectedValueOnce(
        new Error(`upstream-private download details ${KEY}`)
      );
      expect(
        await test.invoke(
          generateArgs(path.join(root, "result"), "tripo", "tripo/h3.1"),
          { prompt: PROMPT }
        )
      ).toBe(1);
      expect(
        test.request.mock.calls.filter(([url]) =>
          String(url).includes("/generation/")
        )
      ).toHaveLength(1);
      expect(test.request).toHaveBeenCalledTimes(2);
      expect(test.download).toHaveBeenCalledOnce();
      const error = {
        code: "generation_failed",
        task_id: taskId,
        message:
          "Media operation failed. An accepted request may still be charged; no automatic retry was made.",
      };
      expect(test.stdout).toEqual(
        json ? [JSON.stringify({ error }) + "\n"] : []
      );
      expect(test.stderr).toEqual(
        json
          ? []
          : [`grida: ${error.message} (${error.code})\n`, `  Task: ${taskId}\n`]
      );
      expect(await readdir(root)).toEqual([]);
      expect(test.openAuth).not.toHaveBeenCalled();
      test.assertSafe();
    }
  );
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
    const test = fixture({ OPENROUTER_API_KEY: "sk-or-" + KEY });
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
    expect((await readdir(out)).sort()).toEqual([
      "output-1.mp3",
      "receipt.json",
    ]);
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
    expect((await readdir(out)).sort()).toEqual([
      "output-1.mp3",
      "receipt.json",
    ]);
    expect(test.request).toHaveBeenCalledOnce();
    expect(process.listeners("SIGINT")).toEqual(before);
    test.assertSafe();
  });

  it("retains a partial result and safe saved paths after an output collision without retrying generation", async () => {
    const out = path.join(await temporary(), "result");
    const test = fixture({ OPENROUTER_API_KEY: "sk-or-" + KEY });
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
    expect((await readdir(out)).sort()).toEqual([
      "output-1.png",
      "output-2.png",
    ]);
    expect(test.request).toHaveBeenCalledOnce();
    test.assertSafe();
  });
});

describe("CLI funded Tripo generation", () => {
  it.each(["text", "image", "multiview"])(
    "runs %s through GG with portable files and explicit account authority",
    async (variant) => {
      const out = path.join(await temporary(), "hosted-tripo");
      const test = fixture();
      attachAccount(test);
      const glb = glbFixture();
      test.request.mockImplementation(async (url, init) => {
        expect(new Headers(init?.headers).has("authorization")).toBe(
          init?.method !== "PUT"
        );
        if (init?.method === "PUT") {
          return new Response(null);
        }
        if (String(url).endsWith("/uploads"))
          return Response.json({
            upload: "signed-reference",
            upload_url:
              "https://tripo-data.s3.us-west-2.amazonaws.com/image.png?signature=synthetic",
          });
        expect(String(url)).toBe(
          "https://grida.example/api/v1/ai/3d/model-generation"
        );
        return Response.json({
          feature: "model-generation",
          provider_id: "gg",
          model_id: "tripo/p2",
          variant,
          glb: {
            base64: glb.toString("base64"),
            media_type: "model/gltf-binary",
          },
          task: { id: "task_cli_gg", credits_consumed: 100 },
        });
      });
      const image = { data: PNG.toString("base64"), media_type: "image/png" };
      expect(
        await test.invoke(
          [
            ...generateArgs(out, "gg", "tripo/p2"),
            "--kind",
            "three-d",
            "--variant",
            variant,
          ],
          variant === "text"
            ? { prompt: PROMPT }
            : variant === "image"
              ? { image }
              : { images: { front: image, left: image } }
        )
      ).toBe(0);
      expect(test.result().provider_id).toBe("gg");
      expect(await readFile(test.result().artifacts[0].path)).toEqual(glb);
      expect(test.openStore).not.toHaveBeenCalled();
      expect(test.download).not.toHaveBeenCalled();
      test.assertSafe();
    }
  );
});
