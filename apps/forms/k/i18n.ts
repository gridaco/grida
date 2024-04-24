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
      home: "Home",
      formclosed: {
        default: {
          title: "Form Closed",
          description: "This form is no longer accepting responses.",
        },
        while_responding: {
          title: "Form Closed",
          description:
            "Thank you for your interest. Unfortunately, the form is closed while responding. If you believe this is a mistake, please contact support.",
        },
      },
      formcomplete: {
        receipt01: {
          title: "Receipt Confirmed",
          description:
            "Consider taking a screenshot of this page for your records.",
        },
      },
      alreadyresponded: {
        default: {
          title: "Already Responded",
          description:
            "You have already submitted this form. If you believe this is a mistake, please contact support.",
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
      formclosed: {
        default: {
          title: "Formulario Cerrado",
          description: "Este formulario ya no acepta respuestas.",
        },
        while_responding: {
          title: "Formulario Cerrado",
          description:
            "Gracias por su interés. Desafortunadamente, el formulario se cerró durante la respuesta. Si cree que esto es un error, por favor contacte al soporte.",
        },
      },
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
      home: "홈",
      formclosed: {
        default: {
          title: "폼이 마감되었습니다",
          description:
            "관심을 가져주셔서 감사합니다. 폼이 마감되어, 더 이상 응답을 받지 않습니다. 이것이 실수라고 생각하신다면 지원팀에 문의해 주세요.",
        },
        while_responding: {
          title: "폼이 마감되었습니다",
          description:
            "관심을 가져주셔서 감사합니다. 안타깝게도 응답 중에 폼이 닫혔습니다. 이것이 실수라고 생각하신다면 지원팀에 문의해 주세요.",
        },
      },
      formcomplete: {
        receipt01: {
          title: "접수 완료",
          description: "스크린샷을 찍어 접수 번호를 저장하세요.",
        },
      },
      alreadyresponded: {
        default: {
          title: "이미 응답했습니다",
          description:
            "이미 이 폼을 제출했습니다. 이것이 실수라고 생각하신다면 지원팀에 문의해 주세요.",
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
      formclosed: {
        default: {
          title: "フォームは閉鎖されました",
          description: "このフォームはもう回答を受け付けていません。",
        },
        while_responding: {
          title: "フォームは閉鎖されました",
          description:
            "ご関心をお寄せいただきありがとうございます。残念ながら、回答中にフォームが閉鎖されました。これが誤りであると思われる場合は、サポートに連絡してください。",
        },
      },
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
      formclosed: {
        default: {
          title: "表格已关闭",
          description: "此表格不再接受回应。",
        },
        while_responding: {
          title: "表格已关闭",
          description:
            "感谢您的兴趣。不幸的是，表格在回应过程中被关闭。如果您认为这是一个错误，请联系支持。",
        },
      },
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
      formclosed: {
        default: {
          title: "Formulaire Fermé",
          description: "Ce formulaire n'accepte plus de réponses.",
        },
        while_responding: {
          title: "Formulaire Fermé",
          description:
            "Merci de votre intérêt. Malheureusement, le formulaire a été fermé pendant que vous répondiez. Si vous pensez que c'est une erreur, veuillez contacter le support.",
        },
      },
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
      formclosed: {
        default: {
          title: "Formulário Fechado",
          description: "Este formulário não está mais aceitando respostas.",
        },
        while_responding: {
          title: "Formulário Fechado",
          description:
            "Obrigado pelo seu interesse. Infelizmente, o formulário foi fechado enquanto você respondia. Se você acredita que isso é um erro, por favor entre em contato com o suporte.",
        },
      },
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
      formclosed: {
        default: {
          title: "Modulo Chiuso",
          description: "Questo modulo non accetta più risposte.",
        },
        while_responding: {
          title: "Modulo Chiuso",
          description:
            "Grazie per il tuo interesse. Sfortunatamente, il modulo è stato chiuso durante la compilazione. Se credi che sia un errore, contatta l'assistenza.",
        },
      },
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
      formclosed: {
        default: {
          title: "Formular Geschlossen",
          description: "Dieses Formular akzeptiert keine Antworten mehr.",
        },
        while_responding: {
          title: "Formular Geschlossen",
          description:
            "Vielen Dank für Ihr Interesse. Leider wurde das Formular während der Beantwortung geschlossen. Wenn Sie glauben, dass dies ein Fehler ist, kontaktieren Sie bitte den Support.",
        },
      },
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
      formclosed: {
        default: {
          title: "Форма закрыта",
          description: "Эта форма больше не принимает ответы.",
        },
        while_responding: {
          title: "Форма закрыта",
          description:
            "Спасибо за ваш интерес. К сожалению, форма была закрыта во время ответа. Если вы считаете, что это ошибка, пожалуйста, свяжитесь со службой поддержки.",
        },
      },
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
      formclosed: {
        default: {
          title: "النموذج مغلق",
          description: "هذا النموذج لم يعد يقبل الردود.",
        },
        while_responding: {
          title: "النموذج مغلق",
          description:
            "شكراً لاهتمامك. للأسف تم إغلاق النموذج أثناء الرد. إذا كنت تعتقد أن هذا خطأ، الرجاء التواصل مع الدعم.",
        },
      },
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
      formclosed: {
        default: {
          title: "फॉर्म बंद है",
          description: "यह फॉर्म अब प्रतिक्रिया स्वीकार नहीं कर रहा है।",
        },
        while_responding: {
          title: "फॉर्म बंद है",
          description:
            "आपकी दिलचस्पी के लिए धन्यवाद। दुर्भाग्यवश, प्रतिक्रिया देते समय फॉर्म बंद हो गया है। अगर आपको लगता है कि यह गलती है, तो कृपया समर्थन से संपर्क करें।",
        },
      },
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
      formclosed: {
        default: {
          title: "Formulier Gesloten",
          description: "Dit formulier accepteert geen reacties meer.",
        },
        while_responding: {
          title: "Formulier Gesloten",
          description:
            "Dank u voor uw interesse. Helaas is het formulier gesloten terwijl u reageerde. Als u denkt dat dit een vergissing is, neem dan contact op met de ondersteuning.",
        },
      },
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
