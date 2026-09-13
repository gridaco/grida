// GRIDA-SEC-006 / GRIDA-SEC-012 — fixed GG bearer binding; no account or cookie fallback.
// GRIDA-GG: gateway — bounded 3D feature requests and streamed model results.
import "server-only";
import { catalog } from "@grida/ai-models/grida";
import { verifyGgToken } from "../auth/gg-token";
import { ggUploads } from "../gg/uploads";
import { GgThreeD } from "../ai/gg-three-d";
import { allowAiRequest } from "../ai/openai-compat/limits";
import {
  fromUnknownError,
  invalidRequest,
  rateLimited,
} from "../ai/openai-compat/errors";
import { apiOperations } from "./operations";

/** Routes select a registered operation; they cannot replace authentication or execution. */
export namespace ggMediaApi {
  type Operation =
    | "gg.3d.uploads"
    | "gg.3d.model-generation"
    | "gg.3d.rig-check"
    | "gg.3d.rigging";
  const operations: readonly Operation[] = [
    "gg.3d.uploads",
    "gg.3d.model-generation",
    "gg.3d.rig-check",
    "gg.3d.rigging",
  ];
  const headers = {
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  };

  export function bind(operation: Operation) {
    if (!operations.includes(operation))
      throw new Error("Invalid GG media binding.");
    const definition = apiOperations.definitions[operation];
    if (
      definition.binding !== "gg-media" ||
      definition.authority !== "gg" ||
      definition.cache !== "no-store"
    )
      throw new Error("Invalid GG media binding.");
    const allow = definition.methods.join(", ");
    const handle = async (request: Request): Promise<Response> => {
      let response: Response;
      try {
        const url = new URL(request.url);
        if (url.pathname !== definition.path || url.search)
          throw new InputFailure();
        if (request.method === "OPTIONS") {
          await readBody(request, 0);
          return new Response(null, {
            status: 204,
            headers: { ...headers, allow },
          });
        }
        if (request.method !== "POST") {
          return new Response(
            request.method === "HEAD"
              ? null
              : JSON.stringify({
                  error: {
                    code: "method_not_allowed",
                    message: "This method is not allowed.",
                  },
                }),
            {
              status: 405,
              headers: {
                ...headers,
                allow,
                "content-type": "application/json",
              },
            }
          );
        }
        const claims = await verifyGgToken(request);
        const rate = await allowAiRequest(
          operation === "gg.3d.uploads"
            ? "three-d-upload"
            : operation === "gg.3d.rig-check"
              ? "three-d-check"
              : "three-d",
          claims.sub
        );
        if (!rate.success) {
          const limited = rateLimited(rate.retryAfterSeconds);
          for (const [key, value] of Object.entries(headers))
            limited.headers.set(key, value);
          return limited;
        }
        const type = request.headers.get("content-type") ?? "";
        if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(type))
          throw new InputFailure();
        let value: unknown;
        try {
          value = JSON.parse(await readBody(request, 64 * 1024));
        } catch {
          throw new InputFailure();
        }
        const body = object(value);
        if (operation === "gg.3d.uploads") {
          const info = ggUploads.metadata(body);
          const prepared = await GgThreeD.preparePresign(
            claims.org,
            info.media_type
          );
          const upload_url = ggUploads.uploadUrl(prepared.upload_url);
          const upload = await ggUploads.sign(claims, {
            ...info,
            file_token: prepared.file_token,
          });
          response = Response.json({ upload_url, upload }, { headers });
        } else if (operation === "gg.3d.model-generation") {
          exact(body, ["model_id", "variant", "input"]);
          if (
            typeof body.model_id !== "string" ||
            !catalog.three_d.model_generation.is_model_id(body.model_id) ||
            typeof body.variant !== "string" ||
            !["text", "image", "multiview"].includes(body.variant)
          )
            throw new InputFailure();
          const input = { ...object(body.input) };
          if (body.variant === "image")
            input.image = await reference(claims, input.image, "image");
          else if (body.variant === "multiview") {
            const images = object(input.images);
            if (
              Object.keys(images).some(
                (key) => !["front", "left", "back", "right"].includes(key)
              )
            )
              throw new InputFailure();
            const prepared: Record<string, unknown> = {};
            for (const [view, image] of Object.entries(images))
              prepared[view] = await reference(claims, image, "image");
            input.images = prepared;
          }
          const generated = await GgThreeD.modelGenerate(
            claims.org,
            body.model_id,
            body.variant as catalog.three_d.model_generation.InputVariant,
            input
          );
          response = modelResponse(
            {
              model_id: body.model_id,
              feature: "model-generation",
              variant: body.variant,
            },
            generated
          );
        } else if (operation === "gg.3d.rig-check") {
          exact(body, ["input"]);
          const input = object(body.input);
          exact(input, ["mesh"]);
          const result = await GgThreeD.check(claims.org, {
            mesh: await reference(claims, input.mesh, "mesh"),
          });
          response = Response.json(
            { feature: "rig-check", provider_id: "gg", ...result },
            { headers }
          );
        } else {
          exact(body, ["model_id", "input"]);
          if (
            typeof body.model_id !== "string" ||
            !catalog.three_d.rigging.is_model_id(body.model_id)
          )
            throw new InputFailure();
          const input = { ...object(body.input) };
          input.mesh = await reference(claims, input.mesh, "mesh");
          const generated = await GgThreeD.rig(
            claims.org,
            body.model_id,
            input
          );
          response = modelResponse(
            { model_id: body.model_id, feature: "rigging" },
            generated
          );
        }
      } catch (error) {
        if (
          error instanceof InputFailure ||
          (error instanceof ggUploads.Failure &&
            error.code === "invalid_upload")
        )
          response = invalidRequest(
            "Invalid input or expired upload. Select the source file again and retry."
          );
        else if (error instanceof GgThreeD.Failure) {
          const status = {
            invalid_request: 400,
            model_unavailable: 400,
            provider_unavailable: 503,
            usage_unavailable: 502,
            invalid_response: 502,
            generation_failed: 502,
            aborted: 499,
            timeout: 504,
          }[error.code];
          response = Response.json(
            {
              error: {
                code: error.code,
                message: error.message,
                ...(error.task_id ? { task_id: error.task_id } : {}),
              },
            },
            { status, headers }
          );
        } else if (error instanceof ggUploads.Failure)
          response = Response.json(
            {
              error: {
                code: "not_configured",
                message: "Hosted 3D is not configured.",
              },
            },
            { status: 503, headers }
          );
        else response = fromUnknownError(error, "v1/ai/3d");
      }
      for (const [key, value] of Object.entries(headers))
        response.headers.set(key, value);
      if (request.method === "HEAD" || request.method === "OPTIONS")
        return new Response(null, {
          status: response.status,
          headers: response.headers,
        });
      return response;
    };
    return Object.freeze({
      GET: handle,
      HEAD: handle,
      OPTIONS: handle,
      POST: handle,
      PUT: handle,
      PATCH: handle,
      DELETE: handle,
    });
  }

  async function reference(
    owner: ggUploads.Owner,
    value: unknown,
    type: "image" | "mesh"
  ) {
    const file = await ggUploads.verify(owner, value, type);
    return { file_token: file.file_token, media_type: file.media_type };
  }

  /** Stream base64 in aligned chunks; large GLBs never become one oversized function payload. */
  function modelResponse(
    descriptor: Record<string, unknown>,
    result: Awaited<ReturnType<typeof GgThreeD.modelGenerate>>
  ): Response {
    const encoder = new TextEncoder();
    const data = result.glb.data;
    let offset = 0;
    let started = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!started) {
          started = true;
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                ...descriptor,
                provider_id: "gg",
                task: result.task,
              }).slice(0, -1) +
                ',"glb":{"media_type":"model/gltf-binary","base64":"'
            )
          );
        } else if (offset < data.length) {
          // A multiple of three preserves base64 concatenation without intermediate padding.
          const end = Math.min(data.length, offset + 3 * 64 * 1024);
          controller.enqueue(
            encoder.encode(
              Buffer.from(
                data.buffer,
                data.byteOffset + offset,
                end - offset
              ).toString("base64")
            )
          );
          offset = end;
        } else {
          controller.enqueue(encoder.encode('"}}'));
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: { ...headers, "content-type": "application/json" },
    });
  }

  class InputFailure extends Error {}
  function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new InputFailure();
    return value as Record<string, unknown>;
  }
  function exact(value: Record<string, unknown>, keys: string[]) {
    if (
      Object.keys(value).length !== keys.length ||
      Object.keys(value).some((key) => !keys.includes(key))
    )
      throw new InputFailure();
  }
  async function readBody(request: Request, maximum: number): Promise<string> {
    const length = request.headers.get("content-length");
    const encoding = request.headers.get("content-encoding");
    if (
      (encoding !== null && encoding !== "identity") ||
      (length !== null &&
        (!/^(?:0|[1-9]\d*)$/.test(length) ||
          Number(length) > maximum ||
          request.headers.has("transfer-encoding")))
    )
      throw new InputFailure();
    if (!request.body) {
      if (maximum === 0) return "";
      throw new InputFailure();
    }
    const reader = request.body.getReader();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          const bytes = new Uint8Array(maximum);
          let size = 0;
          let reads = 0;
          for (;;) {
            if (reads++ > 0 && reads % 64 === 0)
              await new Promise((resolve) => setTimeout(resolve, 0));
            const { done, value } = await reader.read();
            if (done) break;
            if (size + value.byteLength > maximum) throw new InputFailure();
            bytes.set(value, size);
            size += value.byteLength;
          }
          if (length !== null && Number(length) !== size)
            throw new InputFailure();
          return new TextDecoder("utf-8", { fatal: true }).decode(
            bytes.subarray(0, size)
          );
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new InputFailure()), 1000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
}
