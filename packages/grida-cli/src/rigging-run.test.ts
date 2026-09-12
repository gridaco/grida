// GRIDA-SEC-013 — real SDK, synthetic transport, explicit CLI rigging authority.
import { RiggingClient, type ProviderHttpTransport } from "@grida/ai";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthClient } from "@grida/auth";
import type { CliHost } from "./host";
import { Cli } from "./cli";
import { MediaFiles } from "./media-files";
import { Output } from "./output";
import { RiggingCommands } from "./rigging-run";

const KEY = "tsk_synthetic-private-rigging-key";
const taskId = "task_rigging_cli";
const roots: string[] = [];
function glb() {
  const json = Buffer.from('{"asset":{"version":"2.0"}}'.padEnd(28, " "));
  const bytes = Buffer.alloc(20 + json.length);
  [0x46546c67, 2, bytes.length, json.length, 0x4e4f534a].forEach((value, i) =>
    bytes.writeUInt32LE(value, i * 4)
  );
  json.copy(bytes, 20);
  return bytes;
}
async function temporary() {
  const root = await mkdtemp(path.join(tmpdir(), "grida-rigging-cli-"));
  roots.push(root);
  return root;
}
function fixture(
  feature: "rig-check" | "rigging" = "rigging",
  riggable = true
) {
  const stdout: string[] = [],
    stderr: string[] = [];
  const request = vi.fn<typeof fetch>(async (url) =>
    Response.json({
      code: 0,
      data: String(url).endsWith("/files")
        ? { file_token: "file_cli" }
        : String(url).includes("/tasks/")
          ? {
              task_id: taskId,
              type: feature === "rig-check" ? "rig_check" : "rig",
              status: "success",
              progress: 100,
              credits_consumed: feature === "rig-check" ? 0 : 25,
              output:
                feature === "rig-check"
                  ? { riggable, rig_type: "biped" }
                  : {
                      model_url:
                        "https://cdn.tripo3d.ai/output/rig.glb?private=signature",
                    },
            }
          : { task_id: taskId },
    })
  );
  const download = vi.fn<typeof fetch>(async () => new Response(glb()));
  const transport = vi.fn<() => ProviderHttpTransport>(() => ({
    request,
    download,
  }));
  const openStore = vi.fn<RiggingCommands.Host["openStore"]>(async () => {
    throw new Error(KEY);
  });
  const host: RiggingCommands.Host = {
    env: { TRIPO_API_KEY: KEY },
    stdin: Readable.from([]),
    openStore,
    openAuth: vi.fn<RiggingCommands.Host["openAuth"]>(async () => {
      throw new Error("unexpected Grida account access");
    }),
    transport,
  };
  const output = new Output(
    true,
    (text) => stdout.push(text),
    (text) => stderr.push(text)
  );
  return {
    host,
    request,
    download,
    openStore,
    transport,
    stdout,
    stderr,
    async invoke(args: string[], input?: unknown) {
      if (input !== undefined)
        host.stdin = Readable.from([Buffer.from(JSON.stringify(input))]);
      const invocation = Cli.parse(["rigging", ...args, "--json"]);
      if (!invocation.command.startsWith("rigging "))
        throw new Error("wrong fixture command");
      return RiggingCommands.run(
        invocation as Cli.RiggingInvocation,
        output,
        host
      );
    },
    result: () => JSON.parse(stdout.at(-1)!),
    safe() {
      expect(stdout.join("") + stderr.join("")).not.toMatch(
        /synthetic-private|signature|model_url|file_cli|authorization/i
      );
    },
  };
}
function runArgs(out: string) {
  return [
    "run",
    "--provider",
    "tripo",
    "--model",
    "tripo/rig-v1.0",
    "--out",
    out,
    "--input",
    "-",
  ];
}
const jsonMesh = () => ({
  mesh: { data: glb().toString("base64"), media_type: "model/gltf-binary" },
});
const jsonRig = () => ({ ...jsonMesh(), rig_type: "biped", spec: "mixamo" });
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("CLI rigging composition", () => {
  it("discovers schemas without touching environment, custody or transport; checks have no model", async () => {
    const test = fixture();
    const read = vi.fn<() => never>(() => {
      throw new Error(KEY);
    });
    test.host.env = new Proxy(
      {},
      { get: read, getOwnPropertyDescriptor: read }
    );
    expect(await test.invoke(["list"])).toBe(0);
    expect(test.result()).toHaveLength(6);
    expect(test.result()[0]).not.toHaveProperty("model_id");
    expect(
      await test.invoke([
        "inspect",
        "--provider",
        "tripo",
        "--feature",
        "rig-check",
      ])
    ).toBe(0);
    expect(test.result().output.representation).toBe("structured");
    expect(test.result()).not.toHaveProperty("model_id");
    expect(read).not.toHaveBeenCalled();
    expect(test.openStore).not.toHaveBeenCalled();
    expect(test.transport).not.toHaveBeenCalled();
    test.safe();
  });

  it.each([true, false])(
    "reports eligibility=%s without rig submission, artifact save or download",
    async (riggable) => {
      const test = fixture("rig-check", riggable);
      const file = path.join(await temporary(), "character.bin");
      await writeFile(file, glb());
      expect(
        await test.invoke(["check", "--provider", "tripo", "--mesh", file])
      ).toBe(0);
      expect(test.result()).toEqual({
        riggable,
        rig_type: "biped",
        task: { id: taskId, credits_consumed: 0 },
      });
      expect(test.request.mock.calls.map(([url]) => String(url))).toEqual([
        "https://openapi.tripo3d.ai/v3/files",
        "https://openapi.tripo3d.ai/v3/animations/rig-check",
        `https://openapi.tripo3d.ai/v3/tasks/${taskId}`,
      ]);
      expect(test.download).not.toHaveBeenCalled();
      expect(test.openStore).not.toHaveBeenCalled();
      test.safe();
    }
  );

  it("saves exact returned GLB and safe task receipt after explicit rigging without a check", async () => {
    const test = fixture();
    const out = path.join(await temporary(), "result");
    expect(await test.invoke(runArgs(out), jsonRig())).toBe(0);
    const receipt = test.result();
    expect(receipt).toMatchObject({
      kind: "three-d",
      feature: "rigging",
      model_id: "tripo/rig-v1.0",
      variant: "mesh",
      task: { id: taskId, credits_consumed: 25 },
    });
    expect(receipt.artifacts[0].sha256).toBe(
      createHash("sha256").update(glb()).digest("hex")
    );
    expect(await readFile(receipt.artifacts[0].path)).toEqual(glb());
    expect(
      JSON.parse(await readFile(path.join(out, "receipt.json"), "utf8"))
    ).toEqual(receipt);
    const submits = test.request.mock.calls.filter(([url]) =>
      String(url).includes("/animations/")
    );
    expect(submits).toHaveLength(1);
    expect(String(submits[0]![0])).toBe(
      "https://openapi.tripo3d.ai/v3/animations/rig"
    );
    expect(JSON.parse(submits[0]![1]!.body as string)).toEqual({
      input: "file_cli",
      model: "v1.0-20240301",
      rig_type: "biped",
      spec: "mixamo",
      out_format: "glb",
    });
    expect(test.download.mock.calls[0]![1]).not.toHaveProperty("headers");
    test.safe();
  });

  it("validates unsupported models and rig options before credentials or paid requests", async () => {
    for (const [model, input] of [
      ["unknown", jsonRig()],
      ["tripo/rig-v1.0", { ...jsonRig(), rig_type: "quadruped" }],
    ] as const) {
      const test = fixture();
      const out = path.join(await temporary(), "result");
      const args = runArgs(out);
      args[4] = model;
      expect(await test.invoke(args, input)).toBe(1);
      expect(test.openStore).not.toHaveBeenCalled();
      expect(test.transport).not.toHaveBeenCalled();
      expect(test.request).not.toHaveBeenCalled();
      test.safe();
    }
  });

  it("rejects an existing output before credentials or submission", async () => {
    const test = fixture();
    const out = path.join(await temporary(), "result");
    await mkdir(out);
    expect(await test.invoke(runArgs(out), jsonRig())).toBe(1);
    expect(test.result().error.code).toBe("output_unavailable");
    expect(test.transport).not.toHaveBeenCalled();
    expect(test.openStore).not.toHaveBeenCalled();
    test.safe();
  });

  it("supports an explicit stdin key with a local mesh without opening storage", async () => {
    const test = fixture("rig-check");
    test.host.env = { TRIPO_API_KEY: "" };
    test.host.stdin = Readable.from([Buffer.from(KEY + "\n")]);
    const file = path.join(await temporary(), "character.glb");
    await writeFile(file, glb());
    expect(
      await test.invoke([
        "check",
        "--provider",
        "tripo",
        "--mesh",
        file,
        "--key-stdin",
      ])
    ).toBe(0);
    expect(test.openStore).not.toHaveBeenCalled();
    expect(
      new Headers(test.request.mock.calls[0]![1]!.headers).get("authorization")
    ).toBe(`Bearer ${KEY}`);
    test.safe();
  });

  it("retains the accepted task on failure and never resubmits", async () => {
    const test = fixture();
    test.request.mockImplementation(async (url) =>
      Response.json({
        code: 0,
        data: String(url).endsWith("/files")
          ? { file_token: "file_cli" }
          : String(url).includes("/tasks/")
            ? { task_id: taskId, type: "rig", status: "failed", error: KEY }
            : { task_id: taskId },
      })
    );
    const root = await temporary();
    expect(
      await test.invoke(runArgs(path.join(root, "result")), jsonRig())
    ).toBe(1);
    expect(test.result().error).toMatchObject({
      code: "generation_failed",
      task_id: taskId,
    });
    expect(
      test.request.mock.calls.filter(([url]) =>
        String(url).endsWith("/animations/rig")
      )
    ).toHaveLength(1);
    expect(await readdir(root)).toEqual([]);
    test.safe();
  });

  it("preserves returned task identity on failed output publication without retrying", async () => {
    const test = fixture();
    vi.spyOn(MediaFiles.Directory.prototype, "save").mockImplementation(
      async function (this: MediaFiles.Directory) {
        throw new MediaFiles.Failure("save_failed", this.path, []);
      }
    );
    const out = path.join(await temporary(), "result");
    expect(await test.invoke(runArgs(out), jsonRig())).toBe(1);
    expect(test.result().error).toMatchObject({
      code: "save_failed",
      task_id: taskId,
      directory: expect.any(String),
      saved: [],
    });
    expect(
      test.request.mock.calls.filter(([url]) =>
        String(url).endsWith("/animations/rig")
      )
    ).toHaveLength(1);
    test.safe();
  });

  it("reads no URL input and rejects oversized mesh files before authority", async () => {
    const test = fixture("rig-check");
    expect(
      await test.invoke([
        "check",
        "--provider",
        "tripo",
        "--mesh",
        "https://example.com/mesh.glb",
      ])
    ).toBe(1);
    const file = path.join(await temporary(), "huge.glb");
    const { open } = await import("node:fs/promises");
    const handle = await open(file, "w");
    await handle.truncate(RiggingClient.max_mesh_bytes + 1);
    await handle.close();
    expect(
      await test.invoke(["check", "--provider", "tripo", "--mesh", file])
    ).toBe(1);
    expect(test.result().error.code).toBe("input_unavailable");
    expect(test.transport).not.toHaveBeenCalled();
    test.safe();
  });
});

