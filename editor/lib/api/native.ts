// GRIDA-SEC-010 / GRIDA-SEC-012 — one native account credential and HTTP boundary.
import "server-only";
import { bearer } from "../auth/bearer";
import { oauthServer } from "../auth/oauth-server";
import { apiOperations } from "./operations";

/** Internal adapter for fixed native bindings; routes cannot supply callbacks. */
export namespace nativeApi {
  type Method =
    | "GET"
    | "HEAD"
    | "OPTIONS"
    | "POST"
    | "PUT"
    | "PATCH"
    | "DELETE";
  type Handler = (request: Request) => Promise<Response>;
  export type Context = Readonly<{
    identity: { id: string; email: string | null; display_name: string | null };
    authorization: string;
    config: oauthServer.Config;
    fetcher: typeof fetch;
  }>;

  export class Failure extends Error {
    readonly status: number;
    constructor(readonly code: "rate_limited" | "not_configured") {
      super(
        code === "rate_limited"
          ? "Too many access requests. Try again later."
          : "Gateway access is not configured."
      );
      this.name = "NativeApiFailure";
      this.status = code === "rate_limited" ? 429 : 503;
    }
  }

  export function bind<Input>(
    operation: apiOperations.Id,
    binding: "account" | "gg",
    parse: (request: Request) => Promise<Input>,
    execute: (input: Input, context: Context) => Promise<unknown>
  ): Readonly<Record<Method, Handler>> {
    const definition = apiOperations.definitions[operation];
    if (
      !definition ||
      definition.authority !== "native-account" ||
      definition.binding !== binding ||
      definition.cache !== "no-store"
    )
      throw new Error("Invalid native API binding.");
    const allowed = new Set<string>(definition.methods);
    const allow = definition.methods.join(", ");
    const handle: Handler = async (request) => {
      let response: Response;
      try {
        if (!allowed.has(request.method)) {
          response = Response.json(
            {
              error: {
                code: "method_not_allowed",
                message: "This method is not allowed.",
              },
            },
            { status: 405, headers: { ...oauthServer.responseHeaders, allow } }
          );
        } else {
          if (new URL(request.url).pathname !== definition.path)
            throw new oauthServer.Failure("invalid_request");
          const input = await parse(request);
          if (request.method === "OPTIONS") {
            response = new Response(null, {
              status: 204,
              headers: { ...oauthServer.responseHeaders, allow },
            });
          } else {
            const config = oauthServer.config();
            const fetcher = globalThis.fetch;
            const authorization = request.headers.get("authorization") ?? "";
            const { identity } = await bearer.authenticate(request, {
              config,
              fetch: fetcher,
            });
            if (
              !oauthServer.record(identity) ||
              !oauthServer.uuid(identity.id) ||
              !(
                identity.email === null || typeof identity.email === "string"
              ) ||
              !(
                identity.display_name === null ||
                typeof identity.display_name === "string"
              )
            )
              throw new oauthServer.Failure("auth_unavailable");
            const safeIdentity = {
              id: identity.id,
              email: identity.email,
              display_name: identity.display_name,
            };
            const result = await execute(input, {
              identity: safeIdentity,
              authorization,
              config,
              fetcher,
            });
            response = Response.json(result, {
              headers: oauthServer.responseHeaders,
            });
          }
        }
      } catch (error) {
        response =
          error instanceof Failure
            ? Response.json(
                { error: { code: error.code, message: error.message } },
                { status: error.status, headers: oauthServer.responseHeaders }
              )
            : oauthServer.errorResponse(error);
      }
      if (request.method === "HEAD" || request.method === "OPTIONS") {
        const headers = new Headers(response.headers);
        if (request.method === "OPTIONS") headers.set("allow", allow);
        return new Response(null, { status: response.status, headers });
      }
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

  export async function emptyBody(request: Request): Promise<void> {
    const length = request.headers.get("content-length");
    if (
      (length !== null && length !== "0") ||
      request.headers.has("transfer-encoding")
    ) {
      throw new oauthServer.Failure("invalid_request");
    }
    // Next can expose an empty stream even for a bodyless OPTIONS request.
    // Require EOF rather than a null stream; never drain an actual payload or
    // wait indefinitely for an unfinished request to prove that it is empty.
    if (!request.body) return;
    const reader = request.body.getReader();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        (async () => {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) return;
            if (value.byteLength > 0)
              throw new oauthServer.Failure("invalid_request");
          }
        })(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new oauthServer.Failure("invalid_request")),
            1000
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
      void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
}
