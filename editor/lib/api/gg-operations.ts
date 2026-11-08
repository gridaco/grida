// GRIDA-SEC-006 / GRIDA-SEC-012 — one fixed organization-scoped GG bridge.
import "server-only";
import { randomUUID } from "node:crypto";
import { verifyGgToken } from "../auth/gg-token";
import { gatewayFetch } from "../ai/gateway-product";
import { hostedDiscovery } from "../ai/openai-compat/hosted-models";
import { allowAiRequest } from "../ai/openai-compat/limits";
import {
  fromUnknownError,
  invalidRequest,
  rateLimited,
} from "../ai/openai-compat/errors";
import { apiOperations } from "./operations";

/** Current discovery chooses the route; request data never chooses an origin or account. */
export namespace ggOperationsApi {
  type Operation = "gg.operations" | "gg.jobs";
  const headers = {
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  };
  const MAX_INPUT = 3 * 1024 * 1024;
  const MAX_OUTPUT = 128 * 1024 * 1024;
  export function bind(operation: Operation) {
    const definition = apiOperations.definitions[operation];
    if (
      !definition ||
      definition.binding !== "gg-operations" ||
      definition.authority !== "gg" ||
      definition.cache !== "no-store"
    )
      throw new Error("Invalid GG operation binding.");
    const handle = async (request: Request): Promise<Response> => {
      try {
        const url = new URL(request.url);
        if (url.pathname !== definition.path) throw new InputFailure();
        if (request.method === "OPTIONS") {
          if (url.search) throw new InputFailure();
          await readBody(request, 0);
          return new Response(null, {
            status: 204,
            headers: { ...headers, allow: definition.methods.join(", ") },
          });
        }
        const expected = operation === "gg.jobs" ? "GET" : "POST";
        if (request.method !== expected)
          return Response.json(
            {
              error: {
                code: "method_not_allowed",
                message: "This method is not allowed.",
              },
            },
            {
              status: 405,
              headers: { ...headers, allow: definition.methods.join(", ") },
            }
          );
        const claims = await verifyGgToken(request);
        const admission = await allowAiRequest("models", claims.sub);
        if (!admission.success) return rateLimited(admission.retryAfterSeconds);
        const context = {
          organizationId: claims.org,
          feature: "native/ai/operations",
        };
        let upstream: Response;
        if (operation === "gg.jobs") {
          const entries = [...url.searchParams.entries()];
          if (
            entries.length !== 1 ||
            entries[0][0] !== "request_id" ||
            !/^req_[A-Za-z0-9_-]{1,160}$/.test(entries[0][1])
          )
            throw new InputFailure();
          await readBody(request, 0);
          // Accepted work is always retrievable, even if its model was retired.
          upstream = await gatewayFetch(context, `/v1/jobs/${entries[0][1]}`, {
            method: "GET",
            signal: request.signal,
          });
        } else {
          if (
            url.search ||
            !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
              request.headers.get("content-type") ?? ""
            )
          )
            throw new InputFailure();
          let value: unknown;
          try {
            value = JSON.parse(await readBody(request, MAX_INPUT));
          } catch {
            throw new InputFailure();
          }
          if (
            !record(value) ||
            Object.keys(value).length !== 2 ||
            !Object.hasOwn(value, "operation_id") ||
            !Object.hasOwn(value, "input") ||
            typeof value.operation_id !== "string" ||
            value.operation_id.length > 200 ||
            !record(value.input)
          )
            throw new InputFailure();
          const discovery = hostedDiscovery();
          const snapshot = await discovery.ready();
          if (!snapshot)
            return Response.json(
              {
                error: {
                  code: "catalogue_unavailable",
                  message: "Model discovery is temporarily unavailable.",
                },
              },
              { status: 503, headers }
            );
          const selected = snapshot.operations.find(
            (item) => item.id === value.operation_id
          );
          if (!selected) throw new InputFailure();
          const rate = await allowAiRequest(
            selected.kind === "image"
              ? "images"
              : selected.kind === "video"
                ? "video"
                : selected.kind === "music"
                  ? "music"
                  : "three-d",
            claims.sub
          );
          if (!rate.success) return rateLimited(rate.retryAfterSeconds);
          let input = value.input;
          if (
            selected.path === "/v1/images/generations" ||
            selected.path === "/v1/videos"
          ) {
            if (
              Object.hasOwn(input, "model") &&
              input.model !== selected.model_id
            )
              throw new InputFailure();
            input = { ...input, model: selected.model_id };
          }
          // GG validates canonical inputs and owns all authorization, reservations and charging.
          upstream = await gatewayFetch(
            context,
            selected.path,
            {
              method: "POST",
              body: JSON.stringify(input),
              signal: request.signal,
            },
            randomUUID()
          );
        }
        return forward(upstream);
      } catch (error) {
        const response =
          error instanceof InputFailure
            ? invalidRequest("Invalid AI operation request.")
            : fromUnknownError(error, "ai/operations");
        for (const [key, value] of Object.entries(headers))
          response.headers.set(key, value);
        return response;
      }
    };
    return {
      GET: handle,
      HEAD: handle,
      OPTIONS: handle,
      POST: handle,
      PUT: handle,
      PATCH: handle,
      DELETE: handle,
    };
  }
  function record(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }
  class InputFailure extends Error {}
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
      if (maximum === 0 && (!length || length === "0")) return "";
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
            if (++reads % 64 === 0)
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
  function forward(upstream: Response): Response {
    if (
      ![200, 202].includes(upstream.status) ||
      !upstream.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json") ||
      !upstream.body
    )
      throw new Error("Invalid GG response");
    const reader = upstream.body.getReader();
    let total = 0;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            reader.releaseLock();
            return;
          }
          total += value.byteLength;
          if (total > MAX_OUTPUT)
            throw new Error("AI response exceeded its limit.");
          controller.enqueue(value);
        } catch (error) {
          await reader.cancel().catch(() => {});
          controller.error(error);
        }
      },
      async cancel() {
        await reader.cancel().catch(() => {});
      },
    });
    const output = new Headers({
      ...headers,
      "content-type": "application/json",
    });
    const requestId = upstream.headers.get("x-request-id");
    if (requestId && /^req_[A-Za-z0-9_-]{1,160}$/.test(requestId))
      output.set("x-request-id", requestId);
    return new Response(stream, { status: upstream.status, headers: output });
  }
}
