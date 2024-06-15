import { createRouteHandlerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

export async function GET(
  req: NextRequest,
  context: {
    params: {
      form_id: string;
    };
  }
) {
  const { form_id } = context.params;
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient(cookieStore);

  // supabase.from()
  //
  return;
}
