import { grida_forms_client } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const {
    data: { users },
    error,
  } = await grida_forms_client.auth.admin.listUsers();

  return NextResponse.json(users, { status: 200 });
}
