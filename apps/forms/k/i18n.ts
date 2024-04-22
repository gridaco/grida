import type { FormsPageLanguage } from "@/types";

type TVal = string | { [key: string]: TVal };

const resources: Record<
  FormsPageLanguage,
  {
    translation: { [key: string]: TVal };
  }
> = {
  en: {
    translation: {
      next: "Next",
      back: "Previous",
      submit: "Submit",
      pay: "Pay",
      formcomplete: {
        receipt01: {
          title: "Receipt Confirmed",
          description:
            "Consider taking a screenshot of this page for your records.",
        },
      },
    },
  },
  es: {
    translation: {
      next: "Siguiente",
      back: "Anterior",
      submit: "Enviar",
      pay: "Pagar",
      formcomplete: {
        receipt01: {
          title: "Recibo Confirmado",
          description:
            "Considere tomar una captura de pantalla de esta página para sus registros.",
        },
      },
    },
  },
  ko: {
    translation: {
      next: "다음",
      back: "이전",
      submit: "제출",
      pay: "결제",
      formcomplete: {
        receipt01: {
          title: "접수 완료",
          description: "스크린샷을 찍어 접수 번호를 저장하세요.",
        },
      },
    },
  },
  ja: {
    translation: {
      next: "次へ",
      back: "戻る",
      submit: "提出する",
      pay: "支払う",
      formcomplete: {
        receipt01: {
          title: "受領確認済み",
          description:
            "このページのスクリーンショットを取って記録しておくことを検討してください。",
        },
      },
    },
  },
  zh: {
    translation: {
      next: "下一步",
      back: "上一步",
      submit: "提交",
      pay: "支付",
      formcomplete: {
        receipt01: {
          title: "收据已确认",
          description: "考虑截图此页面以备记录。",
        },
      },
    },
  },
  fr: {
    translation: {
      next: "Suivant",
      back: "Précédent",
      submit: "Soumettre",
      pay: "Payer",
      formcomplete: {
        receipt01: {
          title: "Reçu Confirmé",
          description:
            "Envisagez de prendre une capture d'écran de cette page pour vos dossiers.",
        },
      },
    },
  },
  pt: {
    translation: {
      next: "Próximo",
      back: "Anterior",
      submit: "Enviar",
      pay: "Pagar",
      formcomplete: {
        receipt01: {
          title: "Recebimento Confirmado",
          description:
            "Considere tirar uma captura de tela desta página para seus registros.",
        },
      },
    },
  },
  it: {
    translation: {
      next: "Avanti",
      back: "Indietro",
      submit: "Invia",
      pay: "Paga",
      formcomplete: {
        receipt01: {
          title: "Ricevuta Confermata",
          description:
            "Considera di fare uno screenshot di questa pagina per i tuoi archivi.",
        },
      },
    },
  },
  de: {
    translation: {
      next: "Weiter",
      back: "Zurück",
      submit: "Einreichen",
      pay: "Bezahlen",
      formcomplete: {
        receipt01: {
          title: "Empfang Bestätigt",
          description:
            "Erwägen Sie, einen Screenshot dieser Seite für Ihre Unterlagen zu machen.",
        },
      },
    },
  },
  ru: {
    translation: {
      next: "Далее",
      back: "Назад",
      submit: "Отправить",
      pay: "Оплатить",
      formcomplete: {
        receipt01: {
          title: "Квитанция Подтверждена",
          description:
            "Рассмотрите возможность сделать скриншот этой страницы для ваших записей.",
        },
      },
    },
  },
  ar: {
    translation: {
      next: "التالي",
      back: "السابق",
      submit: "إرسال",
      pay: "دفع",
      formcomplete: {
        receipt01: {
          title: "تأكيد الاستلام",
          description: "فكر في التقاط لقطة شاشة لهذه الصفحة لسجلاتك.",
        },
      },
    },
  },
  hi: {
    translation: {
      next: "अगला",
      back: "पिछला",
      submit: "जमा करें",
      pay: "भुगतान करें",
      formcomplete: {
        receipt01: {
          title: "रसीद की पुष्टि",
          description:
            "अपने रिकॉर्ड के लिए इस पेज का स्क्रीनशॉट लेने पर विचार करें।",
        },
      },
    },
  },
  nl: {
    translation: {
      next: "Volgende",
      back: "Vorige",
      submit: "Indienen",
      pay: "Betalen",
      formcomplete: {
        receipt01: {
          title: "Ontvangst Bevestigd",
          description:
            "Overweeg een screenshot van deze pagina te maken voor uw administratie.",
        },
      },
    },
  },
} as const;

export default resources;