// GRIDA-SEC-006 / GRIDA-GG: provider — hosted account grants never select BYOK.
describe("CLI funded Tripo rigging", () => {
  function hosted(test: ReturnType<typeof fixture>, grant = true) {
    const organization = { id: 7, name: "studio", display_name: "Studio" };
    let sink: AuthClient.GgSink | undefined;
    const requestAccount = vi.fn<
      () => Promise<{
        organizations: (typeof organization)[];
        next_cursor: null;
      }>
    >(async () => ({
      organizations: [organization],
      next_cursor: null,
    }));
    const requestGgAccess = vi.fn<AuthClient["requestGgAccess"]>(async () => {
      const expires_at = new Date(Date.now() + 900_000).toISOString();
      if (grant)
        sink!.accept({
          token: "synthetic-scoped-token",
          expires_at,
          organization,
        });
      return { organization, expires_at };
    });
    vi.mocked(test.host.openAuth).mockImplementation(async (options) => {
      sink = options?.gg;
      return {
        client: {
          requestAccount,
          requestGgAccess,
          config: { apiOrigin: "https://grida.example" },
        },
      } as unknown as CliHost.Runtime;
    });
    const readKey = vi.fn<() => never>(() => {
      throw new Error("unexpected BYOK read");
    });
    test.host.env = new Proxy(
      {},
      { get: readKey, getOwnPropertyDescriptor: readKey }
    );
    test.request.mockImplementation(async (url, init) => {
      expect(new Headers(init?.headers).has("authorization")).toBe(
        init?.method !== "PUT"
      );
      if (init?.method === "PUT") {
        return new Response(null);
      }
      expect(String(url)).toMatch(
        /^https:\/\/grida\.example\/api\/v1\/ai\/3d\//
      );
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer synthetic-scoped-token"
      );
      if (String(url).endsWith("/uploads"))
        return Response.json({
          upload: "signed-reference",
          upload_url:
            "https://tripo-data.s3.us-west-2.amazonaws.com/mesh.glb?signature=synthetic",
        });
      return Response.json(
        String(url).endsWith("/rig-check")
          ? {
              feature: "rig-check",
              provider_id: "gg",
              riggable: true,
              rig_type: "biped",
              task: { id: taskId, credits_consumed: 0 },
            }
          : {
              feature: "rigging",
              provider_id: "gg",
              model_id: "tripo/rig-v1.0",
              glb: {
                base64: glb().toString("base64"),
                media_type: "model/gltf-binary",
              },
              task: { id: taskId, credits_consumed: 25 },
            }
      );
    });
    return { readKey, requestGgAccess };
  }
  it.each(["check", "run"])(
    "%s selects explicit organization, uploads once and consumes the SDK",
    async (command) => {
      const root = await temporary();
      const test = fixture();
      const account = hosted(test);
      const input = {
        mesh: {
          data: glb().toString("base64"),
          media_type: "model/gltf-binary",
        },
        ...(command === "run" ? { rig_type: "biped", spec: "mixamo" } : {}),
      };
      const args =
        command === "check"
          ? ["check", "--provider", "gg", "--input", "-"]
          : runArgs(path.join(root, "rigged")).map((value) =>
              value === "tripo" ? "gg" : value
            );
      expect(await test.invoke([...args, "--org-id", "7"], input)).toBe(0);
      expect(account.requestGgAccess).toHaveBeenCalledExactlyOnceWith({
        organization_id: 7,
      });
      expect(account.readKey).not.toHaveBeenCalled();
      expect(test.openStore).not.toHaveBeenCalled();
      expect(test.download).not.toHaveBeenCalled();
      expect(test.request).toHaveBeenCalledTimes(3);
      expect(test.result()).toMatchObject(
        command === "run" ? { provider_id: "gg" } : { riggable: true }
      );
      const artifact =
        command === "run"
          ? await readFile(test.result().artifacts[0].path)
          : undefined;
      expect(artifact).toEqual(command === "run" ? glb() : undefined);
      test.safe();
    }
  );
  it("does not treat mint status as authority or fall back to configured Tripo", async () => {
    const test = fixture();
    hosted(test, false);
    expect(
      await test.invoke(["check", "--provider", "gg", "--input", "-"], {
        mesh: {
          data: glb().toString("base64"),
          media_type: "model/gltf-binary",
        },
      })
    ).toBe(1);
    expect(test.result().error.code).toBe("gg_token_expired");
    expect(test.request).not.toHaveBeenCalled();
    expect(test.openStore).not.toHaveBeenCalled();
    test.safe();
  });
});
