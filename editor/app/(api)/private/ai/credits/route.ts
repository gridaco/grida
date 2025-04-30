import { createClient } from "@/lib/supabase/server";
import { ai_credit_remaining } from "../ratelimit";
import { NextResponse } from "next/server";

export async function GET() {
  const client = await createClient();
  const u = await client.auth.getUser();
  if (u.error) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const data = await ai_credit_remaining({ user_id: u.data.user.id });
  return NextResponse.json(
    {
      data,
    },
    {
      status: 200,
    }
  );
}
