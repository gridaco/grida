// GRIDA-EE: billing — passive cache reads, never provider reconciliation.
// GRIDA-SEC-010 / GRIDA-SEC-012 — retain the verified caller's RLS authority.
import "server-only";
import { oauthServer } from "../auth/oauth-server";

/** Fixed read-only credit projection. No privileged or browser client. */
export namespace creditsData {
  /** Authenticate this exact Authorization value before constructing the source. */
  export function forBearer(
    authorization: string,
    config: oauthServer.Config,
    fetcher: typeof fetch = globalThis.fetch
  ) {
    if (
      !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/i.test(
        authorization
      ) ||
      authorization.length > 16_384
    )
      throw new oauthServer.Failure("unauthorized");
    const origin = config.issuer.slice(0, -"/auth/v1".length);
    return Object.freeze({
      async read(organizationId: number): Promise<unknown | null> {
        if (!Number.isSafeInteger(organizationId) || organizationId <= 0)
          throw new oauthServer.Failure("invalid_request");
        const url = new URL("/rest/v1/v_billing_credits", origin);
        url.searchParams.set(
          "select",
          "organization_id,organization_name,organization_display_name,account_present,credits_provisioned,cached_balance_cents,cached_balance_at,customer_entitled"
        );
        url.searchParams.set("organization_id", `eq.${organizationId}`);
        // Two rows plus exact count detect a broken uniqueness contract, even
        // when PostgREST applies a lower row cap. Never silently take the first.
        url.searchParams.set("limit", "2");
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
          if (
            !/^application\/json(?:;|$)/i.test(
              response.headers.get("content-type") ?? ""
            )
          )
            throw new Error();
          const rows: unknown = JSON.parse(
            await oauthServer.readText(response, 64 * 1024)
          );
          const range = response.headers.get("content-range");
          if (
            !Array.isArray(rows) ||
            rows.length > 1 ||
            (rows.length === 0 ? range !== "*/0" : range !== "0-0/1")
          )
            throw new Error();
          if (rows.length === 0) return null;
          if (!oauthServer.record(rows[0])) throw new Error();
          return rows[0];
        } catch {
          await response.body?.cancel().catch(() => undefined);
          throw new oauthServer.Failure("auth_unavailable");
        }
      },
    });
  }
}
