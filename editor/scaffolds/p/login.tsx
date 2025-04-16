"use client";

import React, { useMemo, useState } from "react";
import { UserCheck2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { createClientWorkspaceClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/spinner";
import { template } from "@/utils/template";
import toast from "react-hot-toast";

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
      "계정이 있으시다면, <strong>{email}</strong>로 코드를 보냈습니다. 아래에 입력해 주세요.",
    verifying: "인증중...",
    back: "← 뒤로",
  },
};

interface CustomerPropsMinimalCustomizationProps {
  locale?: string;
}

export default function PortalLogin({
  locale = "en",
  onSession,
  sendEmail,
}: CustomerPropsMinimalCustomizationProps & {
  onSession?: () => void;
  sendEmail?: (email: string) => Promise<boolean>;
}) {
  const supabase = useMemo(() => createClientWorkspaceClient(), []);
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email) {
      toast("Please enter your email address");
      return;
    }

    setIsLoading(true);
    sendEmail?.(email)
      .then((ok) => {
        if (ok) {
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
    const {
      data: { session },
      error,
    } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "email",
    });
    setIsLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    onSession?.();
  };

  const t = dictionary[locale as keyof typeof dictionary];

  return (
    <div className="flex flex-col gap-6">
      {step === "email" && (
        <form onSubmit={handleEmail}>
          <div className="flex flex-col gap-6">
            <div className="flex flex-col items-center gap-2">
              <div className="flex flex-col items-center gap-2 font-medium">
                <div className="flex h-8 w-8 items-center justify-center rounded-md">
                  <UserCheck2Icon className="size-6" />
                </div>
              </div>
              <h1 className="text-xl font-bold">{t.title}</h1>
              <div className="text-center text-sm">
                <span className="text-muted-foreground">{t.description}</span>
              </div>
            </div>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">{t.email}</Label>
                <Input
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? t.sending : t.continue_with_email}
              </Button>
            </div>
          </div>
        </form>
      )}
      {step === "otp" && (
        <Card className="w-full max-w-md border-none bg-transparent shadow-none">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold">
              {t.verification}
            </CardTitle>
            <CardDescription className="max-w-xs">
              <span className="text-sm text-muted-foreground">
                <span
                  dangerouslySetInnerHTML={{
                    __html: template(t.verification_description, { email }),
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
