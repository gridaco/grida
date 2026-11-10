// GRIDA-SEC-004 / GRIDA-SEC-014 — bounded media requests from a supervised agent.
import { createHash } from "node:crypto";
import type { ImageGenerateRequest } from "@grida/agent";
import { catalog } from "@grida/ai/catalogue";

type Provider = "openrouter" | "vercel";
type Request = (init: RequestInit) => Promise<Response>;
type CredentialProof = { nonce: string; proof: string };
type Reply =
  | {
      kind: "retained";
      id: string;
      mediaType: string;
      bytes: number;
      sha256?: string;
    }
  | { kind: "unavailable" | "generated_unretained" | "uncertain" };

const ID = /^[A-Za-z0-9_.:@/-]{1,256}$/;
const MEDIA_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RECEIPT_TYPE = "application/vnd.grida.retained-image+json";
const MAX_RESPONSE_BYTES = 16 * 1024;
const MAX_IMAGE_BYTES = 64 * 1024 * 1024;
const MAX_PROMPT_BYTES = 8 * 1024;
const MAX_REFERENCE_BYTES = 256 * 1024;
const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");
const MAX_CALLS = 1024;
const DEADLINE_MS = 120_000;

const mediaNames = {
  "image/png": "image-1.png",
  "image/jpeg": "image-1.jpg",
  "image/webp": "image-1.webp",
  "image/gif": "image-1.gif",
} as const;

/** One captured media route and one outstanding generation per native worker. */
export class NativeImageGeneration {
  static readonly capability = "co.grida/media/generate-image";
  static readonly method = `_${this.capability}`;
  static readonly referenceCapability = "co.grida/media/image-reference";
  readonly binding: string;
  private readonly calls = new Set<string>();
  private readonly lifetime = new AbortController();
  private active?: { id: number | string; abort: AbortController };

  private constructor(
    readonly endpoint: string,
    private readonly provider: Provider,
    private readonly model: string,
    private readonly mediaBinding: string,
    private readonly supportsBackground: boolean,
    readonly supportsReference: boolean,
    private readonly request: Request
  ) {
    this.binding = createHash("sha256")
      .update(
        JSON.stringify([
          "desktop-image-generation-v1",
          provider,
          model,
          mediaBinding,
          supportsBackground,
        ])
      )
      .digest("hex");
  }

  static forByok(provider: Provider, endpoint: string, request: Request) {
    const model = catalog.image.default_id;
    if (!model) return undefined;
    const card = catalog.image.findImageModelCard(model);
    if (!card?.listed) return undefined;
    const binding = catalog.image.binding(card, provider);
    if (!binding) return undefined;
    return new NativeImageGeneration(
      endpoint,
      provider,
      model,
      binding.id,
      catalog.image.supportsTransparentBackground(card, provider),
      // A reference may only reuse the exact paid route captured at admission.
      binding.references?.id === binding.id,
      request
    );
  }

  close(): void {
    this.lifetime.abort();
  }

  cancel(id: unknown): void {
    const active = this.active;
    if (active && active.id === id) active.abort.abort();
  }

