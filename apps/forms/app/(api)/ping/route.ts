import { NextRequest, NextResponse } from "next/server";

export function GET(req: NextRequest) {
  const geo = {
    country: req.geo?.country,
    latitude: req.geo?.latitude,
  };

  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const searchparams: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((value, key) => {
    searchparams[key] = value;
  });

  return NextResponse.json({
    geo,
    headers,
    searchparams,
  });
}
