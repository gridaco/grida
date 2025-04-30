import {
  GRIDA_FORMS_RESPONSE_BUCKET,
  GRIDA_FORMS_RESPONSE_BUCKET_TMP_FOLDER,
} from "@/k/env";
import { service_role } from "@/lib/supabase/server";
import { SupabaseStorageExtensions } from "@/lib/supabase/storage-ext";
import { NextRequest, NextResponse } from "next/server";

// [PROTECTED] this route is protected for only dev environment via middleware
export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");

  const d = await SupabaseStorageExtensions.tree(
    service_role.forms.storage,
    GRIDA_FORMS_RESPONSE_BUCKET,
    path ?? GRIDA_FORMS_RESPONSE_BUCKET_TMP_FOLDER
  );

  return NextResponse.json(d);
}
