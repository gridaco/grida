import type { NextRequest } from "next/server";
import { refreshDomain } from "../_refresh";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ org: string; proj: string; hostname: string }> }
) {
  return refreshDomain(req, ctx);
}
