/**
 * Tests for the AI seam's error envelope + 2-step UX gate router.
 *
 * Covers:
 *   - `isAiErrorResponse` type-guard
 *   - `resolveAiError` produces the right action per code
 *   - `orgErrorToAiError` classifies the resolution failures correctly
 *   - `aiErrorResponse` builds a parseable Response
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  aiErrorResponse,
  AI_ERROR_CODES,
  billingErrorToAiError,
  isAiErrorCode,
  isAiErrorResponse,
  orgErrorToAiError,
  resolveAiError,
  type AiErrorResponse,
} from "../error";

describe("isAiErrorResponse", () => {
  it("accepts the canonical envelope", () => {
    expect(
      isAiErrorResponse({
        success: false,
        code: "unauthorized",
        message: "login required",
        status: 401,
      })
    ).toBe(true);
  });

  it("rejects pre-seam error shapes", () => {
    expect(isAiErrorResponse({ message: "x", status: 500 })).toBe(false);
    expect(isAiErrorResponse(null)).toBe(false);
    expect(isAiErrorResponse(undefined)).toBe(false);
    expect(isAiErrorResponse("nope")).toBe(false);
    expect(
      isAiErrorResponse({ success: true, code: "x", message: "x", status: 1 })
    ).toBe(false);
  });

  it("rejects envelopes with unknown codes (closed AiErrorCode union)", () => {
    expect(
      isAiErrorResponse({
        success: false,
        code: "garbage",
        message: "x",
        status: 500,
      })
    ).toBe(false);
  });
});

describe("isAiErrorCode", () => {
  it("accepts every code in AI_ERROR_CODES", () => {
    for (const code of AI_ERROR_CODES) {
      expect(isAiErrorCode(code)).toBe(true);
    }
  });

  it("rejects unknown strings and non-string inputs", () => {
    expect(isAiErrorCode("garbage")).toBe(false);
    expect(isAiErrorCode("")).toBe(false);
    expect(isAiErrorCode(null)).toBe(false);
    expect(isAiErrorCode(undefined)).toBe(false);
    expect(isAiErrorCode(42)).toBe(false);
  });
});

describe("resolveAiError", () => {
  const make = (
    code: AiErrorResponse["code"],
    status = 400
  ): AiErrorResponse => ({
    success: false,
    code,
    message: `msg-${code}`,
    status,
  });

  it("routes unauthorized → /sign-in with encoded next", () => {
    const action = resolveAiError(make("unauthorized", 401), {
      next: "/foo/bar?x=1",
    });
    expect(action).toEqual({
      kind: "redirect",
      href: "/sign-in?next=%2Ffoo%2Fbar%3Fx%3D1",
      reason: "unauthorized",
    });
  });

  it("routes no_organization → /organizations/new", () => {
    const action = resolveAiError(make("no_organization", 412), {
      next: "/dashboard",
    });
    expect(action).toEqual({
      kind: "redirect",
      href: "/organizations/new?next=%2Fdashboard",
      reason: "no_organization",
    });
  });

  it("routes blocked → warning toast", () => {
    const action = resolveAiError(make("blocked", 402));
    expect(action).toEqual({
      kind: "toast",
      message: "msg-blocked",
      tone: "warning",
    });
  });

  it("routes bad_request → error toast", () => {
    const action = resolveAiError(make("bad_request", 400));
    expect(action).toEqual({
      kind: "toast",
      message: "msg-bad_request",
      tone: "error",
    });
  });

  it("routes internal → error toast", () => {
    const action = resolveAiError(make("internal", 500));
    expect(action).toEqual({
      kind: "toast",
      message: "msg-internal",
      tone: "error",
    });
  });

  it("defaults next to root in non-browser context", () => {
    const action = resolveAiError(make("unauthorized", 401));
    expect(action).toEqual({
      kind: "redirect",
      href: "/sign-in?next=%2F",
      reason: "unauthorized",
    });
  });
});

describe("orgErrorToAiError", () => {
  it("missing org → no_organization", () => {
    const e = orgErrorToAiError({
      code: "missing_organization_id",
      status: 400,
      message: "no org",
    });
    expect(e.code).toBe("no_organization");
  });

  it("invalid header → bad_request", () => {
    const e = orgErrorToAiError({
      code: "invalid_header",
      status: 400,
      message: "bad header",
    });
    expect(e.code).toBe("bad_request");
  });

  it("unauthorized code passes through", () => {
    const e = orgErrorToAiError({
      code: "unauthorized",
      status: 401,
      message: "401",
    });
    expect(e.code).toBe("unauthorized");
  });

  it("membership failures (not_member) → no_organization (onboarding flow)", () => {
    const e = orgErrorToAiError({
      code: "not_member",
      status: 403,
      message: "not member",
    });
    expect(e.code).toBe("no_organization");
  });

  it("missing_organization_id → no_organization", () => {
    const e = orgErrorToAiError({
      code: "missing_organization_id",
      status: 400,
      message: "x",
    });
    expect(e.code).toBe("no_organization");
  });

  it("org_not_found → no_organization", () => {
    const e = orgErrorToAiError({
      code: "org_not_found",
      status: 404,
      message: "x",
    });
    expect(e.code).toBe("no_organization");
  });

  it("invalid_input → bad_request", () => {
    const e = orgErrorToAiError({
      code: "invalid_input",
      status: 400,
      message: "x",
    });
    expect(e.code).toBe("bad_request");
  });

  it("real DB lookup failure (org_lookup_failed) is re-thrown", () => {
    // Per project policy: real DB exceptions are not silently mapped to
    // a friendly redirect. They propagate as exceptions and are handled
    // by the caller's outer try/catch (or the framework) as a generic 500.
    expect(() =>
      orgErrorToAiError({
        code: "org_lookup_failed",
        status: 500,
        message: "db down",
      })
    ).toThrow("db down");
  });

  it("unknown code is re-thrown (defensive — don't silently route)", () => {
    expect(() =>
      orgErrorToAiError({
        code: "future_code_we_dont_know_about",
        status: 500,
        message: "future-code-msg",
      })
    ).toThrow("future-code-msg");
  });

  it("non-error input is re-thrown", () => {
    expect(() => orgErrorToAiError("string")).toThrow("string");
  });
});

describe("billingErrorToAiError", () => {
  it("blocked code passes through with the original message", () => {
    const e = billingErrorToAiError(
      Object.assign(new Error("below floor"), { code: "blocked", status: 402 }),
      "test"
    );
    expect(e).toEqual({
      success: false,
      code: "blocked",
      message: "below floor",
      status: 402,
    });
  });

  it("internal failures sanitize the message (raw exception is logged, not echoed)", () => {
    const e = billingErrorToAiError(
      new Error("Internal: connection refused on db-prod-04:5432"),
      "test"
    );
    expect(e.code).toBe("internal");
    expect(e.message).not.toContain("db-prod-04");
    expect(e.message).not.toContain("connection refused");
  });

  it("non-blocked code with status falls through to internal", () => {
    const e = billingErrorToAiError(
      Object.assign(new Error("Metronome 503"), {
        code: "provider_down",
        status: 503,
      }),
      "test"
    );
    expect(e.code).toBe("internal");
    expect(e.status).toBe(503);
    expect(e.message).not.toContain("Metronome");
  });
});

describe("aiErrorResponse", () => {
  it("returns a parseable Response with the standard envelope", async () => {
    const r = aiErrorResponse({
      code: "blocked",
      status: 402,
      message: "out of credit",
    });
    expect(r.status).toBe(402);
    const body = (await r.json()) as AiErrorResponse;
    expect(body).toEqual({
      success: false,
      code: "blocked",
      message: "out of credit",
      status: 402,
    });
    expect(isAiErrorResponse(body)).toBe(true);
  });
});

describe("window-context default", () => {
  const origWindow = globalThis.window;

  beforeEach(() => {
    // Simulate a browser pathname when running in a JSDOM-less env.
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: { pathname: "/canvas/foo", search: "?bar=1" },
      },
    });
  });

  afterEach(() => {
    if (origWindow === undefined) {
      // Property was created — delete it.
      delete (globalThis as { window?: unknown }).window;
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: origWindow,
      });
    }
  });

  it("derives next from window.location when not supplied", () => {
    const action = resolveAiError({
      success: false,
      code: "unauthorized",
      message: "login",
      status: 401,
    });
    expect(action).toEqual({
      kind: "redirect",
      href: "/sign-in?next=%2Fcanvas%2Ffoo%3Fbar%3D1",
      reason: "unauthorized",
    });
  });
});
