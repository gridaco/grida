"use server";

import { createFormsClient } from "@/lib/supabase/server";

export async function fetchTemplates() {
  const formsClient = await createFormsClient();

  const { data } = await formsClient.from("form_template").select();

  if (data) {
    return data.map((template) => {
      return {
        ...template,
        preview_url: formsClient.storage
          .from("grida-forms-template")
          .getPublicUrl(template.preview_path).data.publicUrl,
      };
    });
  }

  return [];
}
