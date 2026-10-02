import en from "../../../data/translations/en/forms.json";
import es from "../../../data/translations/es/forms.json";
import ko from "../../../data/translations/ko/forms.json";
import ja from "../../../data/translations/ja/forms.json";
import zh from "../../../data/translations/zh/forms.json";
import fr from "../../../data/translations/fr/forms.json";
import pt from "../../../data/translations/pt/forms.json";
import it from "../../../data/translations/it/forms.json";
import de from "../../../data/translations/de/forms.json";
import ru from "../../../data/translations/ru/forms.json";
import ar from "../../../data/translations/ar/forms.json";
import hi from "../../../data/translations/hi/forms.json";
import nl from "../../../data/translations/nl/forms.json";

export interface Translation {
  next: string;
  back: string;
  submit: string;
  pay: string;
  home: string;
  verify: string;
  resend: string;
  retry: string;
  sending: string;
  email_challenge: {
    verify_code: string;
    enter_verification_code: string;
    code_sent: string;
    didnt_receive_code: string;
    code_expired: string;
    incorrect_code: string;
    error_occurred: string;
  };
  left_in_stock: string;
  sold_out: string;
  support_metadata: string;
  support_metadata_no_share: string;
  formclosed: {
    default: {
      title: string;
      description: string;
    };
    while_responding: {
      title: string;
      description: string;
    };
  };
  formsoldout: {
    default: {
      title: string;
      description: string;
    };
  };
  formoptionsoldout: {
    default: {
      title: string;
      description: string;
    };
  };
  formcomplete: {
    default: {
      h1: string;
      p: string;
      button?: string;
      href?: string;
    };
    receipt01: {
      h1: string;
      h2: string;
      p: string;
      button?: string;
      href?: string;
    };
  };
  alreadyresponded: {
    default: {
      title: string;
      description: string;
    };
  };
  badrequest: {
    default: {
      title: string;
      description: string;
    };
  };
}

const catalogs = {
  en: { translation: en },
  es: { translation: es },
  ko: { translation: ko },
  ja: { translation: ja },
  zh: { translation: zh },
  fr: { translation: fr },
  pt: { translation: pt },
  it: { translation: it },
  de: { translation: de },
  ru: { translation: ru },
  ar: { translation: ar },
  hi: { translation: hi },
  nl: { translation: nl },
} satisfies Record<string, { translation: Translation }>;

export type FormsLocale = keyof typeof catalogs;
export const resources: Record<FormsLocale, { translation: Translation }> =
  catalogs;
export const supported_languages = Object.keys(catalogs) as FormsLocale[];
export default resources;
