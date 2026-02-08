"use client";

import React from "react";
import { UserCheck2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";
import { template } from "@/utils/template";
import type { PortalPresetLoginPage } from "@app/database";

export type LoginStep = "email" | "otp";

const dictionary = {
  en: {
    title: "Log in to manage your account",
    description:
      "Enter your email and we will send you a verification code directly to your customer portal.",
    email: "Email",
    continue_with_email: "Continue with Email",
    sending: "Sending...",
    verification: "Verification",
    verification_description:
      "If you have an account, We have sent a code to <strong>{email}</strong>. Enter it below.",
    verifying: "Verifying...",
    back: "← Back",
  },
  ko: {
    title: "계속 하려면 로그인하세요",
    description: "이메일을 입력하시면 고객 포털 인증 코드를 보내드립니다.",
    email: "이메일",
    continue_with_email: "이메일로 계속하기",
    sending: "전송중...",
    verification: "인증하기",
    verification_description:
      "입력하신 <strong>{email}</strong>로 인증 코드를 발송하였습니다. 아래에 입력해 주세요. 코드를 수신하지 못한 경우, 정확한 이메일을 입력하였는지 다시 한 번 확인해 주세요.",
    verifying: "인증중...",
    back: "← 뒤로",
  },
};

function ov(override: string | null | undefined, fallback: string): string {
  return typeof override === "string" && override.trim().length > 0
    ? override
    : fallback;
}

export type PortalLoginViewProps = {
  overrides?: PortalPresetLoginPage | null;
  step: LoginStep;
  locale?: string;
  /** Sample email for OTP step description template in view-only mode (e.g. "user@example.com") */
  sampleEmail?: string;
  /** When true, renders as static preview (disabled inputs). Default true. */
  viewOnly?: boolean;
  // --- Interactive mode (when viewOnly=false) ---
  /** Email value for controlled input (email step) */
  email?: string;
  /** Callback when email input changes */
  onEmailChange?: (value: string) => void;
  /** Callback when email form is submitted */
  onEmailSubmit?: (e: React.FormEvent) => void;
  /** Loading state (shows "Sending..." on button for email, "Verifying..." on back for OTP) */
  isLoading?: boolean;
  /** Callback when OTP is complete (OTP step) */
  onOtpComplete?: (otp: string) => void;
  /** Callback when back button is clicked (OTP step) */
  onBack?: () => void;
  /** Error message to show (OTP step) */
  error?: string;
};

/**
 * Reusable portal login page UI template (202602-default).
 * Use for preview (viewOnly=true) or production login flow (viewOnly=false with handlers).
 */
export function PortalLoginView({
  overrides,
  step,
  locale = "en",
  sampleEmail = "user@example.com",
  viewOnly = true,
  email = "",
  onEmailChange,
  onEmailSubmit,
  isLoading = false,
  onOtpComplete,
  onBack,
  error,
}: PortalLoginViewProps) {
  const t = dictionary[locale as keyof typeof dictionary];

  const emailStepTitle = ov(overrides?.email_step_title, t.title);
  const emailStepDescription = ov(
    overrides?.email_step_description,
    t.description
  );
  const emailStepButtonLabel = ov(
    overrides?.email_step_button_label,
    t.continue_with_email
  );
  const otpStepTitle = ov(overrides?.otp_step_title, t.verification);
  const otpStepDescription = ov(
    overrides?.otp_step_description,
    t.verification_description
  );

  const otpEmail = viewOnly ? sampleEmail : email;

  if (step === "email") {
    return (
      <div className="flex flex-col gap-6">
        <form
          onSubmit={
            viewOnly
              ? (e) => e.preventDefault()
              : (onEmailSubmit ?? ((e) => e.preventDefault()))
          }
        >
          <div className="flex flex-col gap-6">
            <div className="flex flex-col items-center gap-2">
              <div className="flex flex-col items-center gap-2 font-medium">
                <div className="flex size-8 items-center justify-center rounded-md">
                  <UserCheck2Icon className="size-6" />
                </div>
              </div>
              <h1 className="text-xl font-bold">{emailStepTitle}</h1>
              <div className="text-center text-sm">
                <span className="text-muted-foreground">
                  {emailStepDescription}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-6">
              <Field>
                <FieldLabel htmlFor="portal-login-email">{t.email}</FieldLabel>
                <Input
                  id="portal-login-email"
                  type="email"
                  placeholder="name@example.com"
                  value={viewOnly ? "" : email}
                  onChange={
                    viewOnly
                      ? undefined
                      : (e) => onEmailChange?.(e.target.value)
                  }
                  disabled={viewOnly || isLoading}
                  readOnly={viewOnly}
                  required={!viewOnly}
                  className={viewOnly ? "bg-muted" : undefined}
                />
              </Field>
              <Button
                type="submit"
                className="w-full"
                disabled={viewOnly || isLoading}
              >
                {!viewOnly && isLoading ? t.sending : emailStepButtonLabel}
              </Button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  // OTP step
  return (
    <div className="flex flex-col gap-6">
      <Card className="w-full max-w-md border-none bg-transparent shadow-none">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">{otpStepTitle}</CardTitle>
          <CardDescription className="max-w-xs">
            <span className="text-sm text-muted-foreground">
              <span
                dangerouslySetInnerHTML={{
                  __html: template(otpStepDescription, { email: otpEmail }),
                }}
              />
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InputOTP
            maxLength={6}
            disabled={viewOnly || isLoading}
            inputMode="numeric"
            onComplete={viewOnly ? undefined : (otp) => onOtpComplete?.(otp)}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
            </InputOTPGroup>
            <InputOTPGroup>
              <InputOTPSlot index={1} />
            </InputOTPGroup>
            <InputOTPGroup>
              <InputOTPSlot index={2} />
            </InputOTPGroup>
            <InputOTPGroup>
              <InputOTPSlot index={3} />
            </InputOTPGroup>
            <InputOTPGroup>
              <InputOTPSlot index={4} />
            </InputOTPGroup>
            <InputOTPGroup>
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>

          {!viewOnly && error && (
            <div className="mt-4">
              <span className="text-destructive text-sm">{error}</span>
            </div>
          )}

          <div className="mt-4">
            <Button
              variant="link"
              className="px-0 text-muted-foreground"
              disabled={viewOnly || isLoading}
              onClick={viewOnly ? undefined : onBack}
            >
              {!viewOnly && isLoading ? (
                <>
                  <Spinner className="me-2" />
                  {t.verifying}
                </>
              ) : (
                t.back
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
