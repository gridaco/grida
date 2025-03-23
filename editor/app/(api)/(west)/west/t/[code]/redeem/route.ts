import { grida_west_client } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

type Params = {
  code: string;
};

type Context = {
  params: Promise<Params>;
};

/**
 * [mint]
 */
export async function POST(req: NextRequest, context: Context) {
  const { code } = await context.params;
  const headersList = await headers();
  const series_id = headersList.get("x-grida-west-series");
  const secret = headersList.get("x-grida-west-token-secret");
  //

  const { data: token, error: token_test_err } = await grida_west_client
    .from("token")
    .select()
    .eq("code", code)
    .single();

  if (token_test_err) {
    console.error(token_test_err);
    return NextResponse.json({ error: token_test_err }, { status: 404 });
  }

  const { data: next, error: mint_err } = await grida_west_client.rpc(
    "redeem_token",
    {
      p_token_id: token.id,
    }
  );

  if (mint_err) {
    console.error(mint_err);
    return NextResponse.json({ error: mint_err }, { status: 500 });
  }

  return NextResponse.json({
    data: next,
    error: null,
  });
}
