/**
 * GRIDA-SEC-004 — `grida://` deep-link router.
 *
 * V1 ships no OAuth callback flow, so the router only validates and
 * ignores known/unknown deep links. Future deep links
 * (`grida://open/...`, provider callbacks, etc.) land here as explicit
 * switch arms with their own trust-boundary review.
 */

/**
 * Route a `grida://` URL. Returns `true` when the URL was consumed and
 * should not be retried by the main-process queue.
 */
export async function routeDeepLink(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    console.warn(`[grida] malformed deep link, ignoring: ${url}`);
    return true;
  }
  if (parsed.protocol !== "grida:") {
    console.warn(`[grida] non-grida protocol, ignoring: ${parsed.protocol}`);
    return true;
  }
  console.log(`[grida] deep link host not handled: ${parsed.hostname}`);
  return true;
}
