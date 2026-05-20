/**
 * AI seam — shared error envelope + UX gate router.
 *
 * Every server-side AI surface returns errors in the {@link AiErrorResponse}
 * shape so a single client helper can route the user via the GRIDA-SEC-003
 * gate. Codes are a closed, documented union — extending them requires
 * touching {@link AI_ERROR_CODES} so every consumer (typeguard, switch,
 * tests, docs) updates together.
 *
 * Server-side: `aiErrorResponse`, `orgErrorToAiError`, `billingErrorToAiError`.
 * Client-side: `resolveAiError`, `handleAiFetchErrorResponse`, `isAiErrorResponse`.
 */

import type { BillingError } from "@/lib/billing";
import type { BillingMetronomeError } from "@/lib/billing/metronome";

// ---------------------------------------------------------------------------
// AiErrorCode — single source of truth
// ---------------------------------------------------------------------------

/**
 * Closed set of error codes the AI seam emits to clients.
 *
 * Adding a code: append to this array, add a JSDoc entry below, add a
 * branch to {@link resolveAiError}'s switch (TS exhaustiveness will fail
 * the build until you do), and add a test in `__tests__/error.test.ts`.
 *
 * Code semantics:
 *   - **`unauthorized`** (401) — no signed-in user. Client redirects to
 *     `/sign-in?next=<current>`.
 *   - **`no_organization`** (412) — user is signed in but has no usable
 *     org (no membership row, or a recoverable resolution failure such as
 *     `not_member` / `org_not_found` / `missing_organization_id`). Client
 *     redirects to `/organizations/new?next=<current>`. Real DB lookup
 *     failures are NOT mapped here (see `orgErrorCode`) — they propagate
 *     as exceptions.
 *   - **`blocked`** (402) — gate refused the call (below floor / not
 *     entitled / etc.). Client surfaces a warning toast with a top-up CTA.
 *   - **`bad_request`** (400) — caller-side validation failure (malformed
 *     header / input). Client surfaces an error toast.
 *   - **`internal`** (500) — server-side failure. Message is sanitized
 *     before being sent (raw exception text is logged server-side, never
 *     leaked to the client). Client surfaces a generic error toast.
 */
export const AI_ERROR_CODES = [
  "unauthorized",
  "no_organization",
  "blocked",
  "bad_request",
  "internal",
] as const;

export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

const AI_ERROR_CODE_SET: ReadonlySet<string> = new Set(AI_ERROR_CODES);

/** Type-guard for `AiErrorCode`. */
export function isAiErrorCode(x: unknown): x is AiErrorCode {
  return typeof x === "string" && AI_ERROR_CODE_SET.has(x);
}

export type AiErrorResponse = {
  success: false;
  code: AiErrorCode;
  message: string;
  status: number;
};

/** User-facing message for the `internal` code. Server logs the raw error. */
const INTERNAL_ERROR_MESSAGE = "Something went wrong. Please try again.";

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
 * Classify a {@link requireOrganizationId}-thrown error into an
 * `AiErrorResponse`.
 *
 * Recoverable codes route the user to sign-in or onboarding so the gate
 * doesn't dead-end on a 403. Real DB lookup failures (`org_lookup_failed`)
 * and any code we don't explicitly map are re-thrown so the caller's outer
 * `try/catch` (or the framework) handles them as a generic 500 — they're
 * "unlikely to happen" production faults that should not be silently
 * mapped to a misleading user-facing redirect.
 */
export function orgErrorToAiError(err: unknown): AiErrorResponse {
  const code = orgErrorCode(err);
  return {
    success: false,
    code,
    status: extractStatus(err, 403),
    // Org-resolver `BillingError` messages are constructed by us with no
    // user input, so they're safe to forward (e.g. `organization "foo"
    // not found or not a member`). For non-Error inputs, fall back.
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
    case "missing_organization_id":
    case "org_not_found":
    case "not_member":
      return "no_organization";
    default:
      // `org_lookup_failed` (real DB exception) or any unknown code →
      // do not silently route to onboarding. Re-throw so the caller's
      // outer error handling (route try/catch or framework) treats it
      // as a generic 500. Per project policy: real DB faults are
      // unlikely-to-happen surfaces and should NOT be wrapped in a
      // friendly redirect.
      throw err;
  }
}

/**
 * Classify a {@link BillingMetronomeError} (or any code-bearing error)
 * from the billing seam.
 *
 * `"blocked"` is the only billing failure the user should see verbatim —
 * its message ("AI credit balance is below the floor", etc.) is curated
 * for end-user display. Everything else collapses to `internal` with a
 * sanitized message; the raw exception is logged server-side via
 * `console.error` for debugging but NEVER leaks to the client (could
 * include connection strings, account ids, stack traces, or other
 * provider-internal detail).
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
    message: INTERNAL_ERROR_MESSAGE,
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
 * to `window.location.href = ...` or render a toast. Exhaustive over
 * {@link AiErrorCode}; adding a new code without updating this switch is
 * a TypeScript build failure.
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
        message: err.message || INTERNAL_ERROR_MESSAGE,
        tone: "error",
      };
    default:
      return assertNever(err.code);
  }
}

function assertNever(x: never): never {
  throw new Error(`Unhandled AiErrorCode: ${String(x)}`);
}

/**
 * Validate that `x` matches the {@link AiErrorResponse} shape AND that
 * its `code` is a known {@link AiErrorCode}. An envelope with an unknown
 * `code` is rejected (clients should not be silent about codes the seam
 * never advertises).
 */
export function isAiErrorResponse(x: unknown): x is AiErrorResponse {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    o.success === false &&
    isAiErrorCode(o.code) &&
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
  return { message: fallback ?? INTERNAL_ERROR_MESSAGE };
}
