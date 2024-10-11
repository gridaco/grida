import { Env } from "@/env";
import { editorlink, formlink } from "@/lib/forms/url";
import {
  createRouteHandlerClient,
  workspaceclient,
} from "@/lib/supabase/server";
import { JSONFrom2DB } from "@/services/new/json2db";
import { JSONFormParser } from "@/types";
import assert from "assert";
import { customAlphabet } from "nanoid";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
// custom nanoid to set to meet organization name pattern - '^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$'
const nanoid = customAlphabet(alphabet, 39);

/**
 * FIXME: this uses generated / default flow instead of letting user to choose the project
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient(cookieStore);

  const gist = form.get("gist");
  const src = form.get("src");

  assert(src, "src is required");

  // upsert the gist - this is used for temporal storage on this flow.
  const { data, error: _gist_upsertion_error } = await supabase
    .from("gist")
    .upsert(
      {
        data: {
          slig: gist ? String(gist) : undefined,
          ["form.json"]: String(src),
        },
      },
      {
        onConflict: "slug",
      }
    )
    .select()
    .single();

  console.log("upserted gist", data);

  if (_gist_upsertion_error) {
    console.error(_gist_upsertion_error);
    return NextResponse.error();
  }

  // check if user is logged in
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    // redirect back to playground, atm, user need to click the publish button again.
    return NextResponse.redirect(
      Env.web.HOST + `/sign-in?next=/playground/${data.slug}`,
      {
        status: 302,
      }
    );
  }

  let ORG: { id: number; name: string } | null = null;
  let PROJECT: { id: number; name: string } | null = null;

  // check if user has a project as a owner
  // get the user owned organization
  // TODO: WROKSPACE MANAGEMENT
  const { data: org, error } = await workspaceclient
    .from("organization")
    .select(`*, projects:project(*)`)
    .eq("owner_id", auth.user.id)
    .limit(1)
    .single();

  console.log("fetch existing org", org, error);

  if (!org) {
    // 1. create org if not exists
    const { data: neworg, error } = await workspaceclient
      .from("organization")
      .insert({
        owner_id: auth.user.id,
        name: nanoid(8), // TODO: this is bad. let user to choose the name
      })
      .select()
      .single();

    if (error) console.error(error);
    assert(neworg, "failed to create organization");

    ORG = neworg;
  } else {
    ORG = org;
    if (org.projects.length > 0) {
      // TODO: this is bad
      PROJECT = org.projects[0];
    }
  }

  if (!PROJECT) {
    // 2. create project if not exists  - TODO: also bad
    const { data: project, error } = await workspaceclient
      .from("project")
      .insert({
        organization_id: ORG.id,
        name: "forms",
      })
      .select()
      .single();

    if (error) console.error(error);
    assert(project, "failed to create project");

    PROJECT = project;
  }

  const jsonform = new JSONFormParser(src).parse();

  // create new form
  if (!jsonform) {
    return NextResponse.error();
  }

  const service = new JSONFrom2DB(supabase, PROJECT.id, jsonform);

  const { form_document_id } = await service.insert();

  // redirect to form editor page

  return NextResponse.redirect(
    editorlink("form/edit", {
      org: ORG.name,
      proj: PROJECT.name,
      origin: Env.web.HOST,
      document_id: form_document_id,
    }),
    {
      status: 302,
    }
  );
}
