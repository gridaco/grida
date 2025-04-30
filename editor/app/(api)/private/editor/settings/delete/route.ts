import { createFormsClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

export const revalidate = 0;

export async function POST(req: NextRequest) {
  const origin = req.nextUrl.origin;

  const formdata = await req.formData();

  const form_id = String(formdata.get("form_id"));
  const comfirmation_text = String(formdata.get("comfirmation_text"));

  const formsClient = await createFormsClient();

  // load the form
  const { data: form } = await formsClient
    .from("form")
    .select("*")
    .eq("id", form_id)
    .single();

  if (!form) {
    return notFound();
  }

  const { title } = form;

  // validate the comfirmation_text
  if (comfirmation_text !== delete_confirmation_text(title)) {
    return new NextResponse("Invalid confirmation text", {
      status: 400,
    });
  }

  // delete
  await formsClient.from("form").delete().eq("id", form_id).single();

  // once deleted, redirect to dashboard
  return NextResponse.redirect(origin + "?redirect_reason=deleted", {
    status: 301,
  });
}

function delete_confirmation_text(title: string) {
  return "DELETE " + title;
}
