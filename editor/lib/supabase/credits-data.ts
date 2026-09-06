// GRIDA-EE: billing — passive cache reads, never provider reconciliation.
// GRIDA-SEC-010 / GRIDA-SEC-012 — retain the verified caller's RLS authority.
import "server-only";
import { oauthServer } from "../auth/oauth-server";
import { nativeData } from "./native-data";

/** Fixed read-only credit projection. No privileged or browser client. */
export namespace creditsData {
  export function forBearer(
    authorization: string,
    config: oauthServer.Config,
    fetcher: typeof fetch = globalThis.fetch
  ) {
    const data = nativeData.forBearer(authorization, config, fetcher);
    return Object.freeze({
      async read(organizationId: number): Promise<unknown | null> {
        if (!Number.isSafeInteger(organizationId) || organizationId <= 0)
          throw new oauthServer.Failure("invalid_request");
        const { rows, total } = await data.page("v_billing_credits", {
          select:
            "organization_id,organization_name,organization_display_name,account_present,credits_provisioned,cached_balance_cents,cached_balance_at,customer_entitled",
          organization_id: `eq.${organizationId}`,
          limit: "2",
        });
        // Exact count plus a two-row limit detects broken uniqueness and row caps.
        if (rows.length > 1 || total !== rows.length)
          throw new oauthServer.Failure("auth_unavailable");
        if (rows.length === 0) return null;
        if (!oauthServer.record(rows[0]))
          throw new oauthServer.Failure("auth_unavailable");
        return rows[0];
      },
    });
  }
}
