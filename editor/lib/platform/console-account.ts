// GRIDA-SEC-010 — an opaque switch continuation grants navigation, never identity.
import "server-only";
import {
  configuredOrigin,
  platformBilling,
  BillingConsumerError,
} from "./billing-consumer";
import { destination } from "./console-destination";

export function accountContinuation(search: Record<string, unknown>): string {
  if (
    Object.keys(search).length !== 1 ||
    typeof search.continuation !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(search.continuation)
  )
    throw new BillingConsumerError("forbidden");
  return search.continuation;
}
export function accountPath(continuation: string): string {
  return `/gateway/account?${new URLSearchParams({ continuation: accountContinuation({ continuation }) })}`;
}
export function accountSignInPath(continuation: string): string {
  // Auth handlers may see a reverse proxy's internal origin. Bind their next
  // destination to the configured public source instead of resolving a relative path.
  const origin = configuredOrigin(process.env.GRIDA_OAUTH_ORIGIN, process.env);
  return `/sign-in?${new URLSearchParams({ next: origin + accountPath(continuation) })}`;
}
export async function resolveAccountContinuation(
  continuation: string
): Promise<{ returnURL: string; cancelURL: string }> {
  const token = accountContinuation({ continuation });
  const origin = configuredOrigin(
    process.env.GRIDA_PLATFORM_CONSOLE_ORIGIN,
    process.env
  );
  const value = await platformBilling().resolveContinuation(token);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new BillingConsumerError();
  const data = value as Record<string, unknown>;
  const expectedReturn = `${origin}/auth/continue?${new URLSearchParams({ continuation: token })}`;
  if (
    Object.keys(data).length !== 3 ||
    data.purpose !== "switch" ||
    data.return_url !== expectedReturn ||
    typeof data.cancel_url !== "string"
  )
    throw new BillingConsumerError();
  let cancel: URL;
  try {
    cancel = new URL(data.cancel_url);
  } catch {
    throw new BillingConsumerError();
  }
  const target = destination(cancel.pathname + cancel.search);
  if (
    cancel.origin !== origin ||
    cancel.username ||
    cancel.password ||
    cancel.hash ||
    !target ||
    data.cancel_url !== origin + target
  )
    throw new BillingConsumerError();
  return { returnURL: expectedReturn, cancelURL: data.cancel_url };
}
/** Raw request authority for the source web session mutation, independent of proxy URLs. */
export function accountChangeOrigin(headers: Pick<Headers, "get">): string {
  const origin = configuredOrigin(process.env.GRIDA_OAUTH_ORIGIN, process.env);
  if (
    headers.get("origin") !== origin ||
    headers.get("host") !== new URL(origin).host ||
    headers.get("sec-fetch-site") !== "same-origin"
  )
    throw new BillingConsumerError("forbidden");
  return origin;
}
