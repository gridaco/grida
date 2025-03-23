import { grida_west_client } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const revalidate = 0;

type Params = {
  code: string;
};

type Context = {
  params: Promise<Params>;
};

export async function GET(req: NextRequest, context: Context) {
  const { code } = await context.params;
  const headersList = await headers();
  const series_id = headersList.get("x-grida-west-series");

  if (!series_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: token, error: token_test_err } = await grida_west_client
    .from("token")
    .select()
    .eq("code", code)
    .eq("series_id", series_id)
    .single();

  if (token_test_err) {
    console.error(token_test_err);
    return NextResponse.json({ error: token_test_err }, { status: 404 });
  }

  return NextResponse.json({
    data: token,
    error: null,
  });
}
