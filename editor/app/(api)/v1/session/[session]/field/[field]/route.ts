import { grida_forms_client } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

type Params = { session: string; field: string };

export async function PATCH(
  req: NextRequest,
  context: {
    params: Promise<Params>;
  }
) {
  const { session, field } = await context.params;
  const { value } = await req.json();

  await grida_forms_client.rpc("set_response_session_field_value", {
    session_id: session,
    key: field,
    value: value,
  });

  // always return 200 OK
  return NextResponse.json({ ok: true });
}
