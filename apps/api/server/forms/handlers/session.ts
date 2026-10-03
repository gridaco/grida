import { parseGFKeys } from "../grida-forms/lib/gfkeys";
import { service_role } from "../db";

type Params = { id: string };

// the phylosophy behind response session is, always create, do not validate.
// this is because to keep the session dedicated only for tracking page views and partial submissions
export async function GET(req: Request, params: Params) {
  const { id: form_id } = params;

  // TODO: also support customer init in session creation
  const { __gf_customer_uuid, __gf_fp_fingerprintjs_visitorid } = parseGFKeys(
    new URL(req.url).searchParams
  );

  const { data: session, error: session_error } = await service_role.forms
    .from("response_session")
    .insert({
      form_id: form_id,
    })
    .select()
    .single();

  if (!session || session_error) {
    return Response.json({ error: "internal error" }, { status: 500 });
  }

  return Response.json({
    data: { id: session.id, form_id: session.form_id },
    error: null,
  });
}
