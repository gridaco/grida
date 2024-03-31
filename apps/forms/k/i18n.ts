import type { FormsPageLanguage } from "@/types";

const resources: Record<
  FormsPageLanguage,
  {
    translation: { [key: string]: string | { [key: string]: string } };
  }
> = {
  en: {
    translation: {
      next: "Next",
      back: "Previous",
      submit: "Submit",
      pay: "Pay",
    },
  },
  es: {
    translation: {
      next: "Siguiente",
      back: "Anterior",
      submit: "Enviar",
      pay: "Pagar",
    },
  },
  de: {
    translation: {
      next: "Weiter",
      back: "Zurück",
      submit: "Einreichen",
      pay: "Bezahlen",
    },
  },
  ja: {
    translation: {
      next: "次へ",
      back: "戻る",
      submit: "提出する",
      pay: "支払う",
    },
  },
  fr: {
    translation: {
      next: "Suivant",
      back: "Précédent",
      submit: "Soumettre",
      pay: "Payer",
    },
  },
  pt: {
    translation: {
      next: "Próximo",
      back: "Anterior",
      submit: "Enviar",
      pay: "Pagar",
    },
  },
  it: {
    translation: {
      next: "Avanti",
      back: "Indietro",
      submit: "Invia",
      pay: "Paga",
    },
  },
  ko: {
    translation: {
      next: "다음",
      back: "이전",
      submit: "제출",
      pay: "결제",
    },
  },
  ru: {
    translation: {
      next: "Далее",
      back: "Назад",
      submit: "Отправить",
      pay: "Оплатить",
    },
  },
  zh: {
    translation: {
      next: "下一步",
      back: "上一步",
      submit: "提交",
      pay: "支付",
    },
  },
  ar: {
    translation: {
      next: "التالي",
      back: "السابق",
      submit: "إرسال",
      pay: "دفع",
    },
  },
  hi: {
    translation: {
      next: "अगला",
      back: "पिछला",
      submit: "जमा करें",
      pay: "भुगतान करें",
    },
  },
  nl: {
    translation: {
      next: "Volgende",
      back: "Vorige",
      submit: "Indienen",
      pay: "Betalen",
    },
  },
} as const;

export default resources;
