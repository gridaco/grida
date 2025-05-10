import { service_role } from "@/lib/supabase/server";
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

  await service_role.forms.rpc("set_response_session_field_value", {
    session_id: session,
    key: field,
    value: value,
  });

  // always return 200 OK
  return NextResponse.json({ ok: true });
}
