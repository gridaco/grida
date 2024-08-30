import { Env } from "@/env";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  context: { params: { id: string } }
) {
  const form_id = context.params.id;
  return NextResponse.json({
    url: `${Env.server.HOST}/d/e/${form_id}`,
    embed: `${Env.server.HOST}/embed/${form_id}`,
    submit: `${Env.server.HOST}/submit/${form_id}`,
  });
}
