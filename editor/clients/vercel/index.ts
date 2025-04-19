import { VercelCore } from "@vercel/sdk/core";
import { domainsDeleteDomain as _domainsDeleteDomain } from "@vercel/sdk/funcs/domainsDeleteDomain";
import { projectsVerifyProjectDomain as _projectsVerifyProjectDomain } from "@vercel/sdk/funcs/projectsVerifyProjectDomain";

const VERCEL_AUTH_BEARER_TOKEN = process.env.VERCEL_AUTH_BEARER_TOKEN || "";
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || "";
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID || "";

export const __vercel_core = new VercelCore({
  bearerToken: VERCEL_AUTH_BEARER_TOKEN,
});

// export const domainsDeleteDomain = (domain: string) =>
//   _domainsDeleteDomain(__vercel_core, {
//     teamId: VERCEL_TEAM_ID,
//     domain,
//   });

export const projectsVerifyProjectDomain = (domain: string) =>
  _projectsVerifyProjectDomain(__vercel_core, {
    teamId: VERCEL_TEAM_ID,
    idOrName: VERCEL_PROJECT_ID,
    domain,
  });
