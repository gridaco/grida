import { AccountClient } from "@grida/account";
import { AuthClient } from "@grida/auth";

/** Present complete account reads without owning session or membership policy. */
export namespace AccountCommands {
  export type View = Readonly<{
    identity: AuthClient.Identity;
    organizations: readonly AccountClient.Organization[];
  }>;

  export async function view(
    auth: Pick<AuthClient, "verify" | "requestAccount">
  ): Promise<View> {
    const verified = await auth.verify();
    if (verified.state === "signed-out")
      throw new AuthClient.Failure("signed_out");
    const account = new AccountClient(auth);
    const organizations: AccountClient.Organization[] = [];
    let after: number | undefined;
    // Bound this command's complete listing. A short page is not completion;
    // exhaustion must never turn unvisited memberships into a successful list.
    for (let count = 0; count < 100; count++) {
      const page = await account.organizations(
        after === undefined ? undefined : { after }
      );
      organizations.push(...page.organizations);
      if (page.next_cursor === null) {
        return { identity: verified.identity, organizations };
      }
      after = page.next_cursor;
    }
    throw new AccountClient.Failure("selection_unavailable");
  }

  export function credits(
    auth: Pick<AuthClient, "requestAccount">,
    selector?: AccountClient.Selector
  ) {
    return new AccountClient(auth).credits(selector);
  }
}
