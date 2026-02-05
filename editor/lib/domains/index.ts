export type DomainKind = "apex" | "subdomain";
export type DomainStatus = "pending" | "active" | "error";

export type DomainRegistryEntry = {
  hostname: string; // normalized hostname (lowercase, no port)
  www_name: string; // tenant identifier (grida_www.www.name)
  canonical_host: string; // the tenant's canonical hostname (may be platform host)
};

/**
 * Normalizes user / request host input into a hostname.
 *
 * Rules:
 * - lowercase
 * - no scheme, path, query, fragment
 * - no port
 * - no trailing dot
 */
export function normalizeHostname(input: string): string | null {
  const raw = input.trim().toLowerCase();
  if (!raw) return null;

  // Disallow obvious non-hostname forms.
  if (raw.includes("://")) return null;
  if (raw.includes("/") || raw.includes("?") || raw.includes("#")) return null;

  // Ports are not part of domain identity.
  if (raw.includes(":")) return null;

  const normalized = raw.endsWith(".") ? raw.slice(0, -1) : raw;
  if (!normalized) return null;

  // Validate using URL parsing (hostname only).
  try {
    const u = new URL(`https://${normalized}`);
    if (u.hostname !== normalized) return null;
  } catch {
    return null;
  }

  return normalized;
}

export function getDomainKind(hostname: string): DomainKind {
  // Heuristic: if it has exactly one dot, it is an apex domain (example.com).
  // Any additional label makes it a subdomain (app.example.com).
  const parts = hostname.split(".").filter(Boolean);
  return parts.length === 2 ? "apex" : "subdomain";
}

export function isPlatformHostname(hostname: string, platformSuffix: string) {
  if (hostname === platformSuffix) return true;
  return hostname.endsWith(`.${platformSuffix}`);
}

/**
 * Reserved app apex domains.
 *
 * These are *not* tenant domains and must never be claimable by user-owned custom domains.
 *
 * Rationale:
 * - prevent "hijacking" Grida-controlled hostnames like `hacked.grida.co`
 * - keep host-based routing invariant predictable
 *
 * This is intentionally **code-managed** (not env-managed) for stronger guarantees.
 */
export const APP_APEX_DOMAINS = new Set(["grida.co", "bridged.xyz"]);

/**
 * Platform-owned apex domains used for tenant sites.
 *
 * Users can choose tenant subdomains under these suffixes (e.g. `my-site.grida.site`).
 * This is code-managed as a source of truth.
 */
export const PLATFORM_APEX_DOMAINS = new Set(["grida.site", "grida.app"]);

/**
 * Canonical platform suffix when no custom domain is set.
 *
 * We enforce a single canonical hostname per tenant; when a request comes in via
 * another platform suffix (e.g. `.grida.app`), we redirect to this default unless
 * a custom domain is canonical.
 */
export const DEFAULT_PLATFORM_APEX_DOMAIN = "grida.site";

export function isPlatformSiteHostname(hostname: string) {
  const h = hostname.trim().toLowerCase();
  if (!h) return false;
  for (const apex of PLATFORM_APEX_DOMAINS) {
    if (h === apex) return true;
    if (h.endsWith(`.${apex}`)) return true;
  }
  return false;
}

export function platformSiteTenantFromHostname(hostname: string) {
  const h = hostname.trim().toLowerCase();
  if (!h) return null;
  for (const apex of PLATFORM_APEX_DOMAINS) {
    const suffix = `.${apex}`;
    if (h.endsWith(suffix)) {
      const sub = h.slice(0, -suffix.length);
      return sub ? { tenant: sub, apex } : null;
    }
  }
  return null;
}

export function platformSiteHostnameForTenant(
  tenant: string,
  apex: string = DEFAULT_PLATFORM_APEX_DOMAIN
) {
  return `${tenant}.${apex}`;
}

/**
 * True if the hostname is part of Grida's own app namespace.
 * This reserves the apex *and* all subdomains under it.
 */
export function isReservedAppHostname(hostname: string) {
  const h = hostname.trim().toLowerCase();
  if (!h) return false;
  for (const apex of APP_APEX_DOMAINS) {
    if (h === apex) return true;
    if (h.endsWith(`.${apex}`)) return true;
  }
  return false;
}

/**
 * Hostname blacklist (code-owned).
 *
 * Why so strict:
 * - Some provider-owned hostnames (notably Vercel) can be *immediately* verified/linked,
 *   which creates a hijack surface if we allow users to attach them.
 * - We do not have a reliable, complete, and up-to-date way to enumerate all Vercel-provided
 *   hostnames or suffixes (and we do not want to maintain one).
 *
 * Therefore, we intentionally block any hostname containing the substring "vercel".
 * This includes `.vercel.app`, `vercel-dns.com`, and also user-owned domains that merely
 * contain the keyword (e.g. `i-bought-vercel-keyword-containing-domain.com`).
 */
export function isBlacklistedHostname(hostname: string) {
  const h = hostname.trim().toLowerCase();
  if (!h) return false;
  return h.includes("vercel");
}
