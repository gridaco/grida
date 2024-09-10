"use server";

import { createRouteHandlerFormsClient } from "@/supabase/server";
import { cookies } from "next/headers";

export async function fetchTemplates() {
  const cookieStore = cookies();
  const supabase = createRouteHandlerFormsClient(cookieStore);

  const { data } = await supabase.from("form_template").select();

  if (data) {
    return data.map((template) => {
      return {
        ...template,
        preview_url: supabase.storage
          .from("grida-forms-template")
          .getPublicUrl(template.preview_path).data.publicUrl,
      };
    });
  }

  return [];
}
