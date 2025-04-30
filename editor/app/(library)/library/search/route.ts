import { NextRequest, NextResponse } from "next/server";
import { search } from "../../actions";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("query");
  const objects = await search({ text: query || undefined });

  // api visit
  return NextResponse.json({
    query,
    ...objects,
  });
}
