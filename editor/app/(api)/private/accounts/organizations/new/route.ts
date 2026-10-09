// GRIDA-SEC-010 — candidate console continuation is typed, same-origin and never authority.
import {
  consoleFormOrigin,
  consoleReturnURL,
  currentConsoleOrganization,
  managePath,
  returnDestination,
  ConsoleManageError,
} from "@/lib/platform/console-manage";
import { organizationRoute } from "@/lib/platform/console-destination";
import { createClient, service_role } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const origin = req.nextUrl.origin;

  const body = await req.formData();

  const name = body.get("name");
  const email = body.get("email");

  let continuation: {
    target: string;
    origin: string;
    destination: string;
  } | null = null;
  if (body.has("console_return_to")) {
    try {
      if (
        [...body.keys()].some(
          (key) => !["name", "email", "console_return_to"].includes(key)
        ) ||
        ["name", "email", "console_return_to"].some(
          (key) => body.getAll(key).length !== 1
        )
      )
        throw new ConsoleManageError("invalid");
      const target = returnDestination(body.get("console_return_to"));
      continuation = {
        target,
        origin: consoleFormOrigin(req),
        destination: consoleReturnURL(target),
      };
    } catch (error) {
      return NextResponse.json(
        { error: "invalid_continuation" },
        {
          status:
            error instanceof ConsoleManageError && error.code === "forbidden"
              ? 403
              : 400,
        }
      );
    }
  }
  const client = await createClient();
  const { data: userdata, error: authError } = await client.auth.getUser();
  if (continuation && authError && authError.name !== "AuthSessionMissingError")
    return NextResponse.json({ error: "account_unavailable" }, { status: 503 });
  if (!userdata.user) {
    if (continuation)
      return NextResponse.redirect(
        new URL(
          `/sign-in?next=${encodeURIComponent(managePath("create-organization", continuation.target))}`,
          continuation.origin
        ),
        { status: 303 }
      );
    return NextResponse.redirect(origin + "/sign-in", {
      status: 301,
    });
  }

  if (continuation) {
    const route = organizationRoute(continuation.target.split("?")[0]);
    if (route) {
      try {
        await currentConsoleOrganization(
          async (id) =>
            await client.rpc(
              "platform_account_context" as never,
              { organization_id: id } as never
            ),
          userdata.user.id,
          route.organization
        );
      } catch (error) {
        return NextResponse.json(
          { error: "organization_unavailable" },
          {
            status:
              error instanceof ConsoleManageError && error.code === "forbidden"
                ? 403
                : 503,
          }
        );
      }
    }
  }
  const { data, error } = await service_role.workspace
    .from("organization")
    .insert({
      name: String(name),
      email: email ? String(email) : null,
      owner_id: userdata.user.id,
    })
    .select()
    .single();

  if (error) {
    if (continuation)
      return NextResponse.redirect(
        new URL(
          managePath(
            "create-organization",
            continuation.target,
            undefined,
            "create_failed"
          ),
          continuation.origin
        ),
        { status: 303 }
      );
    console.error(error);

    const q = new URLSearchParams({
      error:
        "An error occurred while creating the organization. Please try again.",
    });

    return NextResponse.redirect(
      origin + "/organizations/new" + "?" + q.toString()
    );
  }

  if (!data) {
    return NextResponse.error();
  }

  if (continuation)
    return NextResponse.redirect(continuation.destination, { status: 303 });
  // TODO: invitation is not ready
  // return NextResponse.redirect(origin + `/organizations/${data.name}/invite`);

  return NextResponse.redirect(origin + `/${data.name}`);
}
