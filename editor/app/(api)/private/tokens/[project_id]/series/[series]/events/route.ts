import {
  createRouteHandlerWestClient,
  grida_west_client,
} from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
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

  const cookieStore = cookies();
  const client = createRouteHandlerWestClient(cookieStore);

  // check access
  const { error } = await client
    .from("campaign")
    .select("id")
    .eq("id", series_id);

  if (error) {
    return notFound();
  }

  // SERVICE ROLE ACCESS
  const { data, error: fetch_err } = await grida_west_client
    .from("token_event")
    .select("*")
    .eq("series_id", series_id)
    .order("time", { ascending: false })
    .limit(1000);

  if (fetch_err) {
    console.error("events", fetch_err);
    return new NextResponse("error", { status: 400 });
  }

  return NextResponse.json({
    data: data,
    error: null,
  });
}
