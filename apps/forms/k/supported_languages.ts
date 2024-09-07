import { LanguageCode } from "@/types";
import resources from "@/i18n";

export const supported_form_page_languages: LanguageCode[] = Object.keys(
  resources
) as LanguageCode[];

export const language_label_map: Record<
  LanguageCode,
  { flag: string; label: string }
> = {
  en: { flag: "🇺🇸", label: "English" },
  es: { flag: "🇪🇸", label: "Spanish / Español" },
  de: { flag: "🇩🇪", label: "German / Deutsch" },
  ja: { flag: "🇯🇵", label: "Japanese / 日本語" },
  fr: { flag: "🇫🇷", label: "French / Français" },
  pt: { flag: "🇵🇹", label: "Portuguese / Português" },
  it: { flag: "🇮🇹", label: "Italian / Italiano" },
  ko: { flag: "🇰🇷", label: "Korean / 한국어" },
  ru: { flag: "🇷🇺", label: "Russian / Русский" },
  zh: { flag: "🇨🇳", label: "Chinese / 中文" },
  ar: { flag: "🇸🇦", label: "Arabic / العربية" },
  hi: { flag: "🇮🇳", label: "Hindi / हिन्दी" },
  nl: { flag: "🇳🇱", label: "Dutch / Nederlands" },
};
