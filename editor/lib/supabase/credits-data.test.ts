// GRIDA-EE: billing
// GRIDA-SEC-010 / GRIDA-SEC-012 — fixed user-bearer cache reads.
import { describe, expect, it, vi } from "vitest";
import { oauthServer } from "../auth/oauth-server";
import { creditsData } from "./credits-data";

const config = {
  issuer: "http://127.0.0.1:55431/auth/v1",
  publishableKey: "synthetic-public-key",
  clientIds: ["11111111-1111-4111-8111-111111111111"],
};
const authorization = "Bearer synthetic.account.credential";
const row = { organization_id: 4 };
const reply = (rows: unknown = [row], range = "0-0/1", status = 200) =>
  Response.json(rows, { status, headers: { "content-range": range } });

describe("creditsData.forBearer", () => {
  it("reads only the fixed projection with the captured user bearer and no write or cookie authority", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => reply());
    expect(
      await creditsData.forBearer(authorization, config, fetcher).read(4)
    ).toEqual(row);
    expect(fetcher).toHaveBeenCalledOnce();
    const [target, init] = fetcher.mock.calls[0]!;
    const url = new URL(String(target));
    expect(url.origin + url.pathname).toBe(
      "http://127.0.0.1:55431/rest/v1/v_billing_credits"
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      select:
        "organization_id,organization_name,organization_display_name,account_present,credits_provisioned,cached_balance_cents,cached_balance_at,customer_entitled",
      organization_id: "eq.4",
      limit: "2",
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
    expect(init?.body).toBeUndefined();
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(init?.headers).has("cookie")).toBe(false);
  });
  it("returns null only for an exact empty result", async () => {
    expect(
      await creditsData
        .forBearer(authorization, config, async () => reply([], "*/0"))
        .read(4)
    ).toBeNull();
  });
  it("accepts an exact one-row partial response", async () => {
    expect(
      await creditsData
        .forBearer(authorization, config, async () =>
          reply([row], "0-0/1", 206)
        )
        .read(4)
    ).toEqual(row);
  });
  it.each([
    [[], "*/1"],
    [[row], "0-0/2"],
    [[row], "0-0/*"],
    [[row], "1-1/1"],
    [[row], ""],
    [[row, row], "0-1/2"],
    [[null], "0-0/1"],
    [{}, "*/0"],
  ])("rejects malformed or truncated result %#", async (rows, range) => {
    await expect(
      creditsData
        .forBearer(authorization, config, async () =>
          reply(rows, range as string)
        )
        .read(4)
    ).rejects.toMatchObject({ code: "auth_unavailable" });
  });
  it.each([401, 403, 404, 500, 302])(
    "contains upstream failure %i",
    async (status) => {
      await expect(
        creditsData
          .forBearer(
            authorization,
            config,
            async () => new Response("private diagnostics", { status })
          )
          .read(4)
      ).rejects.toMatchObject({
        code:
          status === 401
            ? "unauthorized"
            : status === 403
              ? "forbidden"
              : "auth_unavailable",
      });
    }
  );
  it.each(["invalid", JSON.stringify([{ value: "x".repeat(65536) }])])(
    "bounds and parses JSON %#",
    async (body) => {
      await expect(
        creditsData
          .forBearer(
            authorization,
            config,
            async () =>
              new Response(body, {
                headers: {
                  "content-type": "application/json",
                  "content-range": "0-0/1",
                },
              })
          )
          .read(4)
      ).rejects.toMatchObject({ code: "auth_unavailable" });
    }
  );
  it("rejects HTML and redirects even from a misbehaving fetch adapter", async () => {
    for (const response of [
      new Response("[]", {
        headers: { "content-type": "text/html", "content-range": "*/0" },
      }),
      Object.defineProperty(reply(), "redirected", { value: true }),
    ]) {
      await expect(
        creditsData
          .forBearer(authorization, config, async () => response)
          .read(4)
      ).rejects.toMatchObject({ code: "auth_unavailable" });
    }
  });
  it("contains connection errors", async () => {
    await expect(
      creditsData
        .forBearer(authorization, config, async () => {
          throw new Error("private credentials");
        })
        .read(4)
    ).rejects.toMatchObject({ code: "auth_unavailable" });
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid organization %s before I/O",
    async (id) => {
      const fetcher = vi.fn<typeof fetch>();
      await expect(
        creditsData.forBearer(authorization, config, fetcher).read(id)
      ).rejects.toMatchObject({ code: "invalid_request" });
      expect(fetcher).not.toHaveBeenCalled();
    }
  );
  it("rejects invalid authorization before constructing a source", () => {
    expect(() => creditsData.forBearer("Bearer invalid", config)).toThrow(
      new oauthServer.Failure("unauthorized")
    );
  });
});
