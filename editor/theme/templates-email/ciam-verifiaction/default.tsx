import * as React from "react";
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Text,
  Section,
} from "@react-email/components";

export type CIAMVerificationEmailLang = "en" | "ko" | "es" | "ja" | "zh";

export const supported_languages = [
  "en",
  "ko",
  "es",
  "ja",
  "zh",
] as const satisfies readonly CIAMVerificationEmailLang[];

export function subject(
  lang: CIAMVerificationEmailLang,
  props: { brand_name: string; email_otp: string }
) {
  const { brand_name, email_otp } = props;
  switch (lang) {
    case "ko":
      return `${email_otp} - ${brand_name} 인증 코드`;
    case "ja":
      return `${email_otp} - ${brand_name} 確認コード`;
    case "es":
      return `${email_otp} - Código de verificación de ${brand_name}`;
    case "zh":
      return `${email_otp} - ${brand_name} 验证码`;
    case "en":
    default:
      return `${email_otp} - ${brand_name} verification code`;
  }
}

interface CIAMVerificationEmailProps {
  email_otp: string;
  customer_name?: string;
  brand_name: string;
  expires_in_minutes?: number;
  lang?: CIAMVerificationEmailLang;
  brand_support_url?: string;
  brand_support_contact?: string;
}

/**
 * General-purpose CIAM OTP email (verification).
 */
