import { LanguageCode } from "@/types";
import resources from "@/i18n";

export const supported_form_page_languages: LanguageCode[] = Object.keys(
  resources
) as LanguageCode[];

export const language_label_map: Record<LanguageCode, string> = {
  en: "🇺🇸 English",
  es: "🇪🇸 Spanish / Español",
  de: "🇩🇪 German / Deutsch",
  ja: "🇯🇵 Japanese / 日本語",
  fr: "🇫🇷 French / Français",
  pt: "🇵🇹 Portuguese / Português",
  it: "🇮🇹 Italian / Italiano",
  ko: "🇰🇷 Korean / 한국어",
  ru: "🇷🇺 Russian / Русский",
  zh: "🇨🇳 Chinese / 中文",
  ar: "🇸🇦 Arabic / العربية",
  hi: "🇮🇳 Hindi / हिन्दी",
  nl: "🇳🇱 Dutch / Nederlands",
};
