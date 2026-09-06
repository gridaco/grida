// GRIDA-SEC-010 / GRIDA-SEC-012 — fixed native organization pages.
import "server-only";
import { account } from "../account/account";
import { oauthServer } from "../auth/oauth-server";
import { nativeData } from "./native-data";

export namespace accountData {
  export function forBearer(
    authorization: string,
    config: oauthServer.Config,
    fetcher: typeof fetch = globalThis.fetch
  ): account.Source {
    const data = nativeData.forBearer(authorization, config, fetcher);
    return Object.freeze({
      async organizations(after?: number) {
        if (after !== undefined && !account.validCursor(after))
          throw new account.Unavailable();
        try {
          return await data.page("organization", {
            select: "id,name,display_name",
            order: "id.asc",
            limit: String(account.pageSize),
            ...(after === undefined ? {} : { id: `gt.${after}` }),
          });
        } catch (error) {
          if (
            error instanceof oauthServer.Failure &&
            ["unauthorized", "forbidden"].includes(error.code)
          )
            throw error;
          throw new account.Unavailable();
        }
      },
    });
  }
}
