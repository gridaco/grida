import resources from "./resources";
import { _sr_grida_forms_client } from "@/lib/supabase/server";
import i18next from "i18next";

type InitWith = { form_id: string } | { lng: string };

export async function ssr_page_init_i18n(init: InitWith) {
  let lng = "en";

  if ("lng" in init) {
    lng = init.lng;
  } else {
    const { form_id } = init;
    const { data, error } = await _sr_grida_forms_client
      .from("form_document")
      .select(
        `
          lang
        `
      )
      // TODO: change to document id after migration
      .eq("form_id", form_id)
      .single();

    if (data) {
      const { lang } = data;
      lng = lang;
    }
  }

  return i18next.init({
    lng: lng,
    debug: false, //!IS_PRODUTION,
    resources: resources,
    preload: [lng],
  });
}
