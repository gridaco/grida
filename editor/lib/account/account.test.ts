// GRIDA-SEC-010 / GRIDA-SEC-012 — complete RLS pages and safe account projection.
import { describe, expect, it } from "vitest";
import { account } from "./account";

const first = { id: 2, name: "first-org", display_name: "First" };
const second = { id: 7, name: "second-org", display_name: "" };
function source(rows: unknown, total: number): account.Source {
  return { organizations: async () => ({ rows, total }) };
}

describe("account.organizations", () => {
  it("projects only account fields and preserves an empty display name", async () => {
    expect(
      await account.organizations(
        source([{ ...first, owner_id: "private", email: "private" }, second], 2)
      )
    ).toEqual({ organizations: [first, second], next_cursor: null });
  });
  it("returns an explicit empty success for zero visible memberships", async () => {
    expect(await account.organizations(source([], 0))).toEqual({
      organizations: [],
      next_cursor: null,
    });
  });
  it("continues from the last returned ID even when the database cap is below the page size", async () => {
    expect(await account.organizations(source([first], 3))).toEqual({
      organizations: [first],
      next_cursor: first.id,
    });
  });
  it("passes the cursor to the authorized source and accepts only later IDs", async () => {
    const data: account.Source = {
      async organizations(after) {
        expect(after).toBe(first.id);
        return { rows: [second], total: 1 };
      },
    };
    expect(await account.organizations(data, first.id)).toEqual({
      organizations: [second],
      next_cursor: null,
    });
  });
  it.each([
    [null, 0],
    [[first], 0],
    [[], 1],
    [[first], -1],
    [[first], 1.5],
    [[first], Number.MAX_SAFE_INTEGER + 1],
    [[second, first], 2],
    [[first, first], 2],
    [[{ ...first, id: 0 }], 1],
    [[{ ...first, id: Number.MAX_SAFE_INTEGER + 1 }], 1],
    [[{ ...first, name: "Uppercase" }], 1],
    [[{ ...first, name: "a--b" }], 1],
    [[{ ...first, display_name: null }], 1],
    [Array.from({ length: 101 }, (_, i) => ({ ...first, id: i + 1 })), 101],
  ])("rejects invalid/incomplete source data %#", async (rows, total) => {
    await expect(
      account.organizations(source(rows, total as number))
    ).rejects.toBeInstanceOf(account.Unavailable);
  });
  it("rejects IDs at or before the requested cursor", async () => {
    await expect(
      account.organizations(source([first], 1), first.id)
    ).rejects.toBeInstanceOf(account.Unavailable);
  });
  it("never turns an unavailable source into an empty account", async () => {
    await expect(
      account.organizations({
        organizations: async () => {
          throw new account.Unavailable();
        },
      })
    ).rejects.toBeInstanceOf(account.Unavailable);
  });
});
