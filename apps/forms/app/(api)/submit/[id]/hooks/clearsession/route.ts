import { NextRequest, NextResponse } from "next/server";
import assert from "assert";
import { grida_forms_client } from "@/supabase/server";
import { notFound } from "next/navigation";
import { RawdataProcessing } from "@/lib/forms/rawdata";

export async function POST(
  req: NextRequest,
  context: {
    params: { id: string };
  }
) {
  const form_id = context.params.id;
  const { response_id, session_id } = await req.json();

  assert(response_id, "response_id is required");
  assert(session_id, "session_id is required");

  const { data: form_ref, error: form_ref_err } = await grida_forms_client
    .from("form")
    .select("id, fields:form_field(*)")
    .eq("id", form_id)
    .single();

  if (form_ref_err) console.error("clearsession/err", form_ref_err);
  if (!form_ref) {
    return notFound();
  }

  // sync sessions'raw data from response's final raw data
  const { data: response_ref, error: response_ref_err } =
    await grida_forms_client
      .from("response")
      .select("raw, session_id")
      .eq("id", response_id)
      .eq("session_id", session_id)
      .single();

  if (response_ref_err) console.error("clearsession/err", response_ref_err);
  if (!response_ref) {
    return notFound();
  }

  // convert response raw data to session raw data
  // name:value -> id:value

  await grida_forms_client
    .from("response_session")
    .update({
      raw: response_ref.raw
        ? RawdataProcessing.namekeytoidkey(
            response_ref.raw as {},
            form_ref.fields
          )
        : {},
    })
    .eq("id", session_id);

  // clear tmp files
  // TODO: disabling this since we now support x-supabase, this can be a possible attack point. for clearing tmp files, we can use a cron job.
  // await SupabaseStorageExt.rmdir(
  //   client.storage,
  //   GRIDA_FORMS_RESPONSE_BUCKET,
  //   GRIDA_FORMS_RESPONSE_BUCKET_TMP_FOLDER + "/" + session_id
  // );

  return NextResponse.json({ ok: true });
}
