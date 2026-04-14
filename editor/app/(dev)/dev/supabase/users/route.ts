import { service_role } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest) {
  const {
    data: { users },
  } = await service_role.forms.auth.admin.listUsers();

  return NextResponse.json(users, { status: 200 });
}
