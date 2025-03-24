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
  //
  const headersList = await headers();
  const series_id = headersList.get("x-grida-west-campaign-id");
  const secret = headersList.get("x-grida-west-token-secret");

  if (!series_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: next, error: mint_err } = await grida_west_client.rpc(
    "mint_token",
    {
      p_series_id: series_id,
      p_code: code,
      p_secret: secret ?? undefined,
    }
  );

  if (mint_err) {
    console.error("error while minting", mint_err);
    return NextResponse.json({ error: mint_err }, { status: 500 });
  }

  return NextResponse.json({
    data: next,
    error: null,
  });
}
