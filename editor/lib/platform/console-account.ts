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
  return `/sign-in?${new URLSearchParams({ next: accountPath(continuation) })}`;
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
/** Only the source's own form may clear its current web session. */
export async function accountChangeInput(request: Request): Promise<string> {
  const origin = configuredOrigin(process.env.GRIDA_OAUTH_ORIGIN, process.env);
  if (
    request.headers.get("origin") !== origin ||
    request.headers.get("host") !== new URL(origin).host ||
    new URL(request.url).search ||
    !/^application\/x-www-form-urlencoded(?:;|$)/i.test(
      request.headers.get("content-type") ?? ""
    ) ||
    (request.headers.has("sec-fetch-site") &&
      request.headers.get("sec-fetch-site") !== "same-origin")
  )
    throw new BillingConsumerError("forbidden");
  if (!request.body) throw new BillingConsumerError("forbidden");
  const reader = request.body.getReader();
  let text = "",
    size = 0;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 256) throw new BillingConsumerError("forbidden");
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const fields = new URLSearchParams(text);
  if ([...fields.keys()].length !== 1)
    throw new BillingConsumerError("forbidden");
  return accountContinuation(Object.fromEntries(fields));
}
