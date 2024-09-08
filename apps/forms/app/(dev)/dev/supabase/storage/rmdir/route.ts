import { GRIDA_FORMS_RESPONSE_BUCKET } from "@/k/env";
import { grida_forms_client } from "@/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { SupabaseStorageExtensions } from "@/supabase/storage-ext";
import assert from "assert";

// [PROTECTED] this route is protected for only dev environment via middleware
export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");

  assert(path, "path is required");

  const d = await SupabaseStorageExtensions.rmdir(
    grida_forms_client.storage,
    GRIDA_FORMS_RESPONSE_BUCKET,
    path
  );

  console.log("GET /dev/supabase/storage/rmdir", d);
  return NextResponse.json(d);
}
