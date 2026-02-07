"use client";

import React, { useState } from "react";
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
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { PortalPresetLoginPage } from "@app/database";

type Step = "email" | "otp";

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
      'If you have an account, We have sent a code to <strong>{email}</strong>. Enter it below.',
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
      '입력하신 <strong>{email}</strong>로 인증 코드를 발송하였습니다. 아래에 입력해 주세요. 코드를 수신하지 못한 경우, 정확한 이메일을 입력하였는지 다시 한 번 확인해 주세요.',
    verifying: "인증중...",
    back: "← 뒤로",
  },
};

/**
 * Helper: returns the override value if it is a non-empty string, otherwise the fallback.
 */
function ov(override: string | null | undefined, fallback: string): string {
  return typeof override === "string" && override.trim().length > 0
    ? override
    : fallback;
}

interface PortalLoginProps {
  locale?: string;
  overrides?: PortalPresetLoginPage | null;
}

export default function PortalLogin({
  locale = "en",
  overrides,
}: PortalLoginProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [challengeId, setChallengeId] = useState<string | null>(null);

  const sendEmail = async (email: string) => {
    const res = await fetch(`/api/p/access/with-email`, {
      method: "POST",
      body: JSON.stringify({
        email: email,
      }),
    });
    const json = await res.json().catch(() => ({}));
    return {
      ok: res.ok,
      // Note: endpoint returns ok even when the email isn't registered.
      // We store challenge_id if present, but do not depend on it for the email step UI.
      challenge_id: (json as any)?.challenge_id as string | undefined,
    };
  };

  const handleEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email) {
      toast("Please enter your email address");
      return;
    }

    setIsLoading(true);
    sendEmail?.(email)
      .then(({ ok, challenge_id }) => {
        if (ok) {
          setChallengeId(challenge_id ?? null);
          setStep("otp");
        } else {
          toast.error("Something went wrong");
          return;
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  const handleOtp = async (otp: string) => {
    setIsLoading(true);
    setError("");

    // CIAM flow:
    // Customer portal access is verified via CIAM OTP challenge verification.
    // This intentionally does NOT use Supabase Auth.
    if (!challengeId) {
      setIsLoading(false);
      setError("Invalid or expired OTP");
      return;
    }

    const res = await fetch(
      `/api/ciam/auth/challenge/${encodeURIComponent(challengeId)}/verify`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ otp }),
      }
    );

    const json = await res.json().catch(() => ({}));
    setIsLoading(false);

    if (!res.ok) {
      setError((json as any)?.error ?? "Invalid or expired OTP");
      return;
    }

    const session_url = (json as any)?.session_url as string | undefined;
    if (!session_url) {
      setError("Invalid or expired OTP");
      return;
    }

    router.replace(session_url);
  };

  const t = dictionary[locale as keyof typeof dictionary];

  // Apply preset overrides (if any) on top of the locale dictionary.
  const emailStepTitle = ov(overrides?.email_step_title, t.title);
  const emailStepDescription = ov(overrides?.email_step_description, t.description);
  const emailStepButtonLabel = ov(overrides?.email_step_button_label, t.continue_with_email);
  const otpStepTitle = ov(overrides?.otp_step_title, t.verification);
  const otpStepDescription = ov(overrides?.otp_step_description, t.verification_description);

  return (
    <div className="flex flex-col gap-6">
      {step === "email" && (
        <form onSubmit={handleEmail}>
          <div className="flex flex-col gap-6">
            <div className="flex flex-col items-center gap-2">
              <div className="flex flex-col items-center gap-2 font-medium">
                <div className="flex size-8 items-center justify-center rounded-md">
                  <UserCheck2Icon className="size-6" />
                </div>
              </div>
              <h1 className="text-xl font-bold">{emailStepTitle}</h1>
              <div className="text-center text-sm">
                <span className="text-muted-foreground">{emailStepDescription}</span>
              </div>
            </div>
            <div className="flex flex-col gap-6">
              <Field>
                <FieldLabel htmlFor="email">{t.email}</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  required
                />
              </Field>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? t.sending : emailStepButtonLabel}
              </Button>
            </div>
          </div>
        </form>
      )}
      {step === "otp" && (
        <Card className="w-full max-w-md border-none bg-transparent shadow-none">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold">
              {otpStepTitle}
            </CardTitle>
            <CardDescription className="max-w-xs">
              <span className="text-sm text-muted-foreground">
                <span
                  dangerouslySetInnerHTML={{
                    __html: template(otpStepDescription, { email }),
                  }}
                />
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OTP disabled={isLoading} onComplete={handleOtp} />

            {error && (
              <div className="mt-4">
                <span className="text-destructive text-sm">{error}</span>
              </div>
            )}

            <div className="mt-4">
              <Button
                variant="link"
                className="px-0 text-muted-foreground"
                disabled={isLoading}
                onClick={() => setStep("email")}
              >
                {isLoading ? (
                  <>
                    <Spinner className="me-2" />
                    {t.verifying}
                  </>
                ) : (
                  <>{t.back}</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function OTP({
  disabled,
  onComplete,
}: {
  disabled?: boolean;
  onComplete?: (otp: string) => void;
}) {
  return (
    <InputOTP
      maxLength={6}
      disabled={disabled}
      inputMode="numeric"
      onComplete={(otp) => {
        onComplete?.(otp);
      }}
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
  );
}
