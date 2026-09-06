// GRIDA-GG: token — native membership source contract.
// GRIDA-SEC-006 / GRIDA-SEC-010 / GRIDA-SEC-012
import { describe, expect, it, vi } from "vitest";
import { ggData } from "./gg-data";
import { nativeData } from "./native-data";
const user = "22222222-2222-4222-8222-222222222222";
const config = {
  issuer: "http://127.0.0.1:55431/auth/v1",
  publishableKey: "synthetic-key",
  clientIds: [],
};
const authorization = "Bearer synthetic.account.credential";
const row = {
  organization_id: 4,
  organization: { id: 4, name: "local", private: "discard" },
};
const reply = (rows: unknown = [row], range = "0-0/1") =>
  Response.json(rows, { headers: { "content-range": range } });

describe("ggData.forBearer", () => {
  it("binds the exact current user and organization in one caller-authorized statement", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => reply());
    expect(
      await ggData
        .forBearer(authorization, config, 4, fetcher)
        .organization(user)
    ).toEqual({ id: 4, name: "local" });
    const [target, init] = fetcher.mock.calls[0];
    const url = new URL(String(target));
    expect(url.origin + url.pathname).toBe(
      "http://127.0.0.1:55431/rest/v1/organization_member"
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      select: "organization_id,organization!inner(id,name)",
      user_id: `eq.${user}`,
      organization_id: "eq.4",
      limit: "2",
    });
    expect(init).toMatchObject({
      method: "GET",
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      headers: {
        authorization,
        apikey: "synthetic-key",
        "accept-profile": "public",
        prefer: "count=exact",
      },
    });
    expect(new Headers(init?.headers).has("cookie")).toBe(false);
  });
  it("returns null only for exact absence", async () => {
    expect(
      await ggData
        .forBearer(authorization, config, 4, async () => reply([], "*/0"))
        .organization(user)
    ).toBeNull();
  });
  it.each([
    [[], "*/1"],
    [[row], "0-0/2"],
    [[row, row], "0-1/2"],
    [[row], "0-0/*"],
    [[{ ...row, organization_id: 5 }], "0-0/1"],
    [[{ ...row, organization: { id: 5, name: "local" } }], "0-0/1"],
    [[{ ...row, organization: [] }], "0-0/1"],
    [[{ ...row, organization: null }], "0-0/1"],
    [[{ ...row, organization: { id: 4, name: "Bad Name" } }], "0-0/1"],
    [[{ ...row, organization: { id: 4, name: "x".repeat(40) } }], "0-0/1"],
  ])("rejects incomplete or mismatched membership %#", async (rows, range) => {
    await expect(
      ggData
        .forBearer(authorization, config, 4, async () =>
          reply(rows, range as string)
        )
        .organization(user)
    ).rejects.toMatchObject({ code: "auth_unavailable" });
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "refuses invalid org %s before I/O",
    (id) => {
      const fetcher = vi.fn<typeof fetch>();
      expect(() =>
        ggData.forBearer(authorization, config, id, fetcher)
      ).toThrow("The authorization request is invalid.");
      expect(fetcher).not.toHaveBeenCalled();
    }
  );
  it("refuses invalid user before I/O", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      ggData.forBearer(authorization, config, 4, fetcher).organization("other")
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("nativeData fixed destinations", () => {
  it.each(["../rpc/private", "https://example.com", "organization?select=*"])(
    "refuses arbitrary table %s before I/O",
    async (table) => {
      const fetcher = vi.fn<typeof fetch>();
      await expect(
        nativeData
          .forBearer(authorization, config, fetcher)
          .page(table as "organization", {})
      ).rejects.toMatchObject({ code: "invalid_request" });
      expect(fetcher).not.toHaveBeenCalled();
    }
  );
});
