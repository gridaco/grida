/**
 * fal BYOK 3D generation.
 *
 * The adapter owns the exact fal endpoint request shapes, the bounded queue
 * lifecycle, and primary-GLB download. Provider response URLs never leave this
 * package; the caller receives bytes only (GRIDA-SEC-004).
 */

import type {
  ThreeDGenerateRequest,
  ThreeDGeneratedGlb,
} from "../protocol/three-d";
import {
  assertAllowedUrl,
  falQueueOutcome,
  pollQueue,
  safeText,
} from "./fetch-helpers";
import { ProviderHttp } from "./http";

const FAL_QUEUE_BASE = "https://queue.fal.run";
const FAL_HOSTS = ["*.fal.run", "fal.run", "fal.media", "*.fal.media"] as const;
const FAL_POLL_TIMEOUT_MS = 600_000;
const FAL_POLL_INTERVAL_MS = 2_000;

type FalSubmitResponse = {
  request_id: string;
  status_url: string;
  response_url: string;
};

type FalStatus = "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | (string & {});

type FalFile = {
  url?: string;
  content_type?: string;
  file_name?: string;
  file_size?: number;
};

type FalThreeDResult = {
  model_glb?: FalFile;
  model_urls?: { glb?: FalFile };
};

export class FalThreeDProvider {
  constructor(
    private readonly apiKey: string,
    private readonly providerHttp: ProviderHttp = new ProviderHttp()
  ) {}

  private headers(): Record<string, string> {
    return {
      authorization: `Key ${this.apiKey}`,
      "content-type": "application/json",
    };
  }

  async generate(
    request: ThreeDGenerateRequest,
    abortSignal?: AbortSignal
  ): Promise<ThreeDGeneratedGlb> {
    const submitRes = await this.providerHttp.request(
      `${FAL_QUEUE_BASE}/${request.model_id}`,
      {
        method: "POST",
        headers: this.headers(),
        signal: abortSignal,
        body: JSON.stringify(falInput(request)),
      }
    );
    if (!submitRes.ok) {
      throw new Error(
        `[fal] 3D submit failed (${submitRes.status}): ${await safeText(submitRes)}`
      );
    }
    const submit = (await submitRes.json()) as FalSubmitResponse;
    if (
      typeof submit.status_url !== "string" ||
      typeof submit.response_url !== "string"
    ) {
      throw new Error("[fal] 3D submit response contained no queue URLs");
    }
    assertAllowedUrl(submit.status_url, FAL_HOSTS, "[fal] 3D status_url");
    assertAllowedUrl(submit.response_url, FAL_HOSTS, "[fal] 3D response_url");

    await pollQueue<{ status: FalStatus }>(
      submit.status_url,
      {
        headers: this.headers(),
        timeoutMs: FAL_POLL_TIMEOUT_MS,
        intervalMs: FAL_POLL_INTERVAL_MS,
        label: "[fal] 3D",
        classify: falQueueOutcome,
        fetch: this.providerHttp.request,
      },
      abortSignal
    );

    const resultRes = await this.providerHttp.request(submit.response_url, {
      headers: this.headers(),
      signal: abortSignal,
    });
    if (!resultRes.ok) {
      throw new Error(
        `[fal] 3D result fetch failed (${resultRes.status}): ${await safeText(resultRes)}`
      );
    }
    const result = (await resultRes.json()) as FalThreeDResult;
    const file = result.model_glb ?? result.model_urls?.glb;
    if (!file || typeof file.url !== "string") {
      throw new Error("[fal] 3D response contained no primary GLB");
    }
    assertAllowedUrl(file.url, FAL_HOSTS, "[fal] 3D model_glb.url");

    const fileSize = falFileSize(file);
    const downloaded = await this.providerHttp.downloadProviderAsset(
      new URL(file.url),
      {
        signal: abortSignal,
        ...(fileSize === undefined ? {} : { declared_size_bytes: fileSize }),
      }
    );
    assertGlb2(downloaded.data);
    return {
      base64: Buffer.from(downloaded.data).toString("base64"),
      media_type: "model/gltf-binary",
      // Never trust a provider-authored filename across the renderer boundary.
      file_name: "model.glb",
    };
  }
}

function assertGlb2(bytes: Uint8Array): void {
  if (bytes.byteLength < 12) {
    throw new Error("[fal] 3D primary asset was not a GLB 2.0 file");
  }
  const header = new DataView(bytes.buffer, bytes.byteOffset, 12);
  const hasMagic =
    bytes[0] === 0x67 &&
    bytes[1] === 0x6c &&
    bytes[2] === 0x54 &&
    bytes[3] === 0x46;
  const version = header.getUint32(4, true);
  const declaredLength = header.getUint32(8, true);
  if (!hasMagic || version !== 2 || declaredLength !== bytes.byteLength) {
    throw new Error("[fal] 3D primary asset was not a GLB 2.0 file");
  }
}

function falFileSize(file: FalFile): number | undefined {
  if (file.file_size === undefined) return undefined;
  if (!Number.isSafeInteger(file.file_size) || file.file_size < 0) {
    throw new Error("[fal] 3D model_glb.file_size was invalid");
  }
  return file.file_size;
}

function falInput(request: ThreeDGenerateRequest): Record<string, unknown> {
  switch (request.model_id) {
    case "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d":
      if (!request.prompt) throw new Error("text-to-3D requires a prompt");
      return { prompt: request.prompt };
    case "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d":
      if (!request.image) throw new Error("image-to-3D requires an image");
      return { input_image_url: imageDataUrl(request.image) };
    case "fal-ai/trellis-2":
      if (!request.image) throw new Error("image-to-3D requires an image");
      return { image_url: imageDataUrl(request.image) };
    default:
      return assertNever(request.model_id);
  }
}

function imageDataUrl(image: { base64: string; media_type: string }): string {
  return `data:${image.media_type};base64,${image.base64}`;
}

function assertNever(value: never): never {
  throw new Error(`unsupported 3D model: ${String(value)}`);
}
