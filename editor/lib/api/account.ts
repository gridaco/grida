// GRIDA-SEC-010 / GRIDA-SEC-012 — fixed account operations over the shared native boundary.
import "server-only";
import { oauthServer } from "../auth/oauth-server";
import { nativeApi } from "./native";
import { account } from "../account/account";
import { accountData } from "../supabase/account-data";
// GRIDA-EE: billing — host composition; account/identity owners remain independent.
import { credits } from "../billing/credits";
import { creditsData } from "../supabase/credits-data";

export namespace accountApi {
  export function bind(
    operation: "auth.me" | "account.organizations" | "account.credits"
  ) {
    if (
      !["auth.me", "account.organizations", "account.credits"].includes(
        operation
      )
    )
      throw new Error("Invalid account API binding.");
    return nativeApi.bind(
      operation,
      "account",
      async (request) => {
        const input = query(operation, new URL(request.url), request.method);
        await nativeApi.emptyBody(request);
        return input;
      },
      async (input, context) => {
        const { identity, authorization, config, fetcher } = context;
        if (operation === "auth.me") return identity;
        if (operation === "account.organizations")
          return account.organizations(
            accountData.forBearer(authorization, config, fetcher),
            input
          );
        try {
          return await credits.read(
            creditsData.forBearer(authorization, config, fetcher),
            input!
          );
        } catch (error) {
          if (error instanceof credits.NotFound)
            throw new oauthServer.Failure("forbidden");
          throw error;
        }
      }
    );
  }

  function query(
    operation: string,
    url: URL,
    method: string
  ): number | undefined {
    if (operation === "account.credits") {
      if (!url.search && method === "OPTIONS") return undefined;
      if (!/^\?organization_id=[1-9]\d*$/.test(url.search))
        throw new oauthServer.Failure("invalid_request");
      const organizationId = Number(url.searchParams.get("organization_id"));
      if (!Number.isSafeInteger(organizationId) || organizationId <= 0)
        throw new oauthServer.Failure("invalid_request");
      return organizationId;
    }
    if (!url.search) return undefined;
    if (
      operation !== "account.organizations" ||
      !/^\?after=[1-9]\d*$/.test(url.search)
    ) {
      throw new oauthServer.Failure("invalid_request");
    }
    const after = Number(url.searchParams.get("after"));
    if (!account.validCursor(after))
      throw new oauthServer.Failure("invalid_request");
    return after;
  }
}
