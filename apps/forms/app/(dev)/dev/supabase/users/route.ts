import { client } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const {
    data: { users },
    error,
  } = await client.auth.admin.listUsers();

  return NextResponse.json(users, { status: 200 });
}
