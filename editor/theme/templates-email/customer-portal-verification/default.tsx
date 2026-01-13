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

export type CustomerPortalVerificationEmailLang =
  | "en"
  | "ko"
  | "es"
  | "ja"
  | "zh";

export const supported_languages = [
  "en",
  "ko",
  "es",
  "ja",
  "zh",
] as const satisfies readonly CustomerPortalVerificationEmailLang[];

export function subject(
  lang: CustomerPortalVerificationEmailLang,
  props: { brand_name: string; email_otp: string }
) {
  const { brand_name, email_otp } = props;
  switch (lang) {
    case "ko":
      return `${email_otp} - ${brand_name} 고객 포털 인증 코드`;
    case "ja":
      return `${email_otp} - ${brand_name} カスタマーポータル確認コード`;
    case "es":
      return `${email_otp} - Código de verificación del portal de clientes de ${brand_name}`;
    case "zh":
      return `${email_otp} - ${brand_name} 客户门户验证码`;
    case "en":
    default:
      return `${email_otp} - ${brand_name} Customer Portal verification code`;
  }
}

interface TenantCustomerPortalAccessEmailVerificationProps {
  email_otp: string;
  customer_name?: string;
  brand_name: string;
  brand_support_url?: string;
  brand_support_contact?: string;
  lang?: CustomerPortalVerificationEmailLang;
}

