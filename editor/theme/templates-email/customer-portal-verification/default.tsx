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

interface VerifyEmailProps {
  email_otp: string;
  userName?: string;
  brand_name: string;
}

export default function EmailTemplateCustomerPortalVerification({
  email_otp,
  userName,
  brand_name,
}: VerifyEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Your {brand_name} verification code is {email_otp}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={heading}>Verify your email for {brand_name}</Text>
          <Text style={text}>{userName ? `Hi ${userName},` : "Hello,"}</Text>
          <Text style={text}>
            Thanks for signing in to your {brand_name} customer portal. Use the
            code below to verify your email:
          </Text>

          <Section style={codeContainer}>
            <Text style={code}>{email_otp}</Text>
          </Section>

          <Text style={text}>
            This code will expire in 10 minutes. If you didn’t request this, you
            can safely ignore this email.
          </Text>

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
