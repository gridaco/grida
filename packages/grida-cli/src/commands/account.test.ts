import { AccountClient } from "@grida/account";
import { AuthClient } from "@grida/auth";
import { describe, expect, it, vi } from "vitest";
import { AccountCommands } from "./account";

const identity = {
  id: "synthetic-user",
  email: "user@example.invalid",
  display_name: null,
};
const organization = (id: number, name = `studio-${id}`) => ({
  id,
  name,
  display_name: `Studio ${id}`,
});
type Request = (
  operation: string,
  input?: { after?: number; organization_id?: number }
) => Promise<unknown>;

/** Narrow public auth capability; actual AccountClient validates and selects pages. */
function setup(handler: Request) {
  const request = vi.fn<Request>(handler);
  const verify = vi.fn<() => Promise<AuthClient.Status>>(async () => ({
    state: "signed-in",
    identity,
    expiresAt: 1_900_000_000_000,
  }));
  const auth = {
    verify,
    requestAccount: request as AuthClient["requestAccount"],
  };
  return { auth, request, verify };
}

describe("AccountCommands.view", () => {
  it("verifies identity before listing memberships and accepts an empty account", async () => {
    const { auth, request, verify } = setup(async () => ({
      organizations: [],
      next_cursor: null,
    }));
    expect(await AccountCommands.view(auth)).toEqual({
      identity,
      organizations: [],
    });
    expect(verify.mock.invocationCallOrder[0]).toBeLessThan(
      request.mock.invocationCallOrder[0]!
    );
    expect(request).toHaveBeenCalledExactlyOnceWith(
      "organizations.list",
      undefined
    );
  });

  it("walks short nonterminal pages and returns only complete projected memberships", async () => {
    const { auth, request } = setup(async (_operation, input) =>
      input?.after === undefined
        ? {
            organizations: [{ ...organization(1), private_field: "omit" }],
            next_cursor: 1,
          }
        : { organizations: [organization(3)], next_cursor: null }
    );
    expect(await AccountCommands.view(auth)).toEqual({
      identity,
      organizations: [organization(1), organization(3)],
    });
    expect(request.mock.calls).toEqual([
      ["organizations.list", undefined],
      ["organizations.list", { after: 1 }],
    ]);
  });

  it("permits completion on the last budgeted page", async () => {
    const { auth, request } = setup(async (_operation, input) => {
      const id = (input?.after ?? 0) + 1;
      return {
        organizations: [organization(id)],
        next_cursor: id === 100 ? null : id,
      };
    });
    expect((await AccountCommands.view(auth)).organizations).toHaveLength(100);
    expect(request).toHaveBeenCalledTimes(100);
  });

  it("refuses budget exhaustion rather than returning a truncated success", async () => {
    const { auth, request } = setup(async (_operation, input) => {
      const id = (input?.after ?? 0) + 1;
      return { organizations: [organization(id)], next_cursor: id };
    });
    await expect(AccountCommands.view(auth)).rejects.toMatchObject({
      code: "selection_unavailable",
    });
    expect(request).toHaveBeenCalledTimes(100);
  });

  it("preserves a later page's auth failure instead of returning partial data or retrying", async () => {
    const failure = new AuthClient.Failure("token_rejected");
    const { auth, request } = setup(async (_operation, input) => {
      if (input?.after !== undefined) throw failure;
      return { organizations: [organization(1)], next_cursor: 1 };
    });
    await expect(AccountCommands.view(auth)).rejects.toBe(failure);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("refuses a repeated cursor through the account producer's validation", async () => {
    const { auth, request } = setup(async () => ({
      organizations: [organization(1)],
      next_cursor: 1,
    }));
    await expect(AccountCommands.view(auth)).rejects.toMatchObject({
      code: "selection_unavailable",
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("never invents identity or lists organizations for a signed-out result", async () => {
    const { auth, request, verify } = setup(async () => {
      throw new Error("Unexpected membership request");
    });
    verify.mockResolvedValueOnce({ state: "signed-out" });
    await expect(AccountCommands.view(auth)).rejects.toMatchObject({
      code: "signed_out",
    });
    const failure = new AuthClient.Failure("unavailable");
    verify.mockRejectedValueOnce(failure);
    await expect(AccountCommands.view(auth)).rejects.toBe(failure);
    expect(request).not.toHaveBeenCalled();
  });
});

describe("AccountCommands.credits", () => {
  it("keeps numeric names distinct from IDs and preserves cached zero", async () => {
    const named = organization(1, "7"),
      numbered = organization(7, "seven");
    const { auth, request, verify } = setup(async (operation, input) => {
      if (operation === "organizations.list")
        return { organizations: [named, numbered], next_cursor: null };
      return {
        organization: input?.organization_id === 1 ? named : numbered,
        account_present: true,
        state: "cached",
        source: "cache",
        currency: "USD",
        balance_cents: 0,
        cache_updated_at: "2026-09-01T00:00:00Z",
        billing_gate: { allowed: false, reason: "no_balance" },
      };
    });
    expect(await AccountCommands.credits(auth, { name: "7" })).toMatchObject({
      organization: named,
      balance_cents: 0,
    });
    expect(await AccountCommands.credits(auth, { id: 7 })).toMatchObject({
      organization: numbered,
      balance_cents: 0,
    });
    expect(
      request.mock.calls.filter(([operation]) => operation === "credits.read")
    ).toEqual([
      ["credits.read", { organization_id: 1 }],
      ["credits.read", { organization_id: 7 }],
    ]);
    expect(verify).not.toHaveBeenCalled();
  });

  it("keeps organization ambiguity with safe choices and performs no credit request", async () => {
    const rows = [organization(1), organization(2)];
    const { auth, request } = setup(async () => ({
      organizations: rows,
      next_cursor: null,
    }));
    await expect(AccountCommands.credits(auth)).rejects.toMatchObject({
      code: "organization_required",
      choices: rows,
      choices_truncated: false,
    });
    expect(request).toHaveBeenCalledOnce();
  });

  it("preserves server refusal after selection and rejects invalid selectors before I/O", async () => {
    const failure = new AuthClient.Failure("forbidden");
    const { auth, request } = setup(async (operation) => {
      if (operation === "organizations.list")
        return { organizations: [organization(1)], next_cursor: null };
      throw failure;
    });
    await expect(
      AccountCommands.credits(auth, { id: 0 })
    ).rejects.toBeInstanceOf(AccountClient.Failure);
    expect(request).not.toHaveBeenCalled();
    await expect(AccountCommands.credits(auth)).rejects.toBe(failure);
    expect(request).toHaveBeenCalledTimes(2);
  });
});
