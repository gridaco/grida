import { editorlink } from "@/lib/forms/url";
import {
  commerceclient,
  createRouteHandlerClient,
} from "@/lib/supabase/server";
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

  const { data: form } = await supabase
    .from("form")
    .select("title, project_id, store_connection:connection_commerce_store(*)")
    .eq("id", form_id)
    .single();

  if (!form) {
    return notFound();
  }

  if (form.store_connection) {
    return NextResponse.redirect(
      editorlink(origin, form_id, "connect/store/products"),
      {
        status: 301,
      }
    );
  }

  const { data: store, error: store_insertion_error } = await commerceclient
    .from("store")
    .insert({
      name: generated_form_store_name(form.title),
      project_id: form.project_id,
    })
    .select("id")
    .single();

  if (store_insertion_error)
    console.error("store::error:", store_insertion_error);

  if (!store) {
    console.error("store::not-inserted");
    return NextResponse.redirect(editorlink(origin, form_id, "connect/store"), {
      status: 301,
    });
  }

  // create new connection record
  const { data: connection, error } = await supabase
    .from("connection_commerce_store")
    .insert({
      form_id: form_id,
      project_id: form.project_id,
      store_id: store.id,
    });

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

function generated_form_store_name(name: string) {
  return `[generated] ${name}`;
}
