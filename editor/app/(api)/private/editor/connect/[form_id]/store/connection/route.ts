import { resolve_next } from "@/host/url";
import {
  createClient,
  createFormsClient,
  service_role,
} from "@/lib/supabase/server";
import { GridaCommerceClient } from "@/services/commerce";
import { GridaFormsClient } from "@/services/form";
import { generated_form_store_name } from "@/services/utils/generated-form-store-name";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

type Params = { form_id: string };

export async function POST(
  req: NextRequest,
  context: {
    params: Promise<Params>;
  }
) {
  const formdata = await req.formData();

  const origin = req.nextUrl.origin;
  const { form_id } = await context.params;
  const next = req.nextUrl.searchParams.get("next");
  const client = await createClient();
  const formsClient = await createFormsClient();

  const { data: form_reference, error: form_ref_err } = await formsClient
    .from("form")
    .select(
      `
        title,
        project_id,
        store_connection:connection_commerce_store(*)
      `
    )
    .eq("id", form_id)
    .single();

  if (form_ref_err) {
    console.error(form_ref_err);
    return notFound();
  }

  if (!form_reference) {
    return notFound();
  }

  const { data: project_ref, error: project_ref_err } = await client
    .from("project")
    .select(`id, name, organization(name)`)
    .eq("id", form_reference.project_id)
    .single();

  if (project_ref_err) {
    console.error(project_ref_err);
    return notFound();
  }

  if (!project_ref) {
    return notFound();
  }

  const commerce = new GridaCommerceClient(
    service_role.commerce, // TODO: use non admin client
    form_reference.project_id
  );

  const forms = new GridaFormsClient(
    formsClient,
    form_reference.project_id,
    form_id
  );

  if (form_reference.store_connection) {
    return NextResponse.redirect(resolve_next(origin, next), {
      status: 301,
    });
  }

  const name =
    (formdata.get("name") as string) ||
    generated_form_store_name(form_reference.title);

  const { data: store, error: store_insertion_error } =
    await commerce.createStore({
      name: name,
    });

  if (store_insertion_error)
    console.error("store::error:", store_insertion_error);

  if (!store) {
    console.error("store::not-inserted");
    return NextResponse.error();
  }

  // create new connection record
  const { data: connection, error } = await forms.createStoreConnection(
    store.id
  );

  if (error) {
    console.error("connection::error:", error);
    return NextResponse.error();
  }

  return NextResponse.redirect(resolve_next(origin, next), {
    status: 301,
  });
}
