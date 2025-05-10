import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    service: "Grida Open API",
    version: "v1",
    message: "Service is running",
  });
}
