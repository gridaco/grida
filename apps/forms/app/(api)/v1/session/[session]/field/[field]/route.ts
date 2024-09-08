import { grida_forms_client } from "@/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  req: NextRequest,
  context: {
    params: {
      session: string;
      field: string;
    };
  }
) {
  const { session, field } = context.params;
  const { value } = await req.json();

  await grida_forms_client.rpc("set_response_session_field_value", {
    session_id: session,
    key: field,
    value: value,
  });

  // always return 200 OK
  return NextResponse.json({ ok: true });
}
