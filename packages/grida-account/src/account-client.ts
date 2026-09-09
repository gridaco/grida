import { AuthClient } from "@grida/auth";

/** Organization choices are preferences; each server read still authorizes membership. */
export class AccountClient {
  private readonly request: AuthClient["requestAccount"];

  constructor(auth: Pick<AuthClient, "requestAccount">) {
    try {
      const request = auth.requestAccount;
      if (typeof request !== "function") throw new Error();
      this.request = request.bind(auth);
    } catch {
      throw new AccountClient.Failure("invalid_input");
    }
  }

  /** One bounded server page; no hidden list traversal. */
  async organizations(
    input?: Readonly<{ after?: number }>
  ): Promise<AccountClient.OrganizationsPage> {
    const after = cursor(input);
    let value: unknown;
    try {
      value = await this.request(
        "organizations.list",
        after === undefined ? undefined : { after }
      );
    } catch (error) {
      throw safeFailure(error);
    }
    return page(value, after);
  }

  /** Resolve an explicit ID/name, or prove that exactly one membership is visible. */
  async selectOrganization(
    input?: AccountClient.Selector
  ): Promise<AccountClient.Organization> {
    const selected = selector(input);
    let after: number | undefined;
    for (let count = 0; count < 100; count++) {
      const result = await this.organizations(
        after === undefined ? undefined : { after }
      );
      if (!selected) {
        if (result.organizations.length === 0)
          throw new AccountClient.Failure("no_organizations");
        if (result.organizations.length === 1 && result.next_cursor === null)
          return result.organizations[0]!;
        throw new AccountClient.Failure(
          "organization_required",
          result.organizations,
          result.organizations.length > 10 || result.next_cursor !== null
        );
      }
      const found = result.organizations.find((organization) =>
        "id" in selected
          ? organization.id === selected.id
          : organization.name === selected.name
      );
      if (found) return found;
      if (result.next_cursor === null)
        throw new AccountClient.Failure("organization_not_found");
      after = result.next_cursor;
    }
    throw new AccountClient.Failure("selection_unavailable");
  }

  /** Resolve membership, then ask the auth producer for the fixed cached-credit read. */
  async credits(
    input?: AccountClient.Selector
  ): Promise<AccountClient.Credits> {
    const organization = await this.selectOrganization(input);
    try {
      return await this.request("credits.read", {
        organization_id: organization.id,
      });
    } catch (error) {
      throw safeFailure(error);
    }
  }
}

export namespace AccountClient {
  export type Organization =
    AuthClient.OrganizationsPage["organizations"][number];
  export type OrganizationsPage = AuthClient.OrganizationsPage;
  export type Credits = AuthClient.Credits;
  export type Selector = Readonly<{ id: number }> | Readonly<{ name: string }>;
  export type FailureCode =
    | "invalid_input"
    | "no_organizations"
    | "organization_required"
    | "organization_not_found"
    | "selection_unavailable";
  export class Failure extends Error {
    readonly choices: readonly Organization[];
    readonly choices_truncated: boolean;
    constructor(
      readonly code: FailureCode,
      choices: readonly Organization[] = [],
      truncated = false
    ) {
      super(`Grida account operation failed (${code})`);
      this.name = "AccountFailure";
      this.choices = choices
        .slice(0, 10)
        .map(({ id, name, display_name }) => ({ id, name, display_name }));
      this.choices_truncated = truncated || choices.length > 10;
    }
  }
}

function selector(input: unknown): AccountClient.Selector | undefined {
  if (input === undefined) return undefined;
  try {
    const value = record(input);
    if (!value) throw new Error();
    const keys = Reflect.ownKeys(value);
    if (keys.length !== 1) throw new Error();
    if (keys[0] === "id") {
      const id = value.id;
      if (positiveInteger(id)) return { id };
    } else if (keys[0] === "name") {
      const name = value.name;
      if (
        typeof name === "string" &&
        /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/.test(name)
      )
        return { name };
    }
  } catch {
    throw new AccountClient.Failure("invalid_input");
  }
  throw new AccountClient.Failure("invalid_input");
}

function cursor(input: unknown): number | undefined {
  if (input === undefined) return undefined;
  try {
    const value = record(input);
    if (!value || Reflect.ownKeys(value).some((key) => key !== "after"))
      throw new Error();
    const after = value.after;
    if (after === undefined || positiveInteger(after)) return after;
  } catch {
    throw new AccountClient.Failure("invalid_input");
  }
  throw new AccountClient.Failure("invalid_input");
}

function page(
  value: unknown,
  after: number | undefined
): AccountClient.OrganizationsPage {
  try {
    const body = record(value);
    if (!body) throw new Error();
    const rows = body.organizations;
    const next = body.next_cursor;
    if (!Array.isArray(rows) || rows.length > 100) throw new Error();
    let last = after ?? 0;
    const organizations: AccountClient.Organization[] = [];
    const length = rows.length;
    for (let index = 0; index < length; index++) {
      const row = record(rows[index]);
      if (!row) throw new Error();
      const { id, name, display_name } = row;
      if (
        !positiveInteger(id) ||
        id <= last ||
        typeof name !== "string" ||
        name.length < 1 ||
        name.length > 39 ||
        typeof display_name !== "string"
      )
        throw new Error();
      last = id;
      organizations.push({ id, name, display_name });
    }
    if (
      next !== null &&
      (!positiveInteger(next) || organizations.length === 0 || next !== last)
    )
      throw new Error();
    return { organizations, next_cursor: next };
  } catch {
    throw new AccountClient.Failure("selection_unavailable");
  }
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function safeFailure(error: unknown) {
  return error instanceof AuthClient.Failure
    ? error
    : new AccountClient.Failure("selection_unavailable");
}
