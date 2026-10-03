import { service_role } from "../db";

import type { Json } from "@app/database";

type Params = { session: string; field: string };

export async function PATCH(req: Request, params: Params) {
  const { session, field } = params;
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || !("value" in body)) {
    return Response.json({ error: "invalid value" }, { status: 400 });
  }
  // The anonymous session ID is a capability for this form's fields only.
  // Internal challenge state shares raw storage but must never be client-writable.
  const { data: responseSession, error: sessionError } =
    await service_role.forms
      .from("response_session")
      .select("id, form_id")
      .eq("id", session)
      .single();
  if (sessionError || !responseSession) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  const { data: attribute, error: fieldError } = await service_role.forms
    .from("attribute")
    .select("id")
    .eq("id", field)
    .eq("form_id", responseSession.form_id)
    .single();
  if (fieldError || !attribute) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const { error } = await service_role.forms.rpc(
    "set_response_session_field_value",
    {
      session_id: session,
      key: field,
      value: body.value as Json,
    }
  );
  if (error) {
    return Response.json({ error: "unable to save field" }, { status: 500 });
  }
  return Response.json({ ok: true });
}
