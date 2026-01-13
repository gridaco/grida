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

interface CIAMVerificationEmailProps {
  email_otp: string;
  userName?: string;
  brand_name: string;
  expires_in_minutes?: number;
  lang?: "en" | "ko";
}

/**
 * General-purpose CIAM OTP email (verification).
 */
export default function EmailTemplateCIAMVerification({
  email_otp,
  userName,
  brand_name,
  expires_in_minutes = 10,
  lang = "en",
}: CIAMVerificationEmailProps) {
  const t = copy(lang, { brand_name, email_otp, userName, expires_in_minutes });

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

          <Text style={footer}>– {brand_name}</Text>
        </Container>
      </Body>
    </Html>
  );
}

function copy(
  lang: "en" | "ko",
  args: {
    brand_name: string;
    email_otp: string;
    userName?: string;
    expires_in_minutes: number;
  }
) {
  const name = args.userName?.trim();

  if (lang === "ko") {
    return {
      preview: `${args.brand_name} 인증 코드는 ${args.email_otp} 입니다`,
      heading: `${args.brand_name} 이메일 인증`,
      greeting: name ? `${name}님, 안녕하세요.` : "안녕하세요.",
      body: "아래 인증 코드를 입력해 이메일을 인증해 주세요:",
      footerText: `이 코드는 ${args.expires_in_minutes}분 후 만료됩니다. 요청하신 적이 없다면 이 이메일을 무시하셔도 됩니다.`,
    };
  }

  return {
    preview: `Your ${args.brand_name} verification code is ${args.email_otp}`,
    heading: `Verify your email for ${args.brand_name}`,
    greeting: name ? `Hi ${name},` : "Hello,",
    body: "Use the code below to verify your email:",
    footerText: `This code will expire in ${args.expires_in_minutes} minutes. If you didn’t request this, you can safely ignore this email.`,
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

