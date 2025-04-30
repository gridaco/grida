import { parseGFKeys } from "@/lib/forms/gfkeys";
import { service_role } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

type Params = { id: string };

// the phylosophy behind response session is, always create, do not validate.
// this is because to keep the session dedicated only for tracking page views and partial submissions
export async function GET(
  req: NextRequest,
  context: {
    params: Promise<Params>;
  }
) {
  const { id: form_id } = await context.params;

  // TODO: also support customer init in session creation
  const { __gf_customer_uuid, __gf_fp_fingerprintjs_visitorid } = parseGFKeys(
    req.nextUrl.searchParams
  );

  const { data: session, error: session_error } = await service_role.forms
    .from("response_session")
    .insert({
      form_id: form_id,
    })
    .select()
    .single();

  if (!session || session_error) {
    console.error("Error creating session", session_error);
    return NextResponse.error();
  }

  return NextResponse.json({ data: session });
}
