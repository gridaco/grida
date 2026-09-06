// GRIDA-SEC-010 / GRIDA-SEC-012 — native account reads retain the caller's RLS authority.
import "server-only";
import { account } from "../account/account";
import { oauthServer } from "../auth/oauth-server";

/** Fixed account queries. No cookie client, service role, RPC or session storage. */
export namespace accountData {
  /** The HTTP adapter must authenticate this exact Authorization value first. */
  export function forBearer(
    authorization: string,
    config: oauthServer.Config,
    fetcher: typeof fetch = globalThis.fetch
  ): account.Source {
    if (
      !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/i.test(
        authorization
      ) ||
      authorization.length > 16_384
    ) {
      throw new oauthServer.Failure("unauthorized");
    }
    const origin = config.issuer.slice(0, -"/auth/v1".length);
    return Object.freeze({
      async organizations(after?: number) {
        if (after !== undefined && !account.validCursor(after))
          throw new account.Unavailable();
        const url = new URL("/rest/v1/organization", origin);
        url.searchParams.set("select", "id,name,display_name");
        url.searchParams.set("order", "id.asc");
        url.searchParams.set("limit", String(account.pageSize));
        if (after !== undefined) url.searchParams.set("id", `gt.${after}`);
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
          throw new account.Unavailable();
        }
        if (response.redirected || ![200, 206].includes(response.status)) {
          await response.body?.cancel().catch(() => undefined);
          if (response.status === 401)
            throw new oauthServer.Failure("unauthorized");
          if (response.status === 403)
            throw new oauthServer.Failure("forbidden");
          throw new account.Unavailable();
        }
        try {
          // Exact count prevents a lower PostgREST max_rows setting from making
          // a truncated list look complete. Count and rows share RLS authority.
          const range = /^(?:(0)-(\d+)|\*)\/(\d+)$/.exec(
            response.headers.get("content-range") ?? ""
          );
          const contentType = response.headers.get("content-type") ?? "";
          if (!range || !/^application\/json(?:;|$)/i.test(contentType))
            throw new account.Unavailable();
          const rows: unknown = JSON.parse(
            await oauthServer.readText(response, 64 * 1024)
          );
          const total = Number(range[3]);
          if (
            !Array.isArray(rows) ||
            !Number.isSafeInteger(total) ||
            (rows.length === 0
              ? range[1] !== undefined || total !== 0
              : range[1] !== "0" || Number(range[2]) !== rows.length - 1)
          ) {
            throw new account.Unavailable();
          }
          return { rows, total };
        } catch {
          await response.body?.cancel().catch(() => undefined);
          throw new account.Unavailable();
        }
      },
    });
  }
}
