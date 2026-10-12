// Outbound links into the Console (console.grida.co).
import "server-only";
import { configuredOrigin } from "./billing-consumer";
import { validOrganizationSlug } from "./console-destination";

type Environment = Readonly<Record<string, string | undefined>>;

/**
 * Single source for Console page URLs that Grida links out to. When the
 * Console's URL spec changes, update the templates here.
 *
 * Billing pages are built by `consoleBillingUrl` (billing-consumer.ts), and the
 * inbound return-destination grammar lives in `organizationRoute`
 * (console-destination.ts) — keep all three in step.
 */
export namespace ConsoleLinks {
  /** Public Console origin, used when no deployment origin is configured. */
  const PUBLIC_ORIGIN = "https://console.grida.co";

  /** Configured Console origin, or the public one when unset (e.g. local). */
  function origin(env: Environment): string {
    try {
      return configuredOrigin(env.GRIDA_PLATFORM_CONSOLE_ORIGIN, env);
    } catch {
      return PUBLIC_ORIGIN;
    }
  }

  /**
   * The Console AI Gateway page — the organization's own when `org` is a
   * Console-routable slug, otherwise the universal entry (where the Console
   * asks for an organization).
   */
  export function aiGateway(org?: string, env: Environment = process.env) {
    const path =
      org && validOrganizationSlug(org)
        ? `/organizations/${org}/ai-gateway`
        : "/_/ai-gateway";
    return origin(env) + path;
  }
}
