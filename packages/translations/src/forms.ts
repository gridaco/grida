import { createInstance } from "i18next";
import resources from "./resources";

export { default, resources, supported_languages } from "./resources";
export type { Translation, FormsLocale } from "./resources";
export { getLocale, select_lang } from "./locale";

/** Creates an isolated translator; another request cannot change its language. */
export async function createFormsTranslator(language = "en") {
  const instance = createInstance();
  await instance.init({
    lng: language,
    fallbackLng: "en",
    debug: false,
    resources,
    preload: [language],
  });
  return instance.getFixedT(language);
}
