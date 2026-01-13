import { NextRequest, NextResponse } from "next/server";
import {
  challengeEmailStateKey,
  loadChallengeEmailContext,
  readChallengeStateFromRaw,
} from "../_utils";

type Params = { session: string; field: string };

export async function GET(
  _req: NextRequest,
  context: { params: Promise<Params> }
) {
  const { session: sessionId, field: fieldId } = await context.params;

  const { data: ctx, error } = await loadChallengeEmailContext({
    sessionId,
    fieldId,
  });

  if (error || !ctx) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (ctx.field.type !== "challenge_email") {
    return NextResponse.json({ error: "invalid field type" }, { status: 400 });
  }

  const key = challengeEmailStateKey(fieldId);
  const state = readChallengeStateFromRaw(ctx.session.raw, key);

  return NextResponse.json({ state });
}
