import { service_role } from "../../db";
import { SYSTEM_GF_CUSTOMER_EMAIL_KEY } from "@grida/forms";
import {
  challengeEmailStateKey,
  loadChallengeEmailContext,
  readChallengeStateFromRaw,
} from "./context";

type Params = { session: string; field: string };

export async function POST(req: Request, params: Params) {
  const { session: sessionId, field: fieldId } = params;

  const { data: ctx, error } = await loadChallengeEmailContext({
    sessionId,
    fieldId,
  });

  if (error || !ctx) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  if (ctx.field.type !== "challenge_email") {
    return Response.json({ error: "invalid field type" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as {
    challenge_id?: string;
    otp?: string;
  } | null;
  const challenge_id = body?.challenge_id;
  const otp = body?.otp;

  if (
    typeof challenge_id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      challenge_id
    ) ||
    typeof otp !== "string" ||
    !/^\d{6}$/.test(otp)
  ) {
    return Response.json(
      { error: "challenge_id and otp are required" },
      { status: 400 }
    );
  }

  const key = challengeEmailStateKey(fieldId);
  const prior = readChallengeStateFromRaw(ctx.session.raw, key);

  // If we previously started, only allow verification for the latest issued challenge id.
  if (prior.challenge_id && prior.challenge_id !== challenge_id) {
    return Response.json({ error: "invalid or expired OTP" }, { status: 401 });
  }

  const { data: verified, error: verifyErr } = await service_role.ciam.rpc(
    "verify_customer_otp_and_create_session",
    {
      p_challenge_id: challenge_id,
      p_otp: otp,
      // legacy parameter, retained by the DB function signature
      p_session_ttl_seconds: 0,
    }
  );

  if (verifyErr || !verified || verified.length === 0) {
    const failState = {
      ...prior,
      state: "challenge-failed" as const,
    };
    await service_role.forms.rpc("set_response_session_field_value", {
      session_id: sessionId,
      key,
      value: failState,
    });

    return Response.json({ error: "invalid or expired OTP" }, { status: 401 });
  }

  const { customer_uid, project_id } = verified[0];
  if (!customer_uid || !project_id) {
    return Response.json({ error: "invalid or expired OTP" }, { status: 401 });
  }

  const expectedProjectId = ctx.form.project_id;
  if (Number(project_id) !== expectedProjectId) {
    return Response.json({ error: "internal error" }, { status: 500 });
  }

  // Only the system identity key is allowed to bind a response_session to a customer.
  if (ctx.field.name === SYSTEM_GF_CUSTOMER_EMAIL_KEY) {
    const { error: bindErr } = await service_role.forms
      .from("response_session")
      .update({ customer_id: customer_uid })
      .eq("id", sessionId);
    if (bindErr) {
      // Do not fail verification; session raw still reflects success.
    }
  }

  const successState = {
    ...prior,
    state: "challenge-success" as const,
    verified_at: new Date().toISOString(),
    customer_uid,
  };

  await service_role.forms.rpc("set_response_session_field_value", {
    session_id: sessionId,
    key,
    value: successState,
  });

  return Response.json({ state: successState });
}
