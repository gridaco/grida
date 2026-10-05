// GRIDA-SEC-010 — typed console return paths never grant organization authority.
import "server-only";
import { destination, organizationRoute } from "./console-destination";
import { billingOwner, configuredOrigin } from "./billing-consumer";
export type ManageSearch = Record<string, string | string[] | undefined>;
export type ManageIntent = "organization" | "settings" | "create-organization";
export class ConsoleManageError extends Error {
  constructor(readonly code: "invalid" | "forbidden" | "unavailable") {
    super("Unable to open organization management.");
  }
}
export function returnDestination(value: unknown): string {
  if (typeof value !== "string" || !value)
    throw new ConsoleManageError("invalid");
  const target = destination(value);
  if (!target) throw new ConsoleManageError("invalid");
  return target;
}
export function manageInput(search: ManageSearch): {
  intent: ManageIntent;
  returnTo: string;
  organizationId: string | undefined;
  error: "create_failed" | "update_failed" | undefined;
} {
  if (
    Object.keys(search).some(
      (k) => !["intent", "org_id", "return_to", "error"].includes(k)
    )
  )
    throw new ConsoleManageError("invalid");
  const intent = search.intent;
  if (
    intent !== "organization" &&
    intent !== "settings" &&
    intent !== "create-organization"
  )
    throw new ConsoleManageError("invalid");
  const returnTo = returnDestination(search.return_to);
  const route = organizationRoute(returnTo.split("?")[0]);
  const orgId = search.org_id;
  if (
    intent === "create-organization"
      ? orgId !== undefined
      : typeof orgId !== "string" ||
        !/^[1-9][0-9]*$/.test(orgId) ||
        BigInt(orgId) > BigInt("9223372036854775807") ||
        route?.organization !== orgId
  )
    throw new ConsoleManageError("invalid");
  const error = search.error;
  if (
    error !== undefined &&
    error !== "create_failed" &&
    error !== "update_failed"
  )
    throw new ConsoleManageError("invalid");
  return {
    intent,
    returnTo,
    organizationId: typeof orgId === "string" ? orgId : route?.organization,
    error,
  };
}
export function managePath(
  intent: ManageIntent,
  returnTo: string,
  organizationId?: string,
  error?: "create_failed" | "update_failed"
): string {
  const params = new URLSearchParams({ intent, return_to: returnTo });
  if (organizationId !== undefined && intent !== "create-organization")
    params.set("org_id", organizationId);
  if (error) params.set("error", error);
  manageInput(Object.fromEntries(params));
  return `/gateway/manage?${params}`;
}
export function consoleReturnURL(value: unknown): string {
  if (billingOwner() !== "infra") throw new ConsoleManageError("forbidden");
  return (
    configuredOrigin(process.env.GRIDA_PLATFORM_CONSOLE_ORIGIN, process.env) +
    returnDestination(value)
  );
}
export function consoleFormOrigin(request: Request): string {
  const source = configuredOrigin(process.env.GRIDA_OAUTH_ORIGIN, process.env);
  if (
    request.headers.get("origin") !== source ||
    request.headers.get("host") !== new URL(source).host
  )
    throw new ConsoleManageError("forbidden");
  return source;
}
type Reader = (
  id: string
) => Promise<{ data: unknown; error: { code?: string } | null }>;
export async function currentConsoleOrganization(
  read: Reader,
  subject: string,
  organizationId: string,
  ownerOnly = false
): Promise<{ id: string; name: string }> {
  const { data, error } = await read(organizationId);
  if (error)
    throw new ConsoleManageError(
      error.code === "42501" ? "forbidden" : "unavailable"
    );
  const result = data as {
    subject?: { id?: unknown };
    organization?: { id?: unknown; name?: unknown; state?: unknown };
    role?: unknown;
  } | null;
  if (
    !result ||
    result.subject?.id !== subject ||
    result.organization?.id !== organizationId ||
    result.organization.state !== "active" ||
    typeof result.organization.name !== "string" ||
    !/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/.test(result.organization.name) ||
    !["member", "owner"].includes(String(result.role)) ||
    (ownerOnly && result.role !== "owner")
  )
    throw new ConsoleManageError("forbidden");
  return { id: organizationId, name: result.organization.name };
}
