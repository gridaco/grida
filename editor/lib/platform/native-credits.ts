// GRIDA-EE: billing — published native projection over infra-owned cached credit.
// GRIDA-SEC-010 / GRIDA-SEC-012 — retain the verified caller's membership authority.
import "server-only";
import { oauthServer } from "../auth/oauth-server";
import { nativeData } from "../supabase/native-data";
import type { credits } from "../billing/credits";
import { BillingConsumerError, platformBilling } from "./billing-consumer";

export async function nativeCredits(
  authorization: string,
  config: oauthServer.Config,
  organizationId: number,
  fetcher: typeof fetch = globalThis.fetch
): Promise<credits.Summary> {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0)
    throw new oauthServer.Failure("invalid_request");
  const data = nativeData.forBearer(authorization, config, fetcher);
  // Identity is still source-owned. This fixed membership-protected read has
  // no billing setup dependency and no source financial view or service key.
  const { rows, total } = await data.page("organization", {
    select: "id,name,display_name",
    id: `eq.${organizationId}`,
    limit: "2",
  });
  if (rows.length === 0 && total === 0)
    throw new oauthServer.Failure("forbidden");
  const org = rows[0];
  if (
    rows.length !== 1 ||
    total !== 1 ||
    !oauthServer.record(org) ||
    org.id !== organizationId ||
    typeof org.name !== "string" ||
    !/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/.test(org.name) ||
    typeof org.display_name !== "string"
  )
    throw new oauthServer.Failure("auth_unavailable");
  try {
    const projection = await platformBilling(undefined, fetcher).credits(
      organizationId,
      authorization.slice(7),
      "native"
    );
    const { organization_id: _organization_id, ...state } = projection;
    return {
      organization: {
        id: organizationId,
        name: org.name,
        display_name: org.display_name,
      },
      ...state,
    };
  } catch (error) {
    if (error instanceof BillingConsumerError && error.code !== "unavailable")
      throw new oauthServer.Failure(error.code);
    throw new oauthServer.Failure("auth_unavailable");
  }
}
