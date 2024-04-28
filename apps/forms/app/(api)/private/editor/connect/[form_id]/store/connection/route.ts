import { editorlink } from "@/lib/forms/url";
import {
  grida_commerce_client,
  createRouteHandlerClient,
} from "@/lib/supabase/server";
import { GridaCommerceClient } from "@/services/commerce";
import { GridaFormsClient } from "@/services/form";
import { generated_form_store_name } from "@/services/utils/generated-form-store-name";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

export const revalidate = 0;

export async function POST(
  req: NextRequest,
  context: {
    params: { form_id: string };
  }
) {
  const origin = req.nextUrl.origin;
  const cookieStore = cookies();
  const { form_id } = context.params;
  const supabase = createRouteHandlerClient(cookieStore);

  const { data: form_reference } = await supabase
    .from("form")
    .select("title, project_id, store_connection:connection_commerce_store(*)")
    .eq("id", form_id)
    .single();

  if (!form_reference) {
    return notFound();
  }

  const commerce = new GridaCommerceClient(
    grida_commerce_client, // TODO: use non admin client
    form_reference.project_id
  );

  const forms = new GridaFormsClient(
    supabase,
    form_reference.project_id,
    form_id
  );

  if (form_reference.store_connection) {
    return NextResponse.redirect(
      editorlink(origin, form_id, "connect/store/products"),
      {
        status: 301,
      }
    );
  }

  const { data: store, error: store_insertion_error } =
    await commerce.createStore({
      name: generated_form_store_name(form_reference.title),
    });

  if (store_insertion_error)
    console.error("store::error:", store_insertion_error);

  if (!store) {
    console.error("store::not-inserted");
    return NextResponse.redirect(editorlink(origin, form_id, "connect/store"), {
      status: 301,
    });
  }

  // create new connection record
  const { data: connection, error } = await forms.createStoreConnection(
    store.id
  );

  if (error) {
    console.error("connection::error:", error);
    return NextResponse.redirect(editorlink(origin, form_id, "connect/store"), {
      status: 301,
    });
  }

  return NextResponse.redirect(
    editorlink(origin, form_id, "connect/store/products"),
    {
      status: 301,
    }
  );
}
