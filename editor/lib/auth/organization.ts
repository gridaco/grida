/**
 * `GRIDA-SEC-003` — see [SECURITY.md](../../../SECURITY.md).
 *
 * Resolves an `organizationId` with verified membership for use by the
 * AI seam (and any other org-scoped server code). Threading an org id
 * into the seam is itself a security boundary: an attacker who can
 * choose the id drains another org's credit. The seam refuses to
 * figure out the org; the caller either produces a verified id here, or
 * falls back to the user's session-resolved org (last-accessed project's
 * org → first membership) — same priority as the dashboard route.
 *
 * Priority — first source that yields an id wins:
 *   1. Route-param slug (`[organization_name]` / `[org]`)
 *   2. `X-Grida-Organization-Id` request header
 *   3. Explicit `inputOrgId` (server-action input field)
 *   4. Session — org of the user's last-accessed project, or first
 *      membership row (cross-device since `user_project_access_state` is
 *      DB-backed)
 */

import type { NextRequest } from "next/server";
import { service_role } from "@/lib/supabase/server";
import { assertOrgMember, BillingError } from "@/lib/billing";

const ORG_ID_HEADER = "x-grida-organization-id";

export type RequireOrganizationIdOptions = {
  /** Authenticated user id. Required (call after `auth.getUser()`). */
  user_id: string;
  /** Incoming request — used to read the `X-Grida-Organization-Id` header. */
  request?: NextRequest | Request;
  /** Resolved route params for the current handler. */
  routeParams?: { organization_name?: string; org?: string };
  /** Explicit org id supplied by the caller (server-action input). */
  inputOrgId?: number | string | null;
};

/**
 * Resolve an organization id with verified membership. Throws
 * {@link BillingError} on any failure — codes:
 *   - `unauthorized` (401) — empty `user_id`
 *   - `missing_organization_id` (400) — no source supplied an id
 *   - `org_not_found` (404) — slug doesn't resolve to a member-org
 *   - `invalid_header` / `invalid_input` (400) — malformed values
 *   - `not_member` (403) — id resolved but user has no membership
 */
export async function requireOrganizationId(
  opts: RequireOrganizationIdOptions
): Promise<number> {
  if (!opts.user_id) {
    throw new BillingError(
      "requireOrganizationId: missing user_id",
      "unauthorized",
      401
    );
  }

  const slug = opts.routeParams?.organization_name ?? opts.routeParams?.org;
  if (slug) {
    // Single JOIN: returns a row IFF the user is a member of the org
    // with this slug. Saves one Supabase round-trip vs. resolving the
    // slug then checking membership.
    const id = await resolveMemberOrgIdBySlug(opts.user_id, slug);
    if (id !== null) return id;
    throw new BillingError(
      `organization "${slug}" not found or not a member`,
      "org_not_found",
      404
    );
  }

  const header = opts.request?.headers.get(ORG_ID_HEADER);
  if (header) {
    const id = parsePositiveInt(header);
    if (id === null) {
      throw new BillingError(
        `invalid ${ORG_ID_HEADER} header: "${header}"`,
        "invalid_header",
        400
      );
    }
    await assertOrgMember(opts.user_id, id);
    return id;
  }

  if (opts.inputOrgId != null && opts.inputOrgId !== "") {
    const id =
      typeof opts.inputOrgId === "number"
        ? opts.inputOrgId
        : parsePositiveInt(String(opts.inputOrgId));
    if (id === null) {
      throw new BillingError(
        `invalid organizationId input: "${String(opts.inputOrgId)}"`,
        "invalid_input",
        400
      );
    }
    await assertOrgMember(opts.user_id, id);
    return id;
  }

  // Session fallback — last-accessed org if still a current member,
  // else first current membership. Membership is established by the
  // resolver itself (gated on `get_organizations_for_user`), so no
  // separate `assertOrgMember` round-trip is needed.
  const sessionOrgId = await resolveSessionOrganizationId(opts.user_id);
  if (sessionOrgId !== null) return sessionOrgId;

  throw new BillingError(
    "no organizationId resolved (route param / header / input / session all missing)",
    "missing_organization_id",
    400
  );
}

export type SessionOrganization = { id: number; name: string };

/**
 * Resolve the user's "current organization" for the session, mirroring
 * the dashboard route's priority while making stale-membership escalation
 * structurally impossible:
 *
 *   1. The org of the user's last-accessed project — *only if* the user
 *      is still a current member. `user_project_access_state` is purely
 *      a UX preference and is never trusted on its own.
 *   2. The first org from `public.get_organizations_for_user(user_id)`.
 *
 * The set of "current" memberships always comes from the
 * `get_organizations_for_user` RPC (`SECURITY DEFINER`, joins
 * `organization_member` filtered by `user_id`). Returns `null` when the
 * user has no membership at all. Cross-device: state is DB-backed so a
 * new device picks up the same preference without local cookies.
 */
export async function resolveSessionOrganization(
  user_id: string
): Promise<SessionOrganization | null> {
  const { data: memberOrgIds } = await service_role.workspace.rpc(
    "get_organizations_for_user",
    { user_id }
  );
  if (!memberOrgIds || memberOrgIds.length === 0) return null;

  const { data: state } = await service_role.workspace
    .from("user_project_access_state")
    .select("project:project(organization_id)")
    .eq("user_id", user_id)
    .maybeSingle();

  const projectRow = state?.project;
  const project = Array.isArray(projectRow) ? projectRow[0] : projectRow;
  const lastOrgId =
    typeof project?.organization_id === "number"
      ? project.organization_id
      : null;

  // Honour the last-accessed preference only if it intersects current
  // membership — otherwise fall back to the first current membership.
  const chosenId =
    lastOrgId !== null && memberOrgIds.includes(lastOrgId)
      ? lastOrgId
      : memberOrgIds[0]!;

  const { data: org } = await service_role.workspace
    .from("organization")
    .select("id, name")
    .eq("id", chosenId)
    .maybeSingle();

  return org ?? null;
}

/** Id-only convenience around {@link resolveSessionOrganization}. */
export async function resolveSessionOrganizationId(
  user_id: string
): Promise<number | null> {
  const org = await resolveSessionOrganization(user_id);
  return org?.id ?? null;
}

function parsePositiveInt(value: string): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

async function resolveMemberOrgIdBySlug(
  user_id: string,
  slug: string
): Promise<number | null> {
  // `service_role` bypasses RLS for the slug→id lookup; the inner
  // `organization_member` filter on `user_id` is what establishes trust.
  const { data, error } = await service_role.workspace
    .from("organization_member")
    .select("organization!inner(id)")
    .eq("user_id", user_id)
    .eq("organization.name", slug)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new BillingError(
      `org slug lookup failed: ${error.message}`,
      "org_lookup_failed",
      500
    );
  }
  const org = data?.organization;
  if (!org) return null;
  // Supabase nested-relation types occasionally widen to array; narrow
  // back to a single row since the FK is many-to-one.
  return Array.isArray(org) ? (org[0]?.id ?? null) : (org.id ?? null);
}
