import { service_role } from "../../db";
import { loadChallengeEmailContext } from "./context";

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

  // The database rechecks session/field/project and latest challenge authority.
  // Consumption, identity binding and success state are one transaction.
  const { data: verified, error: verifyError } = await service_role.forms.rpc(
    "verify_email_otp",
    {
      p_session_id: sessionId,
      p_field_id: fieldId,
      p_challenge_id: challenge_id,
      p_otp: otp,
    }
  );

  if (verifyError) {
    return Response.json({ error: "internal error" }, { status: 500 });
  }
  if (!verified?.length) {
    // A denial commits the failed-guess count and failure state in the RPC.
    return Response.json({ error: "invalid or expired OTP" }, { status: 401 });
  }

  return Response.json({ state: verified[0].state });
}
