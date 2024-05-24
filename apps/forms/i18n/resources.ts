import type { FormsPageLanguage } from "@/types";

export interface Translation {
  next: string;
  back: string;
  submit: string;
  pay: string;
  home: string;
  left_in_stock: string;
  sold_out: string;
  your_customer_id_is: string;
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
      title: string;
      description: string;
    };
    receipt01: {
      title: string;
      description: string;
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

const resources: Record<
  FormsPageLanguage,
  {
    translation: Translation;
  }
> = {
  en: {
    translation: {
      next: "Next",
      back: "Previous",
      submit: "Submit",
      pay: "Pay",
      home: "Home",
      left_in_stock: "{{available}} left",
      sold_out: "Sold Out",
      your_customer_id_is: "Your Customer ID is <code>{{customer_id}}</code>",
      formclosed: {
        default: {
          title: "Form Closed",
          description: "This form is no longer accepting responses.",
        },
        while_responding: {
          title: "Form Closed",
          description:
            "Thank you for your interest. Unfortunately, the form closed during your response. If you believe this is a mistake, please contact support.",
        },
      },
      formsoldout: {
        default: {
          title: "Sold Out",
          description:
            "All stock has been depleted, and we are no longer accepting orders.",
        },
      },
      formoptionsoldout: {
        default: {
          title: "Option Sold Out",
          description:
            "The selected option is sold out and no longer available.",
        },
      },
      formcomplete: {
        default: {
          title: "Response Complete",
          description: "Thank you for your response.",
        },
        receipt01: {
          title: "Receipt Confirmed",
          description:
            "Your receipt has been confirmed. Please consider taking a screenshot for your records.",
        },
      },
      alreadyresponded: {
        default: {
          title: "Already Responded",
          description:
            "You have already submitted this form. If you believe this is a mistake, please contact support.",
        },
      },
      badrequest: {
        default: {
          title: "Something went wrong",
          description:
            "Your request could not be processed. This may have occurred because the form was altered during the submission process or you are using an outdated version of the app. If the issue persists, please contact our support team for assistance.",
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
      home: "Inicio",
      left_in_stock: "{{available}} restantes",
      sold_out: "Agotado",
      your_customer_id_is: "Su ID de cliente es <code>{{customer_id}}</code>",
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
      formsoldout: {
        default: {
          title: "Agotado",
          description:
            "El stock ha sido agotado y no estamos aceptando más pedidos.",
        },
      },
      formoptionsoldout: {
        default: {
          title: "Opción Agotada",
          description:
            "La opción seleccionada está agotada y ya no está disponible.",
        },
      },
      formcomplete: {
        default: {
          title: "Respuesta Completa",
          description: "Gracias por su respuesta.",
        },
        receipt01: {
          title: "Recibo Confirmado",
          description:
            "Considere tomar una captura de pantalla de esta página para sus registros.",
        },
      },
      alreadyresponded: {
        default: {
          title: "Ya ha respondido",
          description:
            "Si considera que esto es un error, por favor contacte al soporte.",
        },
      },
      badrequest: {
        default: {
          title: "Algo salió mal",
          description:
            "Su solicitud no pudo ser procesada. Esto puede haber ocurrido porque el formulario fue alterado durante el proceso de envío o está utilizando una versión desactualizada de la aplicación. Si el problema persiste, por favor contacte a nuestro equipo de soporte para obtener ayuda.",
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
      left_in_stock: "{{available}}개 남음",
      sold_out: "매진됨",
      your_customer_id_is: "고객 ID는 <code>{{customer_id}}</code>입니다",
      formclosed: {
        default: {
          title: "폼이 마감되었습니다",
          description:
            "관심 가져주셔서 감사합니다. 현재 폼 접수가 종료되었습니다. 오류로 생각되신다면 지원팀에 연락해 주세요.",
        },
        while_responding: {
          title: "폼이 마감되었습니다",
          description:
            "관심 가져주셔서 감사합니다. 안타깝게도 응답을 받는 도중에 폼이 마감되었습니다. 이것이 실수라고 생각되시면 지원팀에 문의해 주세요.",
        },
      },
      formsoldout: {
        default: {
          title: "품절되었습니다",
          description: "모든 재고가 소진되어 추가 주문을 받지 않습니다.",
        },
      },
      formoptionsoldout: {
        default: {
          title: "옵션 품절",
          description: "선택하신 옵션이 품절되어 더 이상 제공되지 않습니다.",
        },
      },
      formcomplete: {
        default: {
          title: "응답 완료",
          description: "응답해 주셔서 감사합니다.",
        },
        receipt01: {
          title: "접수 완료",
          description:
            "접수가 완료되었습니다. 스크린샷을 찍어 접수 번호를 기록해 두세요.",
        },
      },
      alreadyresponded: {
        default: {
          title: "이미 응답한 상태입니다",
          description:
            "이 폼에 이미 응답하셨습니다. 오류로 생각되신다면 지원팀에 문의해 주세요.",
        },
      },
      badrequest: {
        default: {
          title: "오류가 발생했습니다",
          description:
            "잘못된 요청이 발생했습니다. 응답 중에 폼이 변경되었거나 사용 중인 앱 버전이 최신이 아니거나 허용되지 않은 접근일 수 있습니다. 문제가 계속되면 지원팀에 문의해 주십시오.",
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
      home: "ホーム",
      left_in_stock: "残り{{available}}個",
      sold_out: "完売",
      your_customer_id_is: "お客様の顧客IDは<code>{{customer_id}}</code>です",
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
      formsoldout: {
        default: {
          title: "完売",
          description:
            "在庫がすべて無くなり、これ以上の注文は受け付けておりません。",
        },
      },
      formoptionsoldout: {
        default: {
          title: "オプション完売",
          description: "選択されたオプションは売り切れで、もう利用できません。",
        },
      },
      formcomplete: {
        default: {
          title: "回答完了",
          description: "回答いただきありがとうございます。",
        },
        receipt01: {
          title: "受領確認済み",
          description:
            "このページのスクリーンショットを取って記録しておくことを検討してください。",
        },
      },
      alreadyresponded: {
        default: {
          title: "既に回答済み",
          description:
            "このフォームはすでに提出されています。これが間違いだと思われる場合は、サポートに連絡してください。",
        },
      },
      badrequest: {
        default: {
          title: "エラーが発生しました",
          description:
            "リクエストを処理できませんでした。送信プロセス中にフォームが変更されたか、アプリの古いバージョンを使用している可能性があります。問題が解決しない場合は、サポートチームにお問い合わせください。",
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
      home: "首页",
      left_in_stock: "剩余{{available}}件",
      sold_out: "售罄",
      your_customer_id_is: "您的客户ID是<code>{{customer_id}}</code>",
      formclosed: {
        default: {
          title: "表格已关闭",
          description: "此表格不再接受回应。",
        },
        while_responding: {
          title: "表格已关闭",
          description: "如果您认为这是一个错误，请及时联系支持团队。",
        },
      },
      formsoldout: {
        default: {
          title: "售罄",
          description: "库存已全部售罄，我们不再接受新的订单。",
        },
      },
      formoptionsoldout: {
        default: {
          title: "选项售罄",
          description: "所选选项已售罄，不再提供。",
        },
      },
      formcomplete: {
        default: {
          title: "回应完成",
          description: "感谢您的回应。",
        },
        receipt01: {
          title: "收据已确认",
          description: "考虑截图此页面以备记录。",
        },
      },
      alreadyresponded: {
        default: {
          title: "已经回应",
          description:
            "您已经提交过此表格。如果您认为这是一个错误，请联系支持。",
        },
      },
      badrequest: {
        default: {
          title: "发生错误",
          description:
            "您的请求无法处理。可能是因为在提交过程中表格被修改了或者您使用的是旧版本的应用程序。如果问题仍然存在，请联系支持团队寻求帮助。",
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
      home: "Accueil",
      left_in_stock: "{{available}} restants",
      sold_out: "Épuisé",
      your_customer_id_is:
        "Votre identifiant client est <code>{{customer_id}}</code>",
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
      formsoldout: {
        default: {
          title: "Épuisé",
          description:
            "Nous sommes en rupture de stock et n'acceptons plus de commandes.",
        },
      },
      formoptionsoldout: {
        default: {
          title: "Option Épuisée",
          description:
            "L'option sélectionnée est épuisée et n'est plus disponible.",
        },
      },
      formcomplete: {
        default: {
          title: "Réponse Complète",
          description: "Merci pour votre réponse.",
        },
        receipt01: {
          title: "Reçu Confirmé",
          description:
            "Envisagez de prendre une capture d'écran de cette page pour vos dossiers.",
        },
      },
      alreadyresponded: {
        default: {
          title: "Déjà répondu",
          description:
            "Vous avez déjà soumis ce formulaire. Si vous pensez que c'est une erreur, veuillez contacter le support.",
        },
      },
      badrequest: {
        default: {
          title: "Quelque chose s'est mal passé",
          description:
            "Votre demande n'a pas pu être traitée. Cela peut être dû au fait que le formulaire a été modifié pendant le processus de soumission ou que vous utilisez une version obsolète de l'application. Si le problème persiste, veuillez contacter notre équipe de support pour obtenir de l'aide.",
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
      home: "Início",
      left_in_stock: "{{available}} restantes",
      sold_out: "Esgotado",
      your_customer_id_is: "Seu ID de cliente é <code>{{customer_id}}</code>",
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
      formsoldout: {
        default: {
          title: "Esgotado",
          description:
            "Todo o estoque foi esgotado e não estamos mais aceitando pedidos.",
        },
      },
      formoptionsoldout: {
        default: {
          title: "Opção Esgotada",
          description:
            "A opção selecionada está esgotada e não está mais disponível.",
        },
      },
      formcomplete: {
        default: {
          title: "Resposta Completa",
          description: "Obrigado pela sua resposta.",
        },
        receipt01: {
          title: "Recebimento Confirmado",
          description:
            "Considere tirar uma captura de tela desta página para seus registros.",
        },
      },
      alreadyresponded: {
        default: {
          title: "Já Respondido",
          description:
            "Você já enviou este formulário. Se acredita que isso é um erro, por favor entre em contato com o suporte.",
        },
      },
      badrequest: {
        default: {
          title: "Algo deu errado",
          description:
            "Sua solicitação não pôde ser processada. Isso pode ter ocorrido porque o formulário foi alterado durante o processo de envio ou você está usando uma versão desatualizada do aplicativo. Se o problema persistir, entre em contato com nossa equipe de suporte para obter assistência.",
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
      home: "Home",
      left_in_stock: "{{available}} rimasti",
      sold_out: "Esaurito",
      your_customer_id_is: "Il tuo ID cliente è <code>{{customer_id}}</code>",
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
      formsoldout: {
        default: {
          title: "Esaurito",
          description:
            "Tutto il stock è esaurito e non stiamo più accettando ordini.",
        },
      },
      formoptionsoldout: {
        default: {
          title: "Opzione Esaurita",
          description:
            "L'opzione selezionata è esaurita e non è più disponibile.",
        },
      },
      formcomplete: {
        default: {
          title: "Risposta Completata",
          description: "Grazie per la tua risposta.",
        },
        receipt01: {
          title: "Ricevuta Confermata",
          description:
            "Considera di fare uno screenshot di questa pagina per i tuoi archivi.",
        },
      },
      alreadyresponded: {
        default: {
          title: "Già Risposto",
          description:
            "Hai già inviato questo modulo. Se pensi che sia un errore, contatta il supporto.",
        },
      },
      badrequest: {
        default: {
          title: "Qualcosa è andato storto",
          description:
            "La tua richiesta non può essere elaborata. Ciò può essere accaduto perché il modulo è stato modificato durante il processo di invio o stai utilizzando una versione obsoleta dell'app. Se il problema persiste, contatta il nostro team di supporto per assistenza.",
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
      home: "Startseite",
      left_in_stock: "{{available}} übrig",
      sold_out: "Ausverkauft",
      your_customer_id_is:
        "Ihre Kundennummer lautet <code>{{customer_id}}</code>",
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
      formsoldout: {
        default: {
          title: "Ausverkauft",
          description:
            "Unser gesamter Vorrat ist erschöpft, und wir nehmen keine Bestellungen mehr an.",
        },
      },
      formoptionsoldout: {
        default: {
          title: "Option Ausverkauft",
          description:
            "Die gewählte Option ist ausverkauft und nicht mehr verfügbar.",
        },
      },
      formcomplete: {
        default: {
          title: "Antwort Abgeschlossen",
          description: "Vielen Dank für Ihre Antwort.",
        },
        receipt01: {
          title: "Empfang Bestätigt",
          description:
            "Erwägen Sie, einen Screenshot dieser Seite für Ihre Unterlagen zu machen.",
        },
      },
      alreadyresponded: {
        default: {
          title: "Schon geantwortet",
          description:
            "Sie haben dieses Formular bereits eingereicht. Wenn Sie glauben, dass dies ein Fehler ist, kontaktieren Sie bitte den Support.",
        },
      },
      badrequest: {
        default: {
          title: "Etwas ist schief gelaufen",
          description:
            "Ihre Anfrage konnte nicht bearbeitet werden. Dies kann passiert sein, weil das Formular während des Einreichungsprozesses geändert wurde oder Sie eine veraltete Version der App verwenden. Wenn das Problem weiterhin besteht, kontaktieren Sie bitte unser Support-Team für Unterstützung.",
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
      home: "Главная",
      left_in_stock: "Осталось {{available}} шт.",
      sold_out: "Распродано",
      your_customer_id_is: "Ваш ID клиента - <code>{{customer_id}}</code>",
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
      formsoldout: {
        default: {
          title: "Распродано",
          description: "Весь запас исчерпан, и мы больше не принимаем заказы.",
        },
      },
      formoptionsoldout: {
        default: {
          title: "Опция распродана",
          description: "Выбранная опция распродана и больше не доступна.",
        },
      },
      formcomplete: {
        default: {
          title: "Ответ завершен",
          description: "Спасибо за ваш ответ.",
        },
        receipt01: {
          title: "Квитанция Подтверждена",
          description:
            "Рассмотрите возможность сделать скриншот этой страницы для ваших записей.",
        },
      },
      alreadyresponded: {
        default: {
          title: "Уже ответили",
          description:
            "Вы уже отправили эту форму. Если вы считаете, что это ошибка, пожалуйста, свяжитесь со службой поддержки.",
        },
      },
      badrequest: {
        default: {
          title: "Что-то пошло не так",
          description:
            "Ваш запрос не может быть обработан. Это могло произойти, потому что форма была изменена во время процесса отправки или вы используете устаревшую версию приложения. Если проблема сохраняется, пожалуйста, свяжитесь с нашей службой поддержки для получения помощи.",
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
      home: "الرئيسية",
      left_in_stock: "{{available}} متبقية",
      sold_out: "نفذت الكمية",
      your_customer_id_is:
        "رقم هوية العميل الخاص بك هو <code>{{customer_id}}</code>",
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
      formsoldout: {
        default: {
          title: "نفذت الكمية",
          description: "لقد نفذ كل المخزون ولم نعد نقبل طلبات جديدة.",
        },
      },
      formoptionsoldout: {
        default: {
          title: "الخيار نفذ",
          description: "الخيار المختار نفذ ولم يعد متوفرًا.",
        },
      },
      formcomplete: {
        default: {
          title: "اكتمل الرد",
          description: "شكراً لردك.",
        },
        receipt01: {
          title: "تأكيد الاستلام",
          description: "فكر في التقاط لقطة شاشة لهذه الصفحة لسجلاتك.",
        },
      },
      alreadyresponded: {
        default: {
          title: "تم الرد بالفعل",
          description:
            "لقد قدمت هذا النموذج بالفعل. إذا كنت تعتقد أن هذا خطأ، الرجاء التواصل مع الدعم.",
        },
      },
      badrequest: {
        default: {
          title: "حدث خطأ ما",
          description:
            "تعذر معالجة طلبك. قد يكون هذا بسبب تغيير النموذج أثناء عملية الإرسال أو أنك تستخدم إصدارًا قديمًا من التطبيق. إذا استمرت المشكلة، يرجى الاتصال بفريق الدعم لدينا للحصول على المساعدة.",
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
      home: "होम",
      left_in_stock: "{{available}} बचे हैं",
      sold_out: "बिक गया",
      your_customer_id_is: "आपका ग्राहक आईडी है <code>{{customer_id}}</code>",
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
      formsoldout: {
        default: {
          title: "बिक गया",
          description:
            "सभी स्टॉक समाप्त हो गया है और हम अब और आर्डर स्वीकार नहीं कर रहे हैं।",
        },
      },
      formoptionsoldout: {
        default: {
          title: "विकल्प बिक गया",
          description: "चुना गया विकल्प बिक गया है और अब उपलब्ध नहीं है।",
        },
      },
      formcomplete: {
        default: {
          title: "प्रतिक्रिया पूर्ण",
          description: "आपके जवाब के लिए धन्यवाद।",
        },
        receipt01: {
          title: "रसीद की पुष्टि",
          description:
            "अपने रिकॉर्ड के लिए इस पेज का स्क्रीनशॉट लेने पर विचार करें।",
        },
      },
      alreadyresponded: {
        default: {
          title: "पहले ही जवाब दे दिया गया है",
          description:
            "आप इस फॉर्म का जवाब पहले ही दे चुके हैं। अगर आपको लगता है कि यह गलती है, तो कृपया समर्थन से संपर्क करें।",
        },
      },
      badrequest: {
        default: {
          title: "कुछ गलत हो गया",
          description:
            "आपका अनुरोध संसाधित नहीं हो सका। यह इसलिए हो सकता है क्योंकि सबमिशन प्रक्रिया के दौरान फॉर्म में बदलाव किया गया या आप ऐप का पुराना संस्करण उपयोग कर रहे हैं। अगर समस्या बनी रहती है, तो कृपया सहायता के लिए हमारे समर्थन टीम से संपर्क करें।",
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
      home: "Home",
      left_in_stock: "Nog {{available}} beschikbaar",
      sold_out: "Uitverkocht",
      your_customer_id_is: "Uw klant-ID is <code>{{customer_id}}</code>",
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
      formsoldout: {
        default: {
          title: "Uitverkocht",
          description:
            "Al onze voorraad is opgebruikt, en we nemen geen bestellingen meer aan.",
        },
      },
      formoptionsoldout: {
        default: {
          title: "Optie Uitverkocht",
          description:
            "De geselecteerde optie is uitverkocht en niet meer beschikbaar.",
        },
      },
      formcomplete: {
        default: {
          title: "Reactie Voltooid",
          description: "Bedankt voor uw reactie.",
        },
        receipt01: {
          title: "Ontvangst Bevestigd",
          description:
            "Overweeg een screenshot van deze pagina te maken voor uw administratie.",
        },
      },
      alreadyresponded: {
        default: {
          title: "Al Gereageerd",
          description:
            "U heeft dit formulier al ingediend. Als u denkt dat dit een vergissing is, neem dan contact op met de ondersteuning.",
        },
      },
      badrequest: {
        default: {
          title: "Er is iets misgegaan",
          description:
            "Uw verzoek kon niet worden verwerkt. Dit kan zijn gebeurd omdat het formulier tijdens het indienen is gewijzigd of omdat u een verouderde versie van de app gebruikt. Als het probleem aanhoudt, neem dan contact op met ons ondersteuningsteam voor hulp.",
        },
      },
    },
  },
} as const;

export default resources;
