// GRIDA-GG: token — member lookup for the native mint adapter.
// GRIDA-SEC-006 / GRIDA-SEC-010 / GRIDA-SEC-012 — exact verified bearer, explicit current-user membership.
import "server-only";
import { oauthServer } from "../auth/oauth-server";
import { nativeData } from "./native-data";

export namespace ggData {
  export function forBearer(
    authorization: string,
    config: oauthServer.Config,
    organizationId: number,
    fetcher: typeof fetch = globalThis.fetch
  ) {
    if (!Number.isSafeInteger(organizationId) || organizationId <= 0)
      throw new oauthServer.Failure("invalid_request");
    const data = nativeData.forBearer(authorization, config, fetcher);
    return Object.freeze({
      async organization(
        userId: string
      ): Promise<{ id: number; name: string } | null> {
        if (!oauthServer.uuid(userId))
          throw new oauthServer.Failure("invalid_request");
        // The member predicate and organization join observe one statement snapshot.
        const { rows, total } = await data.page("organization_member", {
          select: "organization_id,organization!inner(id,name)",
          user_id: `eq.${userId}`,
          organization_id: `eq.${organizationId}`,
          limit: "2",
        });
        if (rows.length > 1 || total !== rows.length)
          throw new oauthServer.Failure("auth_unavailable");
        if (rows.length === 0) return null;
        const row = rows[0];
        if (
          !oauthServer.record(row) ||
          row.organization_id !== organizationId ||
          !oauthServer.record(row.organization) ||
          row.organization.id !== organizationId ||
          typeof row.organization.name !== "string" ||
          row.organization.name.length > 39 ||
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.organization.name)
        )
          throw new oauthServer.Failure("auth_unavailable");
        return { id: organizationId, name: row.organization.name };
      },
    });
  }
}
