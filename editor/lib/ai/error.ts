/**
 * AI seam — shared error envelope + UX gate router.
 *
 * Every server-side AI surface returns errors in the {@link AiErrorResponse}
 * shape so a single client helper can route the user via the 2-step
 * GRIDA-SEC-003 gate:
 *   - `unauthorized` (401)    → `/sign-in?next=<current>`
 *   - `no_organization` (412) → `/organizations/new?next=<current>`
 *   - `blocked` (402)         → toast + top-up CTA
 *   - `bad_request` (400)     → toast
 *   - `internal` (500)        → toast
 *
 * Server-side: `aiErrorResponse`, `orgErrorToAiError`, `billingErrorToAiError`.
 * Client-side: `resolveAiError`, `handleAiFetchErrorResponse`, `isAiErrorResponse`.
 */

import type { BillingError } from "@/lib/billing";
import type { BillingMetronomeError } from "@/lib/billing/metronome";

export type AiErrorCode =
  | "unauthorized"
  | "no_organization"
  | "blocked"
  | "bad_request"
  | "internal";

export type AiErrorResponse = {
  success: false;
  code: AiErrorCode;
  message: string;
  status: number;
};

// ---------------------------------------------------------------------------
// Server-side helpers
// ---------------------------------------------------------------------------

/** Build a `Response` with the standard AI error envelope. */
export function aiErrorResponse(opts: {
  code: AiErrorCode;
  status: number;
  message: string;
}): Response {
  const body: AiErrorResponse = {
    success: false,
    code: opts.code,
    message: opts.message,
    status: opts.status,
  };
  return new Response(JSON.stringify(body), {
    status: opts.status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Classify a `requireOrganizationId` (or any code-bearing) error.
 *
 * "no usable org" outcomes (missing id, slug miss, non-member) collapse
 * to `no_organization` so the client routes to `/organizations/new`
 * rather than dead-ending on 403.
 */
export function orgErrorToAiError(err: unknown): AiErrorResponse {
  const code = orgErrorCode(err);
  return {
    success: false,
    code,
    status: extractStatus(err, 403),
    message: err instanceof Error ? err.message : "forbidden",
  };
}

function orgErrorCode(err: unknown): AiErrorCode {
  const c = errorCode(err);
  switch (c) {
    case "unauthorized":
      return "unauthorized";
    case "invalid_header":
    case "invalid_input":
      return "bad_request";
    // missing_organization_id, org_not_found, not_member, org_lookup_failed,
    // and any unknown code → onboarding path. Better than a 403 dead-end.
    default:
      return "no_organization";
  }
}

/**
 * Classify a {@link BillingMetronomeError} (or any code-bearing error)
 * from the billing seam: only `"blocked"` is surfaced to the client as
 * a gate denial; everything else is an internal failure.
 */
export function billingErrorToAiError(
  err: BillingError | BillingMetronomeError | unknown,
  scope: string
): AiErrorResponse {
  if (errorCode(err) === "blocked") {
    return {
      success: false,
      code: "blocked",
      status: extractStatus(err, 402),
      message: err instanceof Error ? err.message : "blocked",
    };
  }
  console.error(`[${scope}]`, err);
  return {
    success: false,
    code: "internal",
    status: extractStatus(err, 500),
    message: err instanceof Error ? err.message : "something went wrong",
  };
}

function errorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const c = (err as { code: unknown }).code;
    return typeof c === "string" ? c : undefined;
  }
  return undefined;
}

function extractStatus(err: unknown, fallback: number): number {
  if (err && typeof err === "object" && "status" in err) {
    const s = Number((err as { status: unknown }).status);
    if (Number.isFinite(s) && s > 0) return s;
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Client-side gate router
// ---------------------------------------------------------------------------

export type AiErrorAction =
  | { kind: "redirect"; href: string; reason: AiErrorCode }
  | { kind: "toast"; message: string; tone: "error" | "warning" };

export type ResolveAiErrorOptions = {
  /** Return-to path after sign-in/onboarding. Defaults to current location. */
  next?: string;
};

/**
 * Map an `AiErrorResponse` to an action. Pure — caller decides whether
 * to `window.location.href = ...` or render a toast.
 */
export function resolveAiError(
  err: AiErrorResponse,
  opts: ResolveAiErrorOptions = {}
): AiErrorAction {
  const next =
    opts.next ??
    (typeof window === "undefined"
      ? "/"
      : window.location.pathname + window.location.search);
  const encoded = encodeURIComponent(next);

  switch (err.code) {
    case "unauthorized":
      return {
        kind: "redirect",
        href: `/sign-in?next=${encoded}`,
        reason: "unauthorized",
      };
    case "no_organization":
      return {
        kind: "redirect",
        href: `/organizations/new?next=${encoded}`,
        reason: "no_organization",
      };
    case "blocked":
      return {
        kind: "toast",
        message: err.message || "AI credit balance is below the minimum.",
        tone: "warning",
      };
    case "bad_request":
      return {
        kind: "toast",
        message: err.message || "Bad request.",
        tone: "error",
      };
    case "internal":
      return {
        kind: "toast",
        message: err.message || "Something went wrong.",
        tone: "error",
      };
  }
}

export function isAiErrorResponse(x: unknown): x is AiErrorResponse {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    o.success === false &&
    typeof o.code === "string" &&
    typeof o.message === "string" &&
    typeof o.status === "number"
  );
}

/**
 * Client-side fetch helper: given a `!res.ok` Response, parse it and
 * either redirect (2-step gate) or return a user-visible message.
 *
 * Returns `null` if the client navigated away (caller should bail);
 * otherwise returns `{ message }` for the caller to surface.
 */
export async function handleAiFetchErrorResponse(
  res: Response
): Promise<{ message: string } | null> {
  const data = (await res.json().catch(() => ({}))) as unknown;
  if (isAiErrorResponse(data)) {
    const action = resolveAiError(data);
    if (action.kind === "redirect") {
      // GRIDA-SEC-003 2-step gate: hard navigation to sign-in /
      // onboarding. Returning `null` so callers short-circuit.
      window.location.href = action.href;
      return null;
    }
    return { message: action.message };
  }
  const fallback = (data as { message?: string }).message;
  return { message: fallback ?? "something went wrong" };
}
