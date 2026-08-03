import { describe, expect, it, vi } from "vitest";
import type { ThreeDGenerateRequest } from "../protocol/three-d";
import { FalThreeDProvider } from "./fal-three-d";
import { ProviderHttp } from "./http";

const STATUS_URL = "https://queue.fal.run/requests/one/status";
const RESPONSE_URL = "https://queue.fal.run/requests/one";
const GLB_URL = "https://v3.fal.media/model.glb";
const GLB_BYTES = new Uint8Array([
  0x67,
  0x6c,
  0x54,
  0x46, // magic: glTF
  0x02,
  0x00,
  0x00,
  0x00, // version: 2
  0x0c,
  0x00,
  0x00,
  0x00, // total length: 12 bytes
]);

function harness(
  options: {
    file_size?: number;
    response_content_length?: number;
    download_bytes?: Uint8Array<ArrayBuffer>;
  } = {}
) {
  const bodies: unknown[] = [];
  const request = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = String(input);
    if (url.startsWith("https://queue.fal.run/fal-ai/")) {
      bodies.push(JSON.parse(String(init?.body)));
      return Response.json({
        request_id: "one",
        status_url: STATUS_URL,
        response_url: RESPONSE_URL,
      });
    }
    if (url === STATUS_URL) return Response.json({ status: "COMPLETED" });
    if (url === RESPONSE_URL) {
      return Response.json({
        model_glb: {
          url: GLB_URL,
          content_type: "application/octet-stream",
          file_name: "../../untrusted.exe",
          ...(options.file_size === undefined
            ? {}
            : { file_size: options.file_size }),
        },
      });
    }
    throw new Error(`unexpected request: ${url}`);
  });
  const download = vi.fn<typeof globalThis.fetch>(async (input) => {
    expect(String(input)).toBe(GLB_URL);
    return new Response(options.download_bytes ?? GLB_BYTES, {
      headers: {
        "content-type": "model/gltf-binary",
        ...(options.response_content_length === undefined
          ? {}
          : { "content-length": String(options.response_content_length) }),
      },
    });
  });
  const provider = new FalThreeDProvider(
    "fal-secret",
    new ProviderHttp({ request, download })
  );
  return { bodies, download, provider, request };
}

describe("FalThreeDProvider", () => {
  it.each<{
    request: ThreeDGenerateRequest;
    expected: Record<string, unknown>;
  }>([
    {
      request: {
        model_id: "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d",
        prompt: "a brass robot",
      },
      expected: { prompt: "a brass robot" },
    },
    {
      request: {
        model_id: "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d",
        image: { base64: "AAAA", media_type: "image/png" },
      },
      expected: { input_image_url: "data:image/png;base64,AAAA" },
    },
    {
      request: {
        model_id: "fal-ai/trellis-2",
        image: { base64: "AQID", media_type: "image/jpeg" },
      },
      expected: { image_url: "data:image/jpeg;base64,AQID" },
    },
  ])("maps $request.model_id to its exact fal input", async (test) => {
    const { bodies, download, provider } = harness();
    const glb = await provider.generate(test.request);

    expect(bodies).toEqual([test.expected]);
    expect(glb).toEqual({
      base64: Buffer.from(GLB_BYTES).toString("base64"),
      media_type: "model/gltf-binary",
      file_name: "model.glb",
    });
    expect(download).toHaveBeenCalledOnce();
  });

  it("refuses a provider-advertised GLB outside fal hosts", async () => {
    const request = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = String(input);
      if (url.startsWith("https://queue.fal.run/fal-ai/")) {
        return Response.json({
          request_id: "one",
          status_url: STATUS_URL,
          response_url: RESPONSE_URL,
        });
      }
      if (url === STATUS_URL) return Response.json({ status: "COMPLETED" });
      return Response.json({
        model_glb: { url: "https://attacker.example/steal.glb" },
      });
    });
    const download = vi.fn<typeof globalThis.fetch>();
    const provider = new FalThreeDProvider(
      "fal-secret",
      new ProviderHttp({ request, download })
    );

    await expect(
      provider.generate({
        model_id: "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d",
        prompt: "x",
      })
    ).rejects.toThrow(/disallowed host/);
    expect(download).not.toHaveBeenCalled();
  });

  it("refuses a successful provider download that is not a GLB 2.0 file", async () => {
    const { provider } = harness({
      download_bytes: new TextEncoder().encode("<html>upstream error</html>"),
    });

    await expect(
      provider.generate({
        model_id: "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d",
        prompt: "x",
      })
    ).rejects.toThrow(/not a GLB 2\.0 file/);
  });

  it("accepts a single GLB advertised above the generic 64 MiB batch cap", async () => {
    const advertised = 65 * 1024 * 1024;
    const { provider, download } = harness({
      file_size: advertised,
      response_content_length: advertised,
    });

    await expect(
      provider.generate({
        model_id: "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d",
        prompt: "x",
      })
    ).resolves.toMatchObject({
      base64: Buffer.from(GLB_BYTES).toString("base64"),
    });
    expect(download).toHaveBeenCalledOnce();
  });

  it("rejects fal file_size above 256 MiB before opening the download", async () => {
    const { provider, download } = harness({
      file_size: 256 * 1024 * 1024 + 1,
    });

    await expect(
      provider.generate({
        model_id: "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d",
        prompt: "x",
      })
    ).rejects.toThrow(/too large/);
    expect(download).not.toHaveBeenCalled();
  });
});
