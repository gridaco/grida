import { NextRequest, NextResponse } from "next/server";
import { OnSubmitProcessors } from "../../hooks";
import assert from "assert";

export async function POST(req: NextRequest) {
  const { session_id } = await req.json();

  assert(session_id, "session_id is required");

  await OnSubmitProcessors.clean_tmp_files(session_id);

  return NextResponse.json({ ok: true });
}
