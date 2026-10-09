// GRIDA-EE: billing — canonical Grida management with an exact non-secret console return.
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@app/ui/components/button";
import { Alert, AlertDescription } from "@app/ui/components/alert";
import OrganizationMembers from "@/app/(site)/organizations/[organization_name]/people/page";
import OrganizationSettings from "@/app/(site)/organizations/[organization_name]/settings/profile/view";
import NewOrganization from "@/app/(site)/organizations/new/form";
import {
  consoleReturnURL,
  currentConsoleOrganization,
  manageInput,
  managePath,
  ConsoleManageError,
  type ManageSearch,
} from "@/lib/platform/console-manage";
export default async function ManagePage({
  searchParams,
}: {
  searchParams: Promise<ManageSearch>;
}) {
  const search = await searchParams;
  let input;
  try {
    input = manageInput(search);
  } catch {
    return notFound();
  }
  const returnURL = consoleReturnURL(input.returnTo);
  const client = await createClient();
  const { data: auth, error } = await client.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError")
    throw new ConsoleManageError("unavailable");
  if (!auth.user)
    return redirect(
      `/sign-in?next=${encodeURIComponent(managePath(input.intent, input.returnTo, input.organizationId))}`
    );
  let organization;
  if (input.organizationId) {
    try {
      organization = await currentConsoleOrganization(
        async (id) =>
          await client.rpc(
            "platform_account_context" as never,
            { organization_id: id } as never
          ),
        auth.user.id,
        input.organizationId,
        input.intent === "settings"
      );
    } catch (error) {
      if (error instanceof ConsoleManageError && error.code === "forbidden")
        return notFound();
      throw error;
    }
  }
  return (
    <>
      <div className="mx-auto flex max-w-screen-md justify-end px-6 pt-8">
        <Button asChild variant="outline">
          <Link href={returnURL} prefetch={false}>
            Back to console
          </Link>
        </Button>
      </div>
      {input.error === "update_failed" && (
        <Alert variant="destructive" className="mx-auto mt-4 max-w-screen-md">
          <AlertDescription>
            Unable to save the organization. Please try again.
          </AlertDescription>
        </Alert>
      )}
      {input.intent === "create-organization" ? (
        <NewOrganization
          searchParams={Promise.resolve(
            input.error
              ? {
                  error: "Unable to create the organization. Please try again.",
                }
              : {}
          )}
          consoleReturnTo={input.returnTo}
        />
      ) : input.intent === "settings" ? (
        <OrganizationSettings
          params={Promise.resolve({ organization_name: organization!.name })}
          consoleReturnTo={input.returnTo}
          consoleOrganizationId={organization!.id}
        />
      ) : (
        <OrganizationMembers
          params={Promise.resolve({ organization_name: organization!.name })}
        />
      )}
    </>
  );
}
