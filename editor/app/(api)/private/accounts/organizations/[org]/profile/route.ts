// GRIDA-SEC-010 — explicit console settings forms retain current owner authority.
import {
  consoleFormOrigin,
  consoleReturnURL,
  currentConsoleOrganization,
  manageInput,
  managePath,
  ConsoleManageError,
} from "@/lib/platform/console-manage";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

type Params = { org: string };

export async function POST(
  req: NextRequest,
  context: {
    params: Promise<Params>;
  }
) {
  const origin = req.nextUrl.origin;
  const { org } = await context.params;

  const client = await createClient();

  const body = await req.formData();

  let continuation: {
    target: string;
    origin: string;
    organizationId: string;
  } | null = null;
  if (body.has("console_return_to") || body.has("console_organization_id")) {
    try {
      if (
        [...body.keys()].some(
          (key) =>
            ![
              "display_name",
              "email",
              "description",
              "blog",
              "console_return_to",
              "console_organization_id",
            ].includes(key)
        ) ||
        ["console_return_to", "console_organization_id"].some(
          (key) => body.getAll(key).length !== 1
        )
      )
        throw new ConsoleManageError("invalid");
      const input = manageInput({
        intent: "settings",
        return_to: String(body.get("console_return_to")),
        org_id: String(body.get("console_organization_id")),
      });
      const sourceOrigin = consoleFormOrigin(req);
      consoleReturnURL(input.returnTo);
      const { data: auth, error } = await client.auth.getUser();
      if (error || !auth.user) throw new ConsoleManageError("forbidden");
      const organization = await currentConsoleOrganization(
        async (id) =>
          await client.rpc(
            "platform_account_context" as never,
            { organization_id: id } as never
          ),
        auth.user.id,
        input.organizationId!,
        true
      );
      if (organization.name !== org) throw new ConsoleManageError("forbidden");
      continuation = {
        target: input.returnTo,
        origin: sourceOrigin,
        organizationId: organization.id,
      };
    } catch (error) {
      return NextResponse.json(
        { error: "organization_unavailable" },
        {
          status:
            error instanceof ConsoleManageError
              ? error.code === "invalid"
                ? 400
                : error.code === "forbidden"
                  ? 403
                  : 503
              : 503,
        }
      );
    }
  }
  const display_name = body.get("display_name");
  const email = body.get("email");
  const description = body.get("description");
  const blog = body.get("blog");

  const { error } = await client
    .from("organization")
    .update({
      display_name: String(display_name),
      email: String(email),
      description: description ? String(description) : undefined,
      blog: blog ? String(blog) : undefined,
    })
    .eq("name", org);

  if (error) {
    if (continuation)
      return NextResponse.redirect(
        new URL(
          managePath(
            "settings",
            continuation.target,
            continuation.organizationId,
            "update_failed"
          ),
          continuation.origin
        ),
        { status: 303 }
      );
    console.error("organization/profile", error);
    return NextResponse.error();
  }

  if (continuation)
    return NextResponse.redirect(
      new URL(
        managePath(
          "settings",
          continuation.target,
          continuation.organizationId
        ),
        continuation.origin
      ),
      { status: 303 }
    );
  return NextResponse.redirect(
    origin + `/organizations/${org}/settings/profile`,
    {
      status: 302,
    }
  );
}
