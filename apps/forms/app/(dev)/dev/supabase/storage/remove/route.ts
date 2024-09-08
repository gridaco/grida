import {
  GRIDA_FORMS_RESPONSE_BUCKET,
  GRIDA_FORMS_RESPONSE_BUCKET_TMP_FOLDER,
} from "@/k/env";
import { grida_forms_client } from "@/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// [PROTECTED] this route is protected for only dev environment via middleware
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  const d = await grida_forms_client.storage
    .from(GRIDA_FORMS_RESPONSE_BUCKET)
    .remove([`${GRIDA_FORMS_RESPONSE_BUCKET_TMP_FOLDER}/${name}`]);
  console.log("GET /dev/supabase/storage/remove", d);
  return NextResponse.json(d);
}
