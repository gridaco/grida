import { NextRequest } from "next/server";
import { headers } from "next/headers";
import assert from "assert";

export async function GET(req: NextRequest) {
  const headersList = await headers();
  const campaign_id = headersList.get("x-grida-west-campaign-id");
  const code = headersList.get("x-grida-west-token-code");
  assert(code, "x-grida-west-token-code is required");
  assert(campaign_id, "x-grida-west-campaign-id is required");
}
