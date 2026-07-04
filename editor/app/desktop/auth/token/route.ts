// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: token — see docs/wg/platform/hosted-ai.md
/**
 * Desktop hosted-AI token mint, same-origin.
 *
 * Exchanges the webview's cookie session for a short-lived, org-scoped
 * AI token (aud `gg:ai`, 15 min) that the renderer hands to the
 * sidecar daemon. The webview session stays the only durable credential
 * (GRIDA-SEC-005): the daemon receives ONLY this scoped token, holds it
 * in memory, and comes back here — via the renderer — for a fresh one.
 *
 * Org binding happens at mint time: the optional `{org_id}` body field
 * is membership-verified (`requireOrganizationId` → `assertOrgMember`);
 * without it the session org resolution applies (last-accessed project's
 * org → first membership — the same priority AI billing uses). The
 * request object is deliberately NOT passed to the resolver: this route
 * accepts no org header, so it adds no new org-id trust input
 * (GRIDA-SEC-003 posture).
 *
 * CSRF posture: responses are only readable same-origin (no CORS on
 * /desktop/*), and the Supabase auth cookies are SameSite=Lax, so a
 * cross-site POST neither carries the session nor reads the token.
 */
import {
  requireOrganizationId,
  resolveSessionOrganization,
} from "@/lib/auth/organization";
import {
  GgTokenError,
  allowGgTokenMint,
  signGgToken,
} from "@/lib/auth/gg-token";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const NO_STORE = { "cache-control": "no-store" } as const;

export async function POST(request: Request) {
  try {
    // Inside the try so a throw from createClient / getUser / the Upstash
    // limiter still yields the JSON no-store envelope, not Next's default 500.
    const client = await createClient();
    const {
      data: { user },
    } = await client.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: { code: "unauthorized" } },
        { status: 401, headers: NO_STORE }
      );
    }

    if (!(await allowGgTokenMint(user.id))) {
      return NextResponse.json(
        { error: { code: "rate_limited" } },
        { status: 429, headers: NO_STORE }
      );
    }

    const org = await resolveMintOrganization(request, user.id, client);
    if (org === null) {
      return NextResponse.json(
        { error: { code: "no_organization" } },
        { status: 409, headers: NO_STORE }
      );
    }

    const { token, expiresAt } = await signGgToken(user.id, org.id);
    return NextResponse.json(
      {
        token,
        expires_at: expiresAt.toISOString(),
        organization: { id: org.id, name: org.name },
      },
      { headers: NO_STORE }
    );
  } catch (err) {
    return errorResponse(err);
  }
}

type MintOrganization = { id: number; name: string };

async function resolveMintOrganization(
  request: Request,
  user_id: string,
  client: Awaited<ReturnType<typeof createClient>>
): Promise<MintOrganization | null> {
  const body = await request.json().catch(() => ({}));
  const inputOrgId = (body as { org_id?: unknown }).org_id;

  if (inputOrgId == null) {
    return await resolveSessionOrganization(user_id);
  }

  if (typeof inputOrgId !== "number" && typeof inputOrgId !== "string") {
    throw new MintRequestError("invalid org_id");
  }
  // Membership-verified (assertOrgMember inside); note: no `request`
  // passed — body input only, never a header.
  const id = await requireOrganizationId({ user_id, inputOrgId });
  const { data: org } = await client
    .from("organization")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  // Member-verified id must be readable under RLS; treat a miss as an
  // internal inconsistency rather than minting with an unknown slug.
  if (!org) throw new Error("organization row unreadable");
  return { id: org.id, name: org.name };
}

class MintRequestError extends Error {}

function errorResponse(err: unknown): NextResponse {
  if (err instanceof GgTokenError && err.code === "not_configured") {
    return NextResponse.json(
      { error: { code: "not_configured" } },
      { status: 503, headers: NO_STORE }
    );
  }
  if (err instanceof MintRequestError) {
    return NextResponse.json(
      { error: { code: "invalid_request" } },
      { status: 400, headers: NO_STORE }
    );
  }
  // `requireOrganizationId` throws BillingError (duck-typed here — the
  // class itself is lint-barred under app/desktop/**). Membership /
  // resolution failures collapse into the no-usable-org state; malformed
  // input is a 400; everything else stays opaque.
  const code = (err as { code?: unknown })?.code;
  if (code === "not_member" || code === "org_not_found") {
    return NextResponse.json(
      { error: { code: "no_organization" } },
      { status: 409, headers: NO_STORE }
    );
  }
  if (code === "invalid_input") {
    return NextResponse.json(
      { error: { code: "invalid_request" } },
      { status: 400, headers: NO_STORE }
    );
  }
  console.error("[desktop-ai-token] mint failed:", err);
  return NextResponse.json(
    { error: { code: "mint_failed" } },
    { status: 500, headers: NO_STORE }
  );
}
