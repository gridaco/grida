import { createRouteHandlerWestClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

type Params = {
  project_id: string;
  series: string;
};

type Context = {
  params: Promise<Params>;
};

export async function GET(req: NextRequest, context: Context) {
  const { series: series_id } = await context.params;
  const from = req.nextUrl.searchParams.get("from") || undefined;
  const to = req.nextUrl.searchParams.get("to") || undefined;
  const interval = req.nextUrl.searchParams.get("interval") || undefined;

  const cookieStore = cookies();
  const client = createRouteHandlerWestClient(cookieStore);

  const { data, error: analyze_err } = await client.rpc("analyze", {
    p_series_id: series_id,
    p_time_from: from,
    p_time_to: to,
    p_interval: interval,
  });

  if (analyze_err) {
    console.error("analyze", analyze_err);
    return new NextResponse("error", { status: 400 });
  }

  return NextResponse.json({
    data: {
      interval,
      events: data,
    },
    error: null,
  });
}
