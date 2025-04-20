import { geolocation } from "@vercel/functions";
import { NextRequest, NextResponse } from "next/server";

export function GET(req: NextRequest) {
  const geo = geolocation(req);
  return NextResponse.json({
    data: null,
    error: null,
    message: "service is running",
    status: 200,
    __ping: {
      geo: geo,
    },
  });
}
