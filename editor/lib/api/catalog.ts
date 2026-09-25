// GRIDA-SEC-012 — fixed public data binding; no identity or provider execution.
// GRIDA-GG: gateway — versioned published catalog, not permission to spend.
import { createHash } from "node:crypto";
import { catalog } from "@grida/ai-models/grida";
import { apiOperations } from "./operations";

export namespace catalogApi {
  const snapshot = catalog.snapshot.v2.seed();
  const version = createHash("sha256")
    .update(JSON.stringify(snapshot))
    .digest("hex")
    .slice(0, 16);
  const body = JSON.stringify({ ...snapshot, version });
  const headers = {
    "content-type": "application/json",
    "cache-control":
      "public, max-age=300, s-maxage=300, stale-while-revalidate=3600",
    "content-length": String(Buffer.byteLength(body)),
    "x-content-type-options": "nosniff",
  };

  /** One fixed public operation. Routes cannot inject data or authority. */
  export function bind(operation: "models.catalog.v2") {
    if (operation !== "models.catalog.v2")
      throw new Error("Invalid catalog binding.");
    const definition = apiOperations.definitions[operation];
    if (
      definition.authority !== "public" ||
      definition.binding !== "catalog" ||
      definition.cache !== "public"
    ) {
      throw new Error("Invalid catalog binding.");
    }
    const allow = definition.methods.join(", ");
    const reject = (status: number, code: string, head: boolean) =>
      new Response(head ? null : JSON.stringify({ error: { code } }), {
        status,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
          allow,
        },
      });
    const handle = async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      const head = request.method === "HEAD";
      if (url.pathname !== definition.path)
        return reject(404, "not_found", head);
      if (!(definition.methods as readonly string[]).includes(request.method)) {
        return reject(405, "method_not_allowed", head);
      }
      if (
        url.search ||
        ![null, "0"].includes(request.headers.get("content-length")) ||
        !(await emptyBody(request))
      )
        return reject(400, "invalid_request", head);
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: { allow, "cache-control": "no-store" },
        });
      }
      return new Response(head ? null : body, { headers });
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

  /** Next may expose an empty OPTIONS stream. Peek with a fixed deadline; never buffer input. */
  async function emptyBody(request: Request): Promise<boolean> {
    if (!request.body) return true;
    const reader = request.body.getReader();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        reader.read(),
        new Promise<undefined>((resolve) => {
          timer = setTimeout(() => resolve(undefined), 1000);
        }),
      ]);
      return result?.done === true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
      void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
}
