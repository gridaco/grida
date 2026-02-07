/**
 * Tenant site URL builder (canonical-domain aware).
 *
 * This module centralizes how we build a tenant-site base URL from:
 * - `www_name`: the tenant identifier (`grida_www.www.name`)
 * - `www_route_path`: the route path prefix (typically `grida_www.public_route.route_path`)
 *
 * Why this exists:
 * - Some share links (e.g. WEST referral invites) must use the tenant's **canonical custom domain**
 *   when configured, instead of always using the platform hostname (`{www_name}.grida.site`).
 *
 * Key behavior:
 * - When `hosted=false` (local dev), we keep the existing `tenant.localhost:3000` scheme and
 *   **do not** attempt canonical-domain resolution.
 * - When `hosted=true` and `prefer_canonical=true`, we resolve the canonical hostname via the
 *   service-role-only public RPC `www_get_canonical_hostname`.
 * - If no canonical hostname is configured (or the RPC errors), we fall back to the platform host
 *   under `DEFAULT_PLATFORM_APEX_DOMAIN`.
 *
 * Notes:
 * - This is intended for server-side usage (Route Handlers / middleware), since it uses service role.
 */
import {
  DEFAULT_PLATFORM_APEX_DOMAIN,
  platformSiteHostnameForTenant,
} from "@/lib/domains";
import { serviceRolePublicClient } from "@/lib/supabase/service-role-cookie-free-clients";

async function getCanonicalHostnameForTenant(
  www_name: string
): Promise<string | null> {
  const pub = serviceRolePublicClient();

  const { data, error } = await pub.rpc("www_get_canonical_hostname", {
    p_www_name: www_name,
  });

  if (error) return null;
  const hostname = data?.[0]?.canonical_hostname;
  return typeof hostname === "string" && hostname.length > 0 ? hostname : null;
}

function normalizeRoutePath(www_route_path?: string | null): string {
  const raw = (www_route_path ?? "").trim();
  if (!raw) return "";
  if (raw === "/") return "";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

/**
 * Builds the **tenant site base URL** (origin + optional route prefix), without a trailing slash.
 *
 * Return shape:
 * - Always returns a string that **does not end with `/`**
 * - Examples:\n+ *   - `https://acme.example.com/west`\n+ *   - `https://acme.grida.site/west`\n+ *   - `http://acme.localhost:3000/west`\n+ *   - `https://acme.grida.site` (when `www_route_path` is empty)\n+ *
 * Intended usage:\n+ * - Build links by simple templating: `${base}/t/${code}`\n+ */
export async function buildTenantSiteBaseUrl({
  www_name,
  www_route_path,
  hosted,
  prefer_canonical,
}: {
  www_name: string;
  www_route_path?: string | null;
  hosted: boolean;
  prefer_canonical?: boolean;
}): Promise<string> {
  const route = normalizeRoutePath(www_route_path);

  // Local dev tenant routing uses `tenant.localhost:3000`.
  // We intentionally do not attempt canonical-domain resolution in local dev.
  if (!hosted) {
    return `http://${www_name}.localhost:3000${route}`;
  }

  const platformHost = platformSiteHostnameForTenant(
    www_name,
    DEFAULT_PLATFORM_APEX_DOMAIN
  );

  const canonicalHost = prefer_canonical
    ? await getCanonicalHostnameForTenant(www_name)
    : null;

  return `https://${canonicalHost ?? platformHost}${route}`;
}

