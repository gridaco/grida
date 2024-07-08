"use server";

import { createRouteHandlerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export async function fetchTemplates() {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient(cookieStore);

  const { data } = await supabase.from("form_template").select();

  return data || [];
}