  async generate(
    id: number | string,
    value: unknown,
    referenceNegotiated = false,
    placementNegotiated = false
  ): Promise<Reply> {
    const params = record(value);
    if (!params) return { kind: "unavailable" };
    const { sessionId, callId, prompt, background, referencePng } = params;
    const credential = credentialProof(params.credential);
    if (
      this.lifetime.signal.aborted ||
      this.active ||
      this.calls.size >= MAX_CALLS ||
      !credential ||
      Object.keys(params).length !==
        4 +
          Number(background !== undefined) +
          Number(referencePng !== undefined) ||
      typeof sessionId !== "string" ||
      !ID.test(sessionId) ||
      typeof callId !== "string" ||
      !ID.test(callId) ||
      typeof prompt !== "string" ||
      !prompt.trim() ||
      Buffer.byteLength(prompt) > MAX_PROMPT_BYTES ||
      (referencePng !== undefined &&
        (!referenceNegotiated ||
          !this.supportsReference ||
          !isBoundedPng(referencePng))) ||
      (background !== undefined &&
        background !== "auto" &&
        !(
          this.supportsBackground &&
          (background === "opaque" || background === "transparent")
        ))
    )
      return { kind: "unavailable" };
    const identity = JSON.stringify([sessionId, callId]);
    if (this.calls.has(identity)) return { kind: "uncertain" };

    const abort = new AbortController();
    this.active = { id, abort };
    this.calls.add(identity);
    const signal = AbortSignal.any([
      this.lifetime.signal,
      abort.signal,
      AbortSignal.timeout(DEADLINE_MS),
    ]);
    const body: ImageGenerateRequest & {
      binding_id: string;
      credential: CredentialProof;
      reference_png?: string;
      receipt_sha256?: true;
    } = {
      model_id: this.model,
      binding_id: this.mediaBinding,
      provider: this.provider,
      prompt,
      n: 1,
      credential,
      ...(background && { background }),
      ...(typeof referencePng === "string" && { reference_png: referencePng }),
      ...(placementNegotiated && { receipt_sha256: true }),
    };
    try {
      const response = await this.request({
        method: "POST",
        headers: {
          accept: RECEIPT_TYPE,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        redirect: "error",
        signal,
      });
      signal.throwIfAborted();
      if (response.status !== 200) {
        await response.body?.cancel();
        return { kind: response.status === 400 ? "unavailable" : "uncertain" };
      }
      const result = await readReceipt(response);
      signal.throwIfAborted();
      if (
        result?.model_id !== this.model ||
        result.provider_id !== this.provider
      )
        return { kind: "uncertain" };
      if (result.stored_media === null && Object.keys(result).length === 3)
        return { kind: "generated_unretained" };
      if (Object.keys(result).length !== (placementNegotiated ? 4 : 3))
        return { kind: "uncertain" };
      const item = retained(result.stored_media);
      if (
        !item ||
        (placementNegotiated &&
          (typeof result.sha256 !== "string" ||
            !/^[a-f0-9]{64}$/.test(result.sha256)))
      )
        return { kind: "uncertain" };
      return {
        ...item,
        ...(placementNegotiated &&
          typeof result.sha256 === "string" && { sha256: result.sha256 }),
      };
    } catch {
      return { kind: "uncertain" };
    } finally {
      this.active = undefined;
    }
  }
}

function isBoundedPng(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > Math.ceil(MAX_REFERENCE_BYTES / 3) * 4
  )
    return false;
  const bytes = Buffer.from(value, "base64");
  return (
    bytes.length >= 45 &&
    bytes.length <= MAX_REFERENCE_BYTES &&
    bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) &&
    bytes.toString("base64") === value
  );
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function credentialProof(value: unknown): CredentialProof | undefined {
  const witness = record(value);
  if (
    !witness ||
    Object.keys(witness).length !== 2 ||
    typeof witness.nonce !== "string" ||
    !/^[a-f0-9]{32}$/.test(witness.nonce) ||
    typeof witness.proof !== "string" ||
    !/^[a-f0-9]{64}$/.test(witness.proof)
  )
    return undefined;
  return { nonce: witness.nonce, proof: witness.proof };
}

async function readReceipt(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return undefined;
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const json = new TextDecoder("utf-8", { fatal: true }).decode(
    Buffer.concat(chunks, bytes)
  );
  return record(JSON.parse(json));
}

function retained(
  value: unknown
): Extract<Reply, { kind: "retained" }> | undefined {
  const item = record(value);
  if (!item) return undefined;
  const { id, file_name, media_type, byte_size, created_at } = item;
  if (
    Object.keys(item).length !== 5 ||
    typeof id !== "string" ||
    !MEDIA_ID.test(id) ||
    typeof media_type !== "string" ||
    !Object.hasOwn(mediaNames, media_type) ||
    file_name !== mediaNames[media_type as keyof typeof mediaNames] ||
    typeof byte_size !== "number" ||
    !Number.isSafeInteger(byte_size) ||
    byte_size < 1 ||
    byte_size > MAX_IMAGE_BYTES ||
    typeof created_at !== "number" ||
    !Number.isSafeInteger(created_at) ||
    created_at < 0
  )
    return undefined;
  return { kind: "retained", id, mediaType: media_type, bytes: byte_size };
}
