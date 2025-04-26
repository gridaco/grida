import { NextRequest, NextResponse } from "next/server";
import { random } from "../../actions";
import { headers } from "next/headers";
import { Env } from "@/env";

export async function GET(req: NextRequest) {
  const headersList = await headers();
  const object = await random();
  const accept = headersList.get("accept") || "";

  // browser visit
  if (accept.includes("text/html")) {
    return NextResponse.redirect(`${Env.web.HOST}/library/o/${object.id}`);
  }

  // img visit
  if (accept.includes("image")) {
    return NextResponse.redirect(object.url);
  }

  // api visit
  return NextResponse.json(object);
}
