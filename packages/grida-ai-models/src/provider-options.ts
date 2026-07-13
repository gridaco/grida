/**
 * Producer contract for the billing seam's `grida` provider-options key.
 *
 * The Vercel AI SDK's `providerOptions` slot is an OPEN `Record<string,
 * Record<string, JSONValue>>`, so a hand-written `{ grida: {...} }` literal
 * type-checks with ANY keys — which is exactly how a snake_cased
 * `organization_id` shipped past `tsc` and failed only at runtime, when the
 * billing middleware read `organizationId` (camelCase) and found `undefined`.
 *
 * This is the single, typed producer contract shared by EVERY billed call
 * site: the editor seam (`editor/lib/ai/server.ts`, which re-exports this and
 * derives its read-side type from it) AND the framework-free `@grida/agent`
 * package, which cannot import the seam. `organizationId` and `feature` — the
 * two fields the middleware requires — are MANDATORY, so a missing or
 * misspelled key is a compile error at the call site, not a runtime
 * `MissingOrgIdError`. Lives here because `@grida/ai-models` is the one package
 * both sides already depend on.
 *
 * NOTE: this types the org-id KEY; it does NOT verify the org id. Verification
 * (member-org check) is GRIDA-SEC-003's job and lives upstream in the editor's
 * `requireOrganizationId`. Strict in what we produce, lenient in what the seam
 * accepts (the middleware reads defensively).
 */
export type GridaCallProviderOptions = {
  /** Verified organization id. Required. Source: GRIDA-SEC-003 `requireOrganizationId`. */
  organizationId: number;
  /** Free-form feature tag — e.g. `"canvas/svg/agent/chat"`. Diagnostics only. */
  feature: string;
  /** Optional pre-allocated transaction id (idempotency on retry). */
  transactionId?: string;
  /**
   * Explicit cost in mills — used by the image-model middleware, since AI SDK
   * image generation doesn't expose token usage.
   */
  costMills?: number;
  /**
   * Block on the ingest call before returning. Default `false` (fire-and-forget);
   * set `true` when the caller reads back a debited balance in the same request.
   */
  awaitIngest?: boolean;
};

/**
 * Build the `{ grida }` provider-options payload the billing middleware reads.
 *
 * Use at EVERY billed call site instead of a bare `{ grida: {...} }` literal:
 * the typed parameter turns a misspelled / snake_cased / omitted
 * `organizationId` into a compile error. Generic in the argument so the
 * returned literal keeps its exact shape (no phantom optional `| undefined`)
 * and stays assignable to the AI SDK `providerOptions` slot.
 */
export function gridaProviderOptions<T extends GridaCallProviderOptions>(
  options: T
): { grida: T } {
  return { grida: options };
}
