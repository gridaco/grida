// GRIDA-SEC-010 / GRIDA-SEC-012 — shared bounded REST reads with the verified caller's authority.
import "server-only";
import { oauthServer } from "../auth/oauth-server";

/** Internal transport for fixed public-schema sources, never a credential or URL API. */
export namespace nativeData {
  export function forBearer(
    authorization: string,
    config: Pick<oauthServer.Config, "dataOrigin" | "publishableKey">,
    fetcher: typeof fetch = globalThis.fetch
  ) {
    if (
      !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/i.test(
        authorization
      ) ||
      authorization.length > 16_384
    ) {
      throw new oauthServer.Failure("unauthorized");
    }
    return Object.freeze({
      async page(
        table: "organization" | "organization_member" | "v_billing_credits",
        query: Readonly<Record<string, string>>
      ): Promise<{ rows: unknown[]; total: number }> {
        if (
          ![
            "organization",
            "organization_member",
            "v_billing_credits",
          ].includes(table)
        )
          throw new oauthServer.Failure("invalid_request");
        const url = new URL(`/rest/v1/${table}`, config.dataOrigin);
        for (const [key, value] of Object.entries(query))
          url.searchParams.set(key, value);
        let response: Response;
        try {
          response = await fetcher(url.href, {
            method: "GET",
            headers: {
              apikey: config.publishableKey,
              authorization,
              accept: "application/json",
              "accept-profile": "public",
              prefer: "count=exact",
            },
            redirect: "error",
            credentials: "omit",
            cache: "no-store",
            signal: AbortSignal.timeout(10_000),
          });
        } catch {
          throw new oauthServer.Failure("auth_unavailable");
        }
        if (response.redirected || ![200, 206].includes(response.status)) {
          await response.body?.cancel().catch(() => undefined);
          if (response.status === 401)
            throw new oauthServer.Failure("unauthorized");
          if (response.status === 403)
            throw new oauthServer.Failure("forbidden");
          throw new oauthServer.Failure("auth_unavailable");
        }
        try {
          // Exact count prevents a lower PostgREST max_rows setting from making
          // a truncated list look complete. Count and rows share RLS authority.
          const range = /^(?:(0)-(\d+)|\*)\/(\d+)$/.exec(
            response.headers.get("content-range") ?? ""
          );
          const contentType = response.headers.get("content-type") ?? "";
          if (!range || !/^application\/json(?:;|$)/i.test(contentType))
            throw new oauthServer.Failure("auth_unavailable");
          const rows: unknown = JSON.parse(
            await oauthServer.readText(response, 64 * 1024)
          );
          const total = Number(range[3]);
          if (
            !Array.isArray(rows) ||
            !Number.isSafeInteger(total) ||
            total < rows.length ||
            (rows.length === 0
              ? range[1] !== undefined || total !== 0
              : range[1] !== "0" || Number(range[2]) !== rows.length - 1)
          ) {
            throw new oauthServer.Failure("auth_unavailable");
          }
          return { rows, total };
        } catch {
          await response.body?.cancel().catch(() => undefined);
          throw new oauthServer.Failure("auth_unavailable");
        }
      },
    });
  }
}