export default function TenantCustomerPortalAccessEmailVerification({
  email_otp,
  customer_name,
  brand_name,
  brand_support_url,
  brand_support_contact,
  lang = "en",
}: TenantCustomerPortalAccessEmailVerificationProps) {
  const hasSupportUrl = !!brand_support_url;
  const hasSupportContact = !!brand_support_contact;

  const t =
    lang === "ko"
      ? ko
      : lang === "ja"
        ? ja
        : lang === "es"
          ? es
          : lang === "zh"
            ? zh
            : en;

  return (
    <Html>
      <Head />
      <Preview>{t.preview({ brand_name, email_otp })}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={heading}>{t.heading}</Text>
          <Text style={text}>
            {customer_name ? t.greeting(customer_name) : t.greeting_fallback}
          </Text>
          <Text style={text}>{t.body_1({ brand_name })}</Text>

          <Section style={codeContainer}>
            <Text style={code}>{email_otp}</Text>
          </Section>

          <Text style={text}>{t.body_2({ brand_name })}</Text>

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

const en = {
  preview: ({
    brand_name,
    email_otp,
  }: {
    brand_name: string;
    email_otp: string;
  }) => `Your ${brand_name} Customer Portal verification code is ${email_otp}`,
  heading: "Access your customer portal",
  greeting: (name: string) => `Hi ${name},`,
  greeting_fallback: "Hello,",
  body_1: ({ brand_name }: { brand_name: string }) =>
    `Use the verification code below to confirm this email address and access your ${brand_name} Customer Portal.`,
  body_2: ({ brand_name }: { brand_name: string }) =>
    `This code expires in 10 minutes. If you didn’t request access to the ${brand_name} Customer Portal, you can safely ignore this email.`,
  note: "Please note: This email contains a code that should only be used by you. Do not forward this email.",
  questions_prefix: "Questions?",
  support_site_prefix: "Visit our",
  support_site_label: "support site",
  or: "or",
  support_contact_prefix: "contact us at",
} as const;

const ko = {
  preview: ({
    brand_name,
    email_otp,
  }: {
    brand_name: string;
    email_otp: string;
  }) => `${brand_name} 고객 포털 인증 코드는 ${email_otp} 입니다`,
  heading: "고객 포털에 접속하기",
  greeting: (name: string) => `${name}님, 안녕하세요.`,
  greeting_fallback: "안녕하세요.",
  body_1: ({ brand_name }: { brand_name: string }) =>
    `아래 인증 코드를 입력하여 이메일을 확인하고 ${brand_name} 고객 포털에 접속하세요.`,
  body_2: ({ brand_name }: { brand_name: string }) =>
    `이 인증 코드는 10분 후 만료됩니다. ${brand_name} 고객 포털 접속을 요청하지 않으셨다면 이 이메일을 무시하셔도 됩니다.`,
  note: "안내: 이 이메일의 인증 코드는 본인만 사용해야 합니다. 이메일을 다른 사람에게 전달하지 마세요.",
  questions_prefix: "문의가 있으신가요?",
  support_site_prefix: "지원 사이트:",
  support_site_label: "바로가기",
  or: "또는",
  support_contact_prefix: "연락처:",
} as const;

const ja = {
  preview: ({
    brand_name,
    email_otp,
  }: {
    brand_name: string;
    email_otp: string;
  }) => `${brand_name} カスタマーポータルの確認コードは ${email_otp} です`,
  heading: "カスタマーポータルにアクセス",
  greeting: (name: string) => `${name} 様`,
  greeting_fallback: "こんにちは。",
  body_1: ({ brand_name }: { brand_name: string }) =>
    `以下の確認コードを入力してメールアドレスを確認し、${brand_name} カスタマーポータルにアクセスしてください。`,
  body_2: ({ brand_name }: { brand_name: string }) =>
    `このコードは10分後に期限切れになります。${brand_name} カスタマーポータルへのアクセスをリクエストしていない場合は、このメールを無視してください。`,
  note: "注意: このメールの確認コードはご本人のみが使用してください。このメールを転送しないでください。",
  questions_prefix: "ご不明な点はありますか？",
  support_site_prefix: "サポートサイト:",
  support_site_label: "こちら",
  or: "または",
  support_contact_prefix: "お問い合わせ:",
} as const;

const es = {
  preview: ({
    brand_name,
    email_otp,
  }: {
    brand_name: string;
    email_otp: string;
  }) =>
    `Tu código de verificación del Portal de Clientes de ${brand_name} es ${email_otp}`,
  heading: "Accede a tu portal de clientes",
  greeting: (name: string) => `Hola ${name},`,
  greeting_fallback: "Hola,",
  body_1: ({ brand_name }: { brand_name: string }) =>
    `Usa el siguiente código de verificación para confirmar esta dirección de correo y acceder al Portal de Clientes de ${brand_name}.`,
  body_2: ({ brand_name }: { brand_name: string }) =>
    `Este código caduca en 10 minutos. Si no solicitaste acceso al Portal de Clientes de ${brand_name}, puedes ignorar este correo.`,
  note: "Nota: Este correo contiene un código que solo tú deberías usar. No reenvíes este correo.",
  questions_prefix: "¿Necesitas ayuda?",
  support_site_prefix: "Visita nuestro",
  support_site_label: "sitio de soporte",
  or: "o",
  support_contact_prefix: "contáctanos en",
} as const;

const zh = {
  preview: ({
    brand_name,
    email_otp,
  }: {
    brand_name: string;
    email_otp: string;
  }) => `${brand_name} 客户门户验证码是 ${email_otp}`,
  heading: "访问客户门户",
  greeting: (name: string) => `您好，${name}：`,
  greeting_fallback: "您好，",
  body_1: ({ brand_name }: { brand_name: string }) =>
    `请输入以下验证码以确认该邮箱并访问 ${brand_name} 客户门户。`,
  body_2: ({ brand_name }: { brand_name: string }) =>
    `验证码将在 10 分钟后过期。如果您并未请求访问 ${brand_name} 客户门户，请忽略此邮件。`,
  note: "提示：此邮件包含仅供您本人使用的验证码。请勿转发此邮件。",
  questions_prefix: "有问题吗？",
  support_site_prefix: "访问我们的",
  support_site_label: "支持网站",
  or: "或",
  support_contact_prefix: "联系我们：",
} as const;
