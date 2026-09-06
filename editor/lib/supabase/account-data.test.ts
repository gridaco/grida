// GRIDA-SEC-010 / GRIDA-SEC-012 — fixed native bearer queries preserve database authority.
import { describe, expect, it, vi } from "vitest";
import { accountData } from "./account-data";
import { account } from "../account/account";

const config = {
  issuer: "http://127.0.0.1:55431/auth/v1",
  publishableKey: "synthetic-public-key",
  clientIds: ["11111111-1111-4111-8111-111111111111"],
};
const authorization = "Bearer synthetic.account.credential";
const organization = { id: 4, name: "local", display_name: "Local" };
function reply(rows: unknown = [organization], range = "0-0/1") {
  return Response.json(rows, { headers: { "content-range": range } });
}

describe("accountData.forBearer", () => {
  it("sends only the user bearer and publishable key to the fixed public-schema read", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => reply());
    const data = accountData.forBearer(authorization, config, fetcher);
    expect(await data.organizations(2)).toEqual({
      rows: [organization],
      total: 1,
    });
    expect(fetcher).toHaveBeenCalledOnce();
    const [target, init] = fetcher.mock.calls[0]!;
    const url = new URL(String(target));
    expect(url.origin + url.pathname).toBe(
      "http://127.0.0.1:55431/rest/v1/organization"
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      select: "id,name,display_name",
      order: "id.asc",
      limit: "100",
      id: "gt.2",
    });
    expect(init).toMatchObject({
      method: "GET",
      redirect: "error",
      cache: "no-store",
      credentials: "omit",
      headers: {
        apikey: config.publishableKey,
        authorization,
        accept: "application/json",
        "accept-profile": "public",
        prefer: "count=exact",
      },
    });
    expect(new Headers(init?.headers).has("cookie")).toBe(false);
    expect(init?.body).toBeUndefined();
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
  it("does not add a cursor predicate for the first page", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => reply([], "*/0"));
    expect(
      await accountData
        .forBearer(authorization, config, fetcher)
        .organizations()
    ).toEqual({ rows: [], total: 0 });
    expect(
      new URL(String(fetcher.mock.calls[0]![0])).searchParams.has("id")
    ).toBe(false);
  });
  it("accepts a partial RLS page with an exact total", async () => {
    const fetcher: typeof fetch = async () =>
      Response.json([organization], {
        status: 206,
        headers: { "content-range": "0-0/3" },
      });
    expect(
      await account.organizations(
        accountData.forBearer(authorization, config, fetcher)
      )
    ).toEqual({
      organizations: [organization],
      next_cursor: 4,
    });
  });
  it.each([
    undefined,
    "0-0/*",
    "1-1/2",
    "*/1",
    "0-9/10",
    "0-0/9007199254740992",
  ])("rejects a missing or inconsistent exact range: %s", async (range) => {
    const fetcher: typeof fetch = async () =>
      Response.json([organization], {
        headers: range ? { "content-range": range } : {},
      });
    await expect(
      accountData.forBearer(authorization, config, fetcher).organizations()
    ).rejects.toBeInstanceOf(account.Unavailable);
  });
  it.each([401, 403, 400, 500, 302])(
    "maps database status %i to a safe failure",
    async (status) => {
      const fetcher: typeof fetch = async () =>
        new Response("private database diagnostics", { status });
      await expect(
        accountData.forBearer(authorization, config, fetcher).organizations()
      ).rejects.toMatchObject(
        status === 401
          ? { code: "unauthorized" }
          : status === 403
            ? { code: "forbidden" }
            : { message: "Account data is unavailable." }
      );
    }
  );
  it("contains network error diagnostics", async () => {
    const fetcher: typeof fetch = async () => {
      throw new Error("private connection credentials");
    };
    await expect(
      accountData.forBearer(authorization, config, fetcher).organizations()
    ).rejects.toMatchObject({ message: "Account data is unavailable." });
  });
  it("rejects redirected responses even from a misbehaving fetch adapter", async () => {
    const response = reply();
    Object.defineProperty(response, "redirected", { value: true });
    await expect(
      accountData
        .forBearer(authorization, config, async () => response)
        .organizations()
    ).rejects.toBeInstanceOf(account.Unavailable);
  });
  it.each([
    "not-json",
    JSON.stringify([{ ...organization, display_name: "x".repeat(65_536) }]),
  ])("bounds and validates response bodies %#", async (body) => {
    const fetcher: typeof fetch = async () =>
      new Response(body, {
        headers: {
          "content-type": "application/json",
          "content-range": "0-0/1",
        },
      });
    await expect(
      accountData.forBearer(authorization, config, fetcher).organizations()
    ).rejects.toBeInstanceOf(account.Unavailable);
  });
  it("rejects non-JSON media types", async () => {
    const fetcher: typeof fetch = async () =>
      new Response("[]", {
        headers: { "content-type": "text/html", "content-range": "*/0" },
      });
    await expect(
      accountData.forBearer(authorization, config, fetcher).organizations()
    ).rejects.toBeInstanceOf(account.Unavailable);
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid cursor %s before database I/O",
    async (after) => {
      const fetcher = vi.fn<typeof fetch>();
      await expect(
        accountData
          .forBearer(authorization, config, fetcher)
          .organizations(after)
      ).rejects.toBeInstanceOf(account.Unavailable);
      expect(fetcher).not.toHaveBeenCalled();
    }
  );
});
