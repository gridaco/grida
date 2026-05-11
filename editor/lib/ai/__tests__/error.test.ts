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

  it("membership / unknown failures → no_organization (onboarding flow)", () => {
    const e = orgErrorToAiError({
      code: "not_member",
      status: 403,
      message: "not member",
    });
    expect(e.code).toBe("no_organization");
  });

  it("non-error object → no_organization, 403", () => {
    const e = orgErrorToAiError("string");
    expect(e.code).toBe("no_organization");
    expect(e.status).toBe(403);
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
