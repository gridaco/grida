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
 * [track]
 */
export async function POST(req: NextRequest, context: Context) {
  const { code } = await context.params;
  const { name, data } = await req.json();
  const headersList = await headers();
  const series_id = headersList.get("x-grida-west-series");

  if (!series_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { error: track_err } = await grida_west_client.rpc("track", {
    p_series_id: series_id,
    p_code: code,
    p_name: name,
    p_data: data,
  });

  if (track_err) {
    console.error("track", track_err);
    return new NextResponse("error", { status: 400 });
  }

  return new NextResponse("ok", { status: 200 });
}
