/**
 * GRIDA-SEC-005 — one account-state classification for Desktop server routes.
 *
 * A missing/invalid session is signed out. A retryable, upstream, or
 * unclassified auth failure is unavailable and must never be presented as a
 * deliberate sign-out.
 */
export namespace desktop_account_session {
  export type State = "signed-in" | "signed-out" | "unavailable";

  export function classify(input: {
    has_user: boolean;
    error: unknown;
  }): State {
    if (input.has_user) return "signed-in";
    if (!input.error) return "signed-out";
    if (typeof input.error !== "object") return "unavailable";

    const candidate = input.error as { name?: unknown; status?: unknown };
    if (candidate.name === "AuthSessionMissingError") return "signed-out";
    if (candidate.name === "AuthRetryableFetchError") return "unavailable";
    if (typeof candidate.status === "number") {
      // Only authentication-shaped failures are evidence of a missing or
      // invalid session. Timeouts, rate limits, missing upstream routes, and
      // every other unclassified status fail closed as unavailable.
      return candidate.status === 400 ||
        candidate.status === 401 ||
        candidate.status === 403
        ? "signed-out"
        : "unavailable";
    }
    return "unavailable";
  }
}