export default function EmailTemplateCIAMVerification({
  email_otp,
  customer_name,
  brand_name,
  expires_in_minutes = 10,
  lang = "en",
  brand_support_url,
  brand_support_contact,
}: CIAMVerificationEmailProps) {
  const t = copy(lang, {
    brand_name,
    email_otp,
    customer_name,
    expires_in_minutes,
  });
  const hasSupportUrl = !!brand_support_url;
  const hasSupportContact = !!brand_support_contact;

  return (
    <Html>
      <Head />
      <Preview>{t.preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={heading}>{t.heading}</Text>
          <Text style={text}>{t.greeting}</Text>
          <Text style={text}>{t.body}</Text>

          <Section style={codeContainer}>
            <Text style={code}>{email_otp}</Text>
          </Section>

          <Text style={text}>{t.footerText}</Text>

          <Text style={note}>{t.note}</Text>

          {(hasSupportUrl || hasSupportContact) && (
            <Text style={support}>
              {t.questions_prefix}{" "}
              {hasSupportUrl && (
                <>
                  {t.support_site_prefix}{" "}
                  <a href={brand_support_url} style={supportLink}>
                    {t.support_site_label}
                  </a>
                </>
              )}
              {hasSupportUrl && hasSupportContact ? ` ${t.or} ` : null}
              {hasSupportContact && (
                <>
                  {t.support_contact_prefix}{" "}
                  {brand_support_contact.includes("@") ? (
                    <a
                      href={`mailto:${brand_support_contact}`}
                      style={supportLink}
                    >
                      {brand_support_contact}
                    </a>
                  ) : (
                    <span style={supportLink}>{brand_support_contact}</span>
                  )}
                </>
              )}
              .
            </Text>
          )}

          <Text style={footer}>– {brand_name}</Text>
        </Container>
      </Body>
    </Html>
  );
}

function copy(
  lang: CIAMVerificationEmailLang,
  args: {
    brand_name: string;
    email_otp: string;
    customer_name?: string;
    expires_in_minutes: number;
  }
) {
  const name = args.customer_name?.trim();

  if (lang === "ko") {
    return {
      preview: `${args.brand_name} 인증 코드는 ${args.email_otp} 입니다`,
      heading: `${args.brand_name} 이메일 인증`,
      greeting: name ? `${name}님, 안녕하세요.` : "안녕하세요.",
      body: "아래 인증 코드를 입력해 이메일을 인증해 주세요:",
      footerText: `이 코드는 ${args.expires_in_minutes}분 후 만료됩니다. 요청하신 적이 없다면 이 이메일을 무시하셔도 됩니다.`,
      note: "안내: 이 이메일의 인증 코드는 본인만 사용해야 합니다. 이메일을 다른 사람에게 전달하지 마세요.",
      questions_prefix: "문의가 있으신가요?",
      support_site_prefix: "지원 사이트:",
      support_site_label: "바로가기",
      or: "또는",
      support_contact_prefix: "연락처:",
    };
  }

  if (lang === "ja") {
    return {
      preview: `${args.brand_name} の確認コードは ${args.email_otp} です`,
      heading: `${args.brand_name} メール認証`,
      greeting: name ? `${name} 様` : "こんにちは。",
      body: "以下の確認コードを入力してメールアドレスを確認してください：",
      footerText: `このコードは${args.expires_in_minutes}分後に期限切れになります。心当たりがない場合は、このメールを無視してください。`,
      note: "注意: このメールの確認コードはご本人のみが使用してください。このメールを転送しないでください。",
      questions_prefix: "ご不明な点はありますか？",
      support_site_prefix: "サポートサイト:",
      support_site_label: "こちら",
      or: "または",
      support_contact_prefix: "お問い合わせ:",
    };
  }

  if (lang === "es") {
    return {
      preview: `Tu código de verificación de ${args.brand_name} es ${args.email_otp}`,
      heading: `Verifica tu correo para ${args.brand_name}`,
      greeting: name ? `Hola ${name},` : "Hola,",
      body: "Usa el código de abajo para verificar tu correo:",
      footerText: `Este código caduca en ${args.expires_in_minutes} minutos. Si no lo solicitaste, puedes ignorar este correo.`,
      note: "Nota: Este correo contiene un código que solo tú deberías usar. No reenvíes este correo.",
      questions_prefix: "¿Necesitas ayuda?",
      support_site_prefix: "Visita nuestro",
      support_site_label: "sitio de soporte",
      or: "o",
      support_contact_prefix: "contáctanos en",
    };
  }

  if (lang === "zh") {
    return {
      preview: `${args.brand_name} 验证码是 ${args.email_otp}`,
      heading: `${args.brand_name} 邮箱验证`,
      greeting: name ? `您好，${name}：` : "您好，",
      body: "请输入以下验证码以验证您的邮箱：",
      footerText: `验证码将在 ${args.expires_in_minutes} 分钟后过期。如果您并未请求此操作，请忽略此邮件。`,
      note: "提示：此邮件包含仅供您本人使用的验证码。请勿转发此邮件。",
      questions_prefix: "有问题吗？",
      support_site_prefix: "访问我们的",
      support_site_label: "支持网站",
      or: "或",
      support_contact_prefix: "联系我们：",
    };
  }

  return {
    preview: `Your ${args.brand_name} verification code is ${args.email_otp}`,
    heading: `Verify your email for ${args.brand_name}`,
    greeting: name ? `Hi ${name},` : "Hello,",
    body: "Use the code below to verify your email:",
    footerText: `This code will expire in ${args.expires_in_minutes} minutes. If you didn’t request this, you can safely ignore this email.`,
    note: "Please note: This email contains a code that should only be used by you. Do not forward this email.",
    questions_prefix: "Questions?",
    support_site_prefix: "Visit our",
    support_site_label: "support site",
    or: "or",
    support_contact_prefix: "contact us at",
  };
}

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily: "Helvetica, Arial, sans-serif",
  padding: "40px 0",
};

const container = {
  backgroundColor: "#ffffff",
  padding: "30px",
  borderRadius: "8px",
  maxWidth: "480px",
  margin: "0 auto",
  boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
};

const heading = {
  fontSize: "18px",
  fontWeight: "bold" as const,
  marginBottom: "10px",
};

const text = {
  fontSize: "14px",
  lineHeight: "1.5",
  margin: "10px 0",
};

const codeContainer = {
  backgroundColor: "#f4f4f7",
  padding: "16px",
  borderRadius: "6px",
  textAlign: "center" as const,
  margin: "20px 0",
};

const code = {
  fontSize: "24px",
  letterSpacing: "6px",
  fontWeight: "bold" as const,
  color: "#333",
};

const footer = {
  fontSize: "12px",
  color: "#8898aa",
  marginTop: "30px",
};

const note = {
  fontSize: "13px",
  lineHeight: "1.5",
  margin: "16px 0 0",
  color: "#667085",
};

const support = {
  fontSize: "13px",
  lineHeight: "1.5",
  margin: "18px 0 0",
  color: "#667085",
};

const supportLink = {
  color: "#4f46e5",
  textDecoration: "underline",
};
