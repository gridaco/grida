// GRIDA-SEC-010 / GRIDA-SEC-012 — account operations bind authentication and HTTP policy.
import "server-only";
import { bearer } from "../auth/bearer";
import { oauthServer } from "../auth/oauth-server";
import { apiOperations } from "./operations";

/** Fixed account adapter. Routes select an operation, never supply authority. */
export namespace accountApi {
  type Method =
    | "GET"
    | "HEAD"
    | "OPTIONS"
    | "POST"
    | "PUT"
    | "PATCH"
    | "DELETE";
  type Handler = (request: Request) => Promise<Response>;

  export function bind(
    operation: "auth.me"
  ): Readonly<Record<Method, Handler>> {
    const definition = apiOperations.definitions[operation];
    if (
      operation !== "auth.me" ||
      !definition ||
      definition.authority !== "native-account" ||
      definition.binding !== "account" ||
      definition.cache !== "no-store"
    ) {
      throw new Error("Invalid account API binding.");
    }
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
            {
              status: 405,
              headers: { ...oauthServer.responseHeaders, allow },
            }
          );
        } else {
          const url = new URL(request.url);
          if (url.pathname !== definition.path || url.search) {
            throw new oauthServer.Failure("invalid_request");
          }
          await requireEmptyBody(request);
          if (request.method === "OPTIONS") {
            response = new Response(null, {
              status: 204,
              headers: { ...oauthServer.responseHeaders, allow },
            });
          } else {
            const { identity } = await bearer.authenticate(request);
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
            ) {
              throw new oauthServer.Failure("auth_unavailable");
            }
            response = Response.json(
              {
                id: identity.id,
                email: identity.email,
                display_name: identity.display_name,
              },
              { headers: oauthServer.responseHeaders }
            );
          }
        }
      } catch (error) {
        response = oauthServer.errorResponse(error);
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

  async function requireEmptyBody(request: Request): Promise<void> {
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
