import { VercelCore } from "@vercel/sdk/core";
import { domainsDeleteDomain as _domainsDeleteDomain } from "@vercel/sdk/funcs/domainsDeleteDomain";
import { projectsAddProjectDomain as _projectsAddProjectDomain } from "@vercel/sdk/funcs/projectsAddProjectDomain";
import { projectsGetProjectDomain as _projectsGetProjectDomain } from "@vercel/sdk/funcs/projectsGetProjectDomain";
import { projectsGetProjectDomains as _projectsGetProjectDomains } from "@vercel/sdk/funcs/projectsGetProjectDomains";
import { projectsRemoveProjectDomain as _projectsRemoveProjectDomain } from "@vercel/sdk/funcs/projectsRemoveProjectDomain";
import { projectsVerifyProjectDomain as _projectsVerifyProjectDomain } from "@vercel/sdk/funcs/projectsVerifyProjectDomain";

export const VERCEL_AUTH_BEARER_TOKEN =
  process.env.VERCEL_AUTH_BEARER_TOKEN || "";
export const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || "";
export const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID || "";

export const __vercel_core = new VercelCore({
  bearerToken: VERCEL_AUTH_BEARER_TOKEN,
});

export const projectsAddProjectDomain = (domain: string) =>
  _projectsAddProjectDomain(__vercel_core, {
    teamId: VERCEL_TEAM_ID,
    idOrName: VERCEL_PROJECT_ID,
    requestBody: { name: domain },
  });

export const projectsGetProjectDomain = (domain: string) =>
  _projectsGetProjectDomain(__vercel_core, {
    teamId: VERCEL_TEAM_ID,
    idOrName: VERCEL_PROJECT_ID,
    domain,
  });

export const projectsGetProjectDomains = () =>
  _projectsGetProjectDomains(__vercel_core, {
    teamId: VERCEL_TEAM_ID,
    idOrName: VERCEL_PROJECT_ID,
  });

export const projectsRemoveProjectDomain = (domain: string) =>
  _projectsRemoveProjectDomain(__vercel_core, {
    teamId: VERCEL_TEAM_ID,
    idOrName: VERCEL_PROJECT_ID,
    domain,
  });

export const projectsVerifyProjectDomain = (domain: string) =>
  _projectsVerifyProjectDomain(__vercel_core, {
    teamId: VERCEL_TEAM_ID,
    idOrName: VERCEL_PROJECT_ID,
    domain,
  });
