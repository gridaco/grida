import { Env } from "@/env";
import { NextRequest, NextResponse } from "next/server";

type Params = { id: string };

export async function GET(
  req: NextRequest,
  context: {
    params: Promise<Params>;
  }
) {
  const { id: form_id } = await context.params;
  return NextResponse.json({
    url: `${Env.web.HOST}/d/e/${form_id}`,
    embed: `${Env.web.HOST}/embed/${form_id}`,
    submit: `${Env.web.HOST}/submit/${form_id}`,
  });
}
