// TODO(org-home-gate): temporary — see `home-gate.tsx` for the removal plan.
/**
 * Which surface `/<org>` opens: the Console gate, or the "Work" home.
 *
 * Only "work" is remembered, in a browser cookie scoped to the org's path
 * (`Path=/<org>`), so the choice is per organization and per browser. Console
 * is never remembered — it leaves grida.co, and remembering it would turn
 * `/<org>` into a redirect away from the organization's own home.
 */
export namespace OrgHome {
  export const COOKIE = "grida-org-home";
  export const WORK = "work";

  const ONE_YEAR = 60 * 60 * 24 * 365;

  export function isWork(value: string | undefined): boolean {
    return value === WORK;
  }

  /** `document.cookie` assignment that remembers "Work" for `org`. */
  export function workCookie(org: string): string {
    return `${COOKIE}=${WORK}; Path=/${encodeURIComponent(org)}; Max-Age=${ONE_YEAR}; SameSite=Lax`;
  }
}
