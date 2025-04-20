import { redirect } from "next/navigation";
import { NextRequest } from "next/server";

export function GET(req: NextRequest) {
  return redirect(req.nextUrl.origin + "/p/login");
}
