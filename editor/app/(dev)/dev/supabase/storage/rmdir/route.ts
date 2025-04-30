import { GRIDA_FORMS_RESPONSE_BUCKET } from "@/k/env";
import { service_role } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { SupabaseStorageExtensions } from "@/lib/supabase/storage-ext";
import assert from "assert";

// [PROTECTED] this route is protected for only dev environment via middleware
export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");

  assert(path, "path is required");

  const d = await SupabaseStorageExtensions.rmdir(
    service_role.forms.storage,
    GRIDA_FORMS_RESPONSE_BUCKET,
    path
  );

  console.log("GET /dev/supabase/storage/rmdir", d);
  return NextResponse.json(d);
}
