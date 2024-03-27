import { NextRequest, NextResponse } from "next/server";

const HOST = process.env.HOST;

export async function GET(
  req: NextRequest,
  context: { params: { id: string } }
) {
  const form_id = context.params.id;
  return NextResponse.json({
    url: `${HOST}/d/e/${form_id}`,
    embed: `${HOST}/embed/${form_id}`,
    submit: `${HOST}/submit/${form_id}`,
  });
}
