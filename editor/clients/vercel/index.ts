import { VercelCore } from "@vercel/sdk/core";
import { domainsDeleteDomain as _domainsDeleteDomain } from "@vercel/sdk/funcs/domainsDeleteDomain";
import { projectsAddProjectDomain as _projectsAddProjectDomain } from "@vercel/sdk/funcs/projectsAddProjectDomain";
import { projectsGetProjectDomain as _projectsGetProjectDomain } from "@vercel/sdk/funcs/projectsGetProjectDomain";
import { projectsGetProjectDomains as _projectsGetProjectDomains } from "@vercel/sdk/funcs/projectsGetProjectDomains";
import { projectsRemoveProjectDomain as _projectsRemoveProjectDomain } from "@vercel/sdk/funcs/projectsRemoveProjectDomain";
import { projectsVerifyProjectDomain as _projectsVerifyProjectDomain } from "@vercel/sdk/funcs/projectsVerifyProjectDomain";
import { unwrapAsync } from "@vercel/sdk/types/fp";

export const VERCEL_AUTH_BEARER_TOKEN =
  process.env.VERCEL_AUTH_BEARER_TOKEN || "";
export const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || "";
export const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID || "";

export const __vercel_core = new VercelCore({
  bearerToken: VERCEL_AUTH_BEARER_TOKEN,
});

/**
 * Fetch domain configuration from Vercel REST API.
 *
 * We intentionally use raw fetch (not the SDK model) because the REST endpoint
 * returns additional fields (e.g. `recommendedCNAME`, `recommendedIPv4`, `conflicts`)
 * that are useful for DNS instructions, and the generated SDK schemas may strip them.
 */
export async function vercelGetDomainConfig(domain: string) {
  const url = new URL(
    `https://api.vercel.com/v6/domains/${encodeURIComponent(domain)}/config`
  );
  if (VERCEL_TEAM_ID) url.searchParams.set("teamId", VERCEL_TEAM_ID);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${VERCEL_AUTH_BEARER_TOKEN}`,
      Accept: "application/json",
    },
    // Never cache; this is used for UI correctness, not performance.
    cache: "no-store",
  });

  const bodyText = await res.text().catch(() => "");
  let json: unknown = null;
  try {
    json = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    json = { raw: bodyText } satisfies Record<string, unknown>;
  }

  if (!res.ok) {
    const message =
      typeof (json as { error?: { message?: unknown } })?.error?.message ===
      "string"
        ? (json as { error: { message: string } }).error.message
        : `Vercel getDomainConfig failed (${res.status}).`;
    const err = new Error(message) as Error & { status?: number; body?: unknown };
    err.status = res.status;
    err.body = json;
    throw err;
  }

  return json;
}

export const projectsAddProjectDomain = async (domain: string) =>
  unwrapAsync(
    _projectsAddProjectDomain(__vercel_core, {
      teamId: VERCEL_TEAM_ID,
      idOrName: VERCEL_PROJECT_ID,
      requestBody: { name: domain },
    })
  );

export const projectsGetProjectDomain = async (domain: string) =>
  unwrapAsync(
    _projectsGetProjectDomain(__vercel_core, {
      teamId: VERCEL_TEAM_ID,
      idOrName: VERCEL_PROJECT_ID,
      domain,
    })
  );

export const projectsGetProjectDomains = async () =>
  unwrapAsync(
    _projectsGetProjectDomains(__vercel_core, {
      teamId: VERCEL_TEAM_ID,
      idOrName: VERCEL_PROJECT_ID,
    })
  );

export const projectsRemoveProjectDomain = async (domain: string) =>
  unwrapAsync(
    _projectsRemoveProjectDomain(__vercel_core, {
      teamId: VERCEL_TEAM_ID,
      idOrName: VERCEL_PROJECT_ID,
      domain,
    })
  );

export const projectsVerifyProjectDomain = async (domain: string) =>
  unwrapAsync(
    _projectsVerifyProjectDomain(__vercel_core, {
      teamId: VERCEL_TEAM_ID,
      idOrName: VERCEL_PROJECT_ID,
      domain,
    })
  );

// TODO: add typed wrappers for other endpoints as needed.

export const domainsDeleteDomain = async (domain: string) =>
  unwrapAsync(
    _domainsDeleteDomain(__vercel_core, {
      teamId: VERCEL_TEAM_ID,
      domain,
    })
  );
