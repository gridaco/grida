import resources from "./resources";
import { client } from "@/lib/supabase/server";
import i18next from "i18next";

type InitWith = { form_id: string } | { lng: string };

export async function ssr_page_init_i18n(init: InitWith) {
  let lng = "en";

  if ("lng" in init) {
    lng = init.lng;
  } else {
    const { form_id } = init;
    const { data, error } = await client
      .from("form")
      .select(
        `
          default_form_page_language
        `
      )
      .eq("id", form_id)
      .single();

    if (data) {
      const { default_form_page_language } = data;
      lng = default_form_page_language;
    }
  }

  return i18next.init({
    lng: lng,
    debug: false, //!IS_PRODUTION,
    resources: resources,
    preload: [lng],
  });
}
