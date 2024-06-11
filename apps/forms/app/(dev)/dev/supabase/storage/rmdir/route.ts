import { GRIDA_FORMS_RESPONSE_BUCKET } from "@/k/env";
import { client } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { SupabaseStorageExt } from "@/lib/supabase/storage-ext";
import assert from "assert";

// [PROTECTED] this route is protected for only dev environment via middleware
export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");

  assert(path, "path is required");

  const d = await SupabaseStorageExt.rmdir(
    client.storage,
    GRIDA_FORMS_RESPONSE_BUCKET,
    path
  );

  console.log("GET /dev/supabase/storage/rmdir", d);
  return NextResponse.json(d);
}
