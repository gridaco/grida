import { TemplateVariables } from "@/lib/templating";
import type { ObjectPath } from "@/lib/templating/@types";
import type { FormsPageLanguage } from "@/grida-forms-hosted/types";

type T = ObjectPath<
  TemplateVariables.FormResponseContext & {
    available: number;
  }
>;

/**
 * @example 'c.d' => '{{c.d}}'
 * @param key
 * @returns
 */
function use(key: T) {
  return `{{${key}}}`;
}

export interface Translation {
  next: string;
  back: string;
  submit: string;
  pay: string;
  home: string;
  // Common UI labels (forms)
  verify?: string;
  resend?: string;
  retry?: string;
  sending?: string;
  email_challenge?: {
    verify_code?: string;
    enter_verification_code?: string;
    code_sent?: string;
    didnt_receive_code?: string;
    code_expired?: string;
    incorrect_code?: string;
    error_occurred?: string;
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
      verify: "Verify",
      resend: "Resend",
      retry: "Retry",
      sending: "Sending",
      email_challenge: {
        verify_code: "Verify",
        enter_verification_code: "Enter verification code",
        code_sent: "A verification code has been sent to your inbox.",
        didnt_receive_code: "Didn't receive a code?",
        code_expired: "Verification code has expired.",
        incorrect_code: "Incorrect verification code. Please try again.",
        error_occurred: "An error occurred. Please try again later.",
      },
      left_in_stock: `${use("available")} left`,
      sold_out: "Sold Out",
      support_metadata: `Support Metadata`,
      support_metadata_no_share:
        "Please do not share this information with anyone except support.",
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
          h1: `${use("form_title")}`,
          p: "Thank you for your response.",
          button: "Home",
          href: "/",
        },
        receipt01: {
          h1: `${use("response.idx")}`,
          h2: `Receipt Confirmed - ${use("form_title")}`,
          p: "Your receipt has been confirmed. Please consider taking a screenshot for your records.",
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
      verify: "Verificar",
      resend: "Reenviar",
      retry: "Reintentar",
      sending: "Enviando",
      email_challenge: {
        verify_code: "Verificar",
        enter_verification_code: "Introduce el código de verificación",
        code_sent: "Se ha enviado un código de verificación a tu correo.",
        didnt_receive_code: "¿No recibiste el código?",
        code_expired: "El código de verificación ha caducado.",
        incorrect_code: "Código incorrecto. Inténtalo de nuevo.",
        error_occurred: "Ocurrió un error. Inténtalo más tarde.",
      },
      left_in_stock: `${use("available")} restantes`,
      sold_out: "Agotado",
      support_metadata: `Metadatos de soporte`,
      support_metadata_no_share:
        "Por favor, no comparta esta información con nadie excepto con el soporte.",
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
          h1: `${use("form_title")}`,
          p: "Gracias por su respuesta.",
          button: "Inicio",
          href: "/",
        },
        receipt01: {
          h1: `${use("response.idx")}`,
          h2: `Recibo Confirmado - ${use("form_title")}`,
          p: "Considere tomar una captura de pantalla de esta página para sus registros.",
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
      verify: "인증",
      resend: "재전송",
      retry: "다시 시도",
      sending: "전송 중",
      email_challenge: {
        verify_code: "인증",
        enter_verification_code: "인증 코드를 입력해 주세요",
        code_sent: "인증 코드가 이메일로 전송되었습니다.",
        didnt_receive_code: "코드를 받지 못하셨나요?",
        code_expired: "인증 코드가 만료되었습니다.",
        incorrect_code: "인증 코드가 올바르지 않습니다. 다시 시도해 주세요.",
        error_occurred: "오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      },
      left_in_stock: `${use("available")}개 남음`,
      sold_out: "매진됨",
      support_metadata: `서포트 메타데이터`,
      support_metadata_no_share:
        "지원팀을 제외하고 이 정보를 공유하지 마십시오.",
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
          h1: `${use("form_title")}`,
          p: "응답해 주셔서 감사합니다.",
          button: "홈",
          href: "/",
        },
        receipt01: {
          h1: `${use("response.idx")}`,
          h2: `접수 완료 - ${use("form_title")}`,
          p: "접수가 완료되었습니다. 스크린샷을 찍어 접수 번호를 기록해 두세요.",
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
      verify: "確認",
      resend: "再送信",
      retry: "再試行",
      sending: "送信中",
      email_challenge: {
        verify_code: "確認",
        enter_verification_code: "確認コードを入力",
        code_sent: "確認コードをメールで送信しました。",
        didnt_receive_code: "コードが届きませんか？",
        code_expired: "確認コードの有効期限が切れました。",
        incorrect_code:
          "確認コードが正しくありません。もう一度お試しください。",
        error_occurred:
          "エラーが発生しました。しばらくしてからもう一度お試しください。",
      },
      left_in_stock: `残り${use("available")}個`,
      sold_out: "完売",
      support_metadata: `サポートメタデータ`,
      support_metadata_no_share:
        "この情報はサポート以外の誰とも共有しないでください。",
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
          h1: `${use("form_title")}`,
          p: "回答いただきありがとうございます。",
          button: "ホーム",
          href: "/",
        },
        receipt01: {
          h1: `${use("response.idx")}`,
          h2: `受領確認済み - ${use("form_title")}`,
          p: "このページのスクリーンショットを取って記録しておくことを検討してください。",
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
      verify: "验证",
      resend: "重新发送",
      retry: "重试",
      sending: "发送中",
      email_challenge: {
        verify_code: "验证",
        enter_verification_code: "输入验证码",
        code_sent: "验证码已发送到您的邮箱。",
        didnt_receive_code: "没有收到验证码？",
        code_expired: "验证码已过期。",
        incorrect_code: "验证码不正确，请重试。",
        error_occurred: "发生错误，请稍后再试。",
      },
      left_in_stock: `剩余${use("available")}件`,
      sold_out: "售罄",
      support_metadata: `支持元数据`,
      support_metadata_no_share: "请勿与支持团队之外的任何人分享此信息。",
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
          h1: `${use("form_title")}`,
          p: "感谢您的回应。",
          button: "首页",
          href: "/",
        },
        receipt01: {
          h1: `${use("response.idx")}`,
          h2: `收据已确认 - ${use("form_title")}`,
          p: "考虑截图此页面以备记录。",
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
      verify: "Vérifier",
      resend: "Renvoyer",
      retry: "Réessayer",
      sending: "Envoi en cours",
      email_challenge: {
        verify_code: "Vérifier",
        enter_verification_code: "Entrez le code de vérification",
        code_sent:
          "Un code de vérification a été envoyé à votre adresse e-mail.",
        didnt_receive_code: "Vous n'avez pas reçu de code ?",
        code_expired: "Le code de vérification a expiré.",
        incorrect_code: "Code incorrect. Veuillez réessayer.",
        error_occurred:
          "Une erreur est survenue. Veuillez réessayer plus tard.",
      },
      left_in_stock: `${use("available")} restants`,
      sold_out: "Épuisé",
      support_metadata: `Métadonnées de support`,
      support_metadata_no_share:
        "Veuillez ne pas partager ces informations avec quiconque sauf le support.",
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
          h1: `${use("form_title")}`,
          p: "Merci pour votre réponse.",
          button: "Accueil",
          href: "/",
        },
        receipt01: {
          h1: `${use("response.idx")}`,
          h2: `Reçu Confirmé - ${use("form_title")}`,
          p: "Envisagez de prendre une capture d'écran de cette page pour vos dossiers.",
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
      verify: "Verificar",
      resend: "Reenviar",
      retry: "Tentar novamente",
      sending: "Enviando",
      email_challenge: {
        verify_code: "Verificar",
        enter_verification_code: "Digite o código de verificação",
        code_sent: "Um código de verificação foi enviado para o seu e-mail.",
        didnt_receive_code: "Não recebeu o código?",
        code_expired: "O código de verificação expirou.",
        incorrect_code: "Código incorreto. Tente novamente.",
        error_occurred: "Ocorreu um erro. Tente novamente mais tarde.",
      },
      left_in_stock: `${use("available")} restantes`,
      sold_out: "Esgotado",
      support_metadata: `Metadados de suporte`,
      support_metadata_no_share:
        "Por favor, não compartilhe essas informações com ninguém, exceto o suporte.",
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
          h1: `${use("form_title")}`,
          p: "Obrigado pela sua resposta.",
          button: "Início",
          href: "/",
        },
        receipt01: {
          h1: `${use("response.idx")}`,
          h2: `Recebimento Confirmado - ${use("form_title")}`,
          p: "Considere tirar uma captura de tela desta página para seus registros.",
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
      verify: "Verifica",
      resend: "Reinvia",
      retry: "Riprova",
      sending: "Invio in corso",
      email_challenge: {
        verify_code: "Verifica",
        enter_verification_code: "Inserisci il codice di verifica",
        code_sent: "Un codice di verifica è stato inviato alla tua email.",
        didnt_receive_code: "Non hai ricevuto il codice?",
        code_expired: "Il codice di verifica è scaduto.",
        incorrect_code: "Codice non corretto. Riprova.",
        error_occurred: "Si è verificato un errore. Riprova più tardi.",
      },
      left_in_stock: `${use("available")} rimasti`,
      sold_out: "Esaurito",
      support_metadata: `Metadati di supporto`,
      support_metadata_no_share:
        "Si prega di non condividere queste informazioni con nessuno tranne il supporto.",
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
          h1: `${use("form_title")}`,
          p: "Grazie per la tua risposta.",
          button: "Home",
          href: "/",
        },
        receipt01: {
          h1: `${use("response.idx")}`,
          h2: `Ricevuta Confermata - ${use("form_title")}`,
          p: "Considera di fare uno screenshot di questa pagina per i tuoi archivi.",
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
      verify: "Bestätigen",
      resend: "Erneut senden",
      retry: "Erneut versuchen",
      sending: "Wird gesendet",
      email_challenge: {
        verify_code: "Bestätigen",
        enter_verification_code: "Bestätigungscode eingeben",
        code_sent: "Ein Bestätigungscode wurde an Ihre E-Mail gesendet.",
        didnt_receive_code: "Keinen Code erhalten?",
        code_expired: "Der Bestätigungscode ist abgelaufen.",
        incorrect_code: "Falscher Code. Bitte erneut versuchen.",
        error_occurred:
          "Ein Fehler ist aufgetreten. Bitte später erneut versuchen.",
      },
      left_in_stock: `${use("available")} übrig`,
      sold_out: "Ausverkauft",
      support_metadata: `Support-Metadaten`,
      support_metadata_no_share:
        "Bitte teilen Sie diese Informationen nur mit dem Support und sonst niemandem.",
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
          h1: `${use("form_title")}`,
          p: "Vielen Dank für Ihre Antwort.",
          button: "Startseite",
          href: "/",
        },
        receipt01: {
          h1: `${use("response.idx")}`,
          h2: `Empfang Bestätigt - ${use("form_title")}`,
          p: "Erwägen Sie, einen Screenshot dieser Seite für Ihre Unterlagen zu machen.",
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
      verify: "Подтвердить",
      resend: "Отправить снова",
      retry: "Повторить",
      sending: "Отправка",
      email_challenge: {
        verify_code: "Подтвердить",
        enter_verification_code: "Введите код подтверждения",
        code_sent: "Код подтверждения отправлен на вашу почту.",
        didnt_receive_code: "Не получили код?",
        code_expired: "Срок действия кода истёк.",
        incorrect_code: "Неверный код. Попробуйте ещё раз.",
        error_occurred: "Произошла ошибка. Повторите попытку позже.",
      },
      left_in_stock: `Осталось ${use("available")} шт.`,
      sold_out: "Распродано",
      support_metadata: `Метаданные поддержки`,
      support_metadata_no_share:
        "Пожалуйста, не делитесь этой информацией ни с кем, кроме службы поддержки.",
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
          h1: `${use("form_title")}`,
          p: "Спасибо за ваш ответ.",
          button: "Главная",
          href: "/",
        },
        receipt01: {
          h1: `${use("response.idx")}`,
          h2: `Квитанция Подтверждена - ${use("form_title")}`,
          p: "Рассмотрите возможность сделать скриншот этой страницы для ваших записей.",
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
      verify: "تحقق",
      resend: "إعادة الإرسال",
      retry: "إعادة المحاولة",
      sending: "جارٍ الإرسال",
      email_challenge: {
        verify_code: "تحقق",
        enter_verification_code: "أدخل رمز التحقق",
        code_sent: "تم إرسال رمز التحقق إلى بريدك الإلكتروني.",
        didnt_receive_code: "لم يصلك الرمز؟",
        code_expired: "انتهت صلاحية رمز التحقق.",
        incorrect_code: "رمز غير صحيح. حاول مرة أخرى.",
        error_occurred: "حدث خطأ. حاول لاحقًا.",
      },
      left_in_stock: `${use("available")} متبقية`,
      sold_out: "نفذت الكمية",
      support_metadata: `بيانات الدعم الوصفية`,
      support_metadata_no_share:
        "يرجى عدم مشاركة هذه المعلومات مع أي شخص باستثناء الدعم.",
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
          h1: `${use("form_title")}`,
          p: "شكراً لردك.",
          button: "الرئيسية",
          href: "/",
        },
        receipt01: {
          h1: `${use("response.idx")}`,
          h2: `${use("form_title")} - تأكيد الاستلام`,
          p: "فكر في التقاط لقطة شاشة لهذه الصفحة لسجلاتك.",
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
      verify: "सत्यापित करें",
      resend: "फिर से भेजें",
      retry: "पुनः प्रयास करें",
      sending: "भेजा जा रहा है",
      email_challenge: {
        verify_code: "सत्यापित करें",
        enter_verification_code: "सत्यापन कोड दर्ज करें",
        code_sent: "आपके ईमेल पर सत्यापन कोड भेजा गया है।",
        didnt_receive_code: "कोड नहीं मिला?",
        code_expired: "सत्यापन कोड की समय-सीमा समाप्त हो गई है।",
        incorrect_code: "गलत कोड। फिर से प्रयास करें।",
        error_occurred: "एक त्रुटि हुई। बाद में पुनः प्रयास करें।",
      },
      left_in_stock: `${use("available")} बचे हैं`,
      sold_out: "बिक गया",
      support_metadata: `सहायता मेटाडाटा`,
      support_metadata_no_share:
        "कृपया इस जानकारी को सहायता के अलावा किसी के साथ साझा न करें।",
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
          h1: `${use("form_title")}`,
          p: "आपके जवाब के लिए धन्यवाद।",
          button: "होम",
          href: "/",
        },
        receipt01: {
          h1: `${use("response.idx")}`,
          h2: `रसीद की पुष्टि - ${use("form_title")}`,
          p: "अपने रिकॉर्ड के लिए इस पेज का स्क्रीनशॉट लेने पर विचार करें।",
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
      verify: "Verifiëren",
      resend: "Opnieuw verzenden",
      retry: "Opnieuw proberen",
      sending: "Bezig met verzenden",
      email_challenge: {
        verify_code: "Verifiëren",
        enter_verification_code: "Voer verificatiecode in",
        code_sent: "Er is een verificatiecode naar je e-mail gestuurd.",
        didnt_receive_code: "Geen code ontvangen?",
        code_expired: "De verificatiecode is verlopen.",
        incorrect_code: "Onjuiste code. Probeer het opnieuw.",
        error_occurred: "Er is een fout opgetreden. Probeer het later opnieuw.",
      },
      left_in_stock: `Nog ${use("available")} beschikbaar`,
      sold_out: "Uitverkocht",
      support_metadata: `Ondersteuningsmetadata`,
      support_metadata_no_share:
        "Deel deze informatie alstublieft niet met iemand anders dan de ondersteuning.",
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
          h1: `${use("form_title")}`,
          p: "Bedankt voor uw reactie.",
          button: "Home",
          href: "/",
        },
        receipt01: {
          h1: `${use("response.idx")}`,
          h2: `Ontvangst Bevestigd - ${use("form_title")}`,
          p: "Overweeg een screenshot van deze pagina te maken voor uw administratie.",
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
