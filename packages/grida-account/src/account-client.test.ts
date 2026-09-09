import { describe, expect, it, vi } from "vitest";
import { AuthClient } from "@grida/auth";
import { AccountClient } from "./index";

const organization = (
  id: number,
  name = `org-${id}`
): AccountClient.Organization => ({
  id,
  name,
  display_name: `Organization ${id}`,
});
const credit = (id: number): AccountClient.Credits => ({
  organization: organization(id),
  account_present: true,
  state: "cached",
  source: "cache",
  currency: "USD",
  balance_cents: 0,
  cache_updated_at: "2026-09-07T00:00:00Z",
  billing_gate: { allowed: false, reason: "below_floor" },
});
function harness(
  pages: unknown[] = [{ organizations: [organization(1)], next_cursor: null }]
) {
  let index = 0;
  const request = vi.fn<
    (
      operation: string,
      input?: { organization_id?: number }
    ) => Promise<unknown>
  >(async (operation: string, input?: { organization_id?: number }) =>
    operation === "organizations.list"
      ? pages[index++]
      : credit(input!.organization_id!)
  );
  const auth = { requestAccount: request as AuthClient["requestAccount"] };
  return { request, auth, client: new AccountClient(auth) };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

describe("AccountClient.organizations", () => {
  it("returns exactly one projected page and preserves the server continuation", async () => {
    const h = harness([
      {
        organizations: [{ ...organization(7), private: "secret" }],
        next_cursor: 7,
        token: "secret",
      },
    ]);
    expect(await h.client.organizations({ after: 2 })).toEqual({
      organizations: [organization(7)],
      next_cursor: 7,
    });
    expect(h.request).toHaveBeenCalledExactlyOnceWith("organizations.list", {
      after: 2,
    });
  });
  it.each([
    null,
    [],
    { after: 0 },
    { after: "2" },
    { after: 1, limit: 2 },
    { [Symbol("header")]: 1 },
  ])("rejects invalid cursor input before I/O: %j", async (input) => {
    const h = harness();
    await expect(h.client.organizations(input as never)).rejects.toMatchObject({
      code: "invalid_input",
    });
    expect(h.request).not.toHaveBeenCalled();
  });
  it("snapshots cursor getters once before invoking the capability", async () => {
    const h = harness([
      { organizations: [organization(7)], next_cursor: null },
    ]);
    let reads = 0;
    await h.client.organizations({
      get after() {
        return ++reads === 1 ? 2 : -1;
      },
    });
    expect(reads).toBe(1);
    expect(h.request).toHaveBeenCalledExactlyOnceWith("organizations.list", {
      after: 2,
    });
  });
  it.each([
    null,
    undefined,
    [],
    {},
    { organizations: [], next_cursor: 1 },
    { organizations: [organization(1)], next_cursor: 2 },
    { organizations: [organization(1)] },
    { organizations: [organization(2), organization(1)], next_cursor: null },
    { organizations: [organization(1), organization(1)], next_cursor: null },
    {
      organizations: [{ ...organization(1), display_name: null }],
      next_cursor: null,
    },
    { organizations: [{ ...organization(1), id: 0 }], next_cursor: null },
    {
      organizations: Array.from({ length: 101 }, (_, i) => organization(i + 1)),
      next_cursor: null,
    },
  ])(
    "refuses malformed pages as unavailable rather than empty membership: %j",
    async (page) => {
      const h = harness([page]);
      await expect(h.client.organizations()).rejects.toMatchObject({
        code: "selection_unavailable",
        message: "Grida account operation failed (selection_unavailable)",
      });
      expect(h.request).toHaveBeenCalledOnce();
    }
  );
});

describe("AccountClient.selectOrganization", () => {
  it("reports no membership only for an empty terminal page", async () => {
    const h = harness([{ organizations: [], next_cursor: null }]);
    await expect(h.client.selectOrganization()).rejects.toMatchObject({
      code: "no_organizations",
      choices: [],
      choices_truncated: false,
    });
    expect(h.request).toHaveBeenCalledOnce();
  });
  it("automatically chooses only a sole terminal membership", async () => {
    const sole = { ...organization(1), display_name: "" };
    const h = harness([{ organizations: [sole], next_cursor: null }]);
    expect(await h.client.selectOrganization()).toEqual(sole);
    expect(h.request).toHaveBeenCalledOnce();
  });
  it.each([
    { size: 2, next: null, shown: 2, truncated: false },
    { size: 1, next: 1, shown: 1, truncated: true },
    { size: 100, next: 100, shown: 10, truncated: true },
  ])(
    "bounds ambiguity choices and avoids traversal: %j",
    async ({ size, next, shown, truncated }) => {
      const rows = Array.from({ length: size }, (_, i) => ({
        ...organization(i + 1),
        access_token: "secret",
      }));
      const h = harness([{ organizations: rows, next_cursor: next }]);
      const error = (await h.client
        .selectOrganization()
        .catch((error: unknown) => error)) as AccountClient.Failure;
      expect(error).toBeInstanceOf(AccountClient.Failure);
      expect(error.code).toBe("organization_required");
      expect(error.choices).toEqual(
        Array.from({ length: shown }, (_, i) => organization(i + 1))
      );
      expect(error.choices_truncated).toBe(truncated);
      expect(JSON.stringify(error)).not.toContain("secret");
      expect(h.request).toHaveBeenCalledOnce();
    }
  );
  it.each([{ id: 7 }, { name: "7" }])(
    "keeps numeric IDs distinct from numeric names: %j",
    async (selector) => {
      const numericName = organization(2, "7");
      const numericId = organization(7, "seven");
      const h = harness([
        { organizations: [numericName, numericId], next_cursor: null },
      ]);
      expect(await h.client.selectOrganization(selector)).toEqual(
        "id" in selector ? numericId : numericName
      );
    }
  );
  it.each([{ id: 3 }, { name: "org-3" }])(
    "follows server cursors under a lower row cap: %j",
    async (selector) => {
      const h = harness(
        [1, 2, 3].map((id) => ({
          organizations: [organization(id)],
          next_cursor: id < 3 ? id : null,
        }))
      );
      expect(await h.client.selectOrganization(selector)).toEqual(
        organization(3)
      );
      expect(h.request.mock.calls).toEqual([
        ["organizations.list", undefined],
        ["organizations.list", { after: 1 }],
        ["organizations.list", { after: 2 }],
      ]);
    }
  );
  it("distinguishes a completed explicit lookup from automatic empty selection", async () => {
    const h = harness([{ organizations: [], next_cursor: null }]);
    await expect(h.client.selectOrganization({ id: 4 })).rejects.toMatchObject({
      code: "organization_not_found",
    });
    expect(h.request).toHaveBeenCalledOnce();
  });
  it("stops at100 pages without pretending that an unvisited organization is absent", async () => {
    const pages = Array.from({ length: 101 }, (_, index) => ({
      organizations: [organization(index + 1)],
      next_cursor: index + 1,
    }));
    const h = harness(pages);
    await expect(
      h.client.selectOrganization({ id: 101 })
    ).rejects.toMatchObject({ code: "selection_unavailable" });
    expect(h.request).toHaveBeenCalledTimes(100);
    const last = harness(pages);
    expect(await last.client.selectOrganization({ id: 100 })).toEqual(
      organization(100)
    );
    expect(last.request).toHaveBeenCalledTimes(100);
  });
  it("rejects repeated or stalled cursor data before a lookup can loop", async () => {
    const same = { organizations: [organization(1)], next_cursor: 1 };
    const h = harness([same, same]);
    await expect(h.client.selectOrganization({ id: 2 })).rejects.toMatchObject({
      code: "selection_unavailable",
    });
    expect(h.request).toHaveBeenCalledTimes(2);
  });
  it.each([
    null,
    [],
    {},
    { id: 0 },
    { id: -1 },
    { id: 1.5 },
    { id: "1" },
    { id: NaN },
    { id: Number.MAX_SAFE_INTEGER + 1 },
    { name: "" },
    { name: "Studio" },
    { name: "bad/name" },
    { name: "a".repeat(40) },
    { id: 1, name: "org-1" },
    { id: 1, user_id: "other" },
    { id: 1, [Symbol("headers")]: "secret" },
    Object.create({ id: 1 }),
  ])(
    "rejects ambiguous or invalid selector before any read: %j",
    async (selector) => {
      const h = harness();
      await expect(
        h.client.selectOrganization(selector as never)
      ).rejects.toMatchObject({ code: "invalid_input" });
      await expect(h.client.credits(selector as never)).rejects.toMatchObject({
        code: "invalid_input",
      });
      expect(h.request).not.toHaveBeenCalled();
    }
  );
  it("captures selector getters once and survives caller mutation while paging", async () => {
    const h = harness();
    let reads = 0;
    expect(
      await h.client.credits({
        get id() {
          return ++reads === 1 ? 1 : -1;
        },
      })
    ).toEqual(credit(1));
    expect(reads).toBe(1);
    const pending = deferred<unknown>();
    const delayed = harness();
    delayed.request.mockImplementationOnce(() => pending.promise);
    const input = { name: "org-1" };
    const result = delayed.client.selectOrganization(input);
    input.name = "org-2";
    pending.resolve({
      organizations: [organization(1), organization(2)],
      next_cursor: null,
    });
    expect(await result).toEqual(organization(1));
  });
  it("sanitizes a throwing selector without invoking auth", async () => {
    const h = harness();
    await expect(
      h.client.selectOrganization({
        get name(): string {
          throw new Error("private-selector-secret");
        },
      })
    ).rejects.toMatchObject({
      code: "invalid_input",
      message: "Grida account operation failed (invalid_input)",
    });
    expect(h.request).not.toHaveBeenCalled();
  });
});

describe("AccountClient.credits and capability", () => {
  it("resolves membership then requests only the selected ID, retaining cached zero", async () => {
    const h = harness();
    expect(await h.client.credits()).toEqual(credit(1));
    expect(h.request.mock.calls).toEqual([
      ["organizations.list", undefined],
      ["credits.read", { organization_id: 1 }],
    ]);
  });
  it("requires a fresh selection on each read without caching authority", async () => {
    const h = harness([
      { organizations: [organization(1)], next_cursor: null },
      { organizations: [], next_cursor: null },
    ]);
    await h.client.credits({ id: 1 });
    await expect(h.client.credits({ id: 1 })).rejects.toMatchObject({
      code: "organization_not_found",
    });
    expect(
      h.request.mock.calls.filter(([operation]) => operation === "credits.read")
    ).toHaveLength(1);
  });
  it.each(["organizations.list", "credits.read"])(
    "preserves safe auth failure identity from %s with no retry",
    async (phase) => {
      const failure = new AuthClient.Failure("forbidden");
      const h = harness();
      if (phase === "credits.read")
        h.request.mockImplementationOnce(async () => ({
          organizations: [organization(1)],
          next_cursor: null,
        }));
      h.request.mockRejectedValue(failure);
      await expect(h.client.credits({ id: 1 })).rejects.toBe(failure);
      expect(h.request).toHaveBeenCalledTimes(phase === "credits.read" ? 2 : 1);
    }
  );
  it.each([
    new Error("private-provider-secret"),
    { code: "forbidden", message: "private-provider-secret" },
  ])("sanitizes unknown capability exceptions", async (failure) => {
    const h = harness();
    h.request.mockRejectedValue(failure);
    await expect(h.client.credits()).rejects.toMatchObject({
      code: "selection_unavailable",
      message: "Grida account operation failed (selection_unavailable)",
    });
    expect(h.request).toHaveBeenCalledOnce();
  });
  it("captures one bound callable, independent of later replacement", async () => {
    let getters = 0;
    const auth = {
      row: organization(1),
      get requestAccount() {
        getters++;
        return async function (this: { row: AccountClient.Organization }) {
          return { organizations: [this.row], next_cursor: null };
        } as unknown as AuthClient["requestAccount"];
      },
    };
    const client = new AccountClient(auth);
    Object.defineProperty(auth, "requestAccount", {
      value: () => {
        throw new Error("replacement must not run");
      },
    });
    expect(await client.selectOrganization()).toEqual(organization(1));
    expect(getters).toBe(1);
  });
  it("refuses a missing or throwing capability with a safe constructor failure", () => {
    expect(() => new AccountClient({} as never)).toThrow(
      "Grida account operation failed (invalid_input)"
    );
    expect(
      () =>
        new AccountClient({
          get requestAccount(): never {
            throw new Error("private-capability-secret");
          },
        })
    ).toThrow("Grida account operation failed (invalid_input)");
  });
});
