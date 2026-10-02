import {
  challengeEmailStateKey,
  loadChallengeEmailContext,
  readChallengeStateFromRaw,
} from "./context";

type Params = { session: string; field: string };

export async function GET(_req: Request, params: Params) {
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

  const key = challengeEmailStateKey(fieldId);
  const state = readChallengeStateFromRaw(ctx.session.raw, key);

  return Response.json({ state });
}
