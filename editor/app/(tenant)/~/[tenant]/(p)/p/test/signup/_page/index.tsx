"use client";

import * as React from "react";
import Link from "next/link";
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
import { template } from "@/utils/template";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";

type Step = "email" | "otp" | "done";

const dictionary = {
  en: {
    title: "Verify your email (test signup)",
    description:
      "Enter your email and we will send you a verification code. This creates a customer record if needed.",
    email: "Email",
    continue_with_email: "Send verification code",
    sending: "Sending...",
    verification: "Verification",
    verification_description:
      "We have sent a code to <strong>{email}</strong>. Enter it below.",
    verifying: "Verifying...",
    back: "← Back",
    success: "Email verified successfully.",
    go_portal: "Go to customer portal",
  },
  ko: {
    title: "이메일 인증 (테스트 가입)",
    description:
      "이메일을 입력하시면 인증 코드를 보내드립니다. 필요 시 고객 레코드가 생성됩니다.",
    email: "이메일",
    continue_with_email: "인증 코드 받기",
    sending: "전송중...",
    verification: "인증하기",
    verification_description:
      "<strong>{email}</strong>로 코드를 보냈습니다. 아래에 입력해 주세요.",
    verifying: "인증중...",
    back: "← 뒤로",
    success: "인증이 완료되었습니다.",
    go_portal: "고객 포털로 이동",
  },
};

export function CustomerSignupTestClient({
  locale = "en",
}: {
  locale?: string;
}) {
  const [email, setEmail] = React.useState("");
  const [step, setStep] = React.useState<Step>("email");
  const [challengeId, setChallengeId] = React.useState<string>("");
  const [error, setError] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);

  async function requestOtp() {
    setError("");
    setIsLoading(true);
    setChallengeId("");

    const res = await fetch("/api/ciam/auth/challenge/with-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json?.error ?? res.statusText);
      setIsLoading(false);
      return;
    }

    if (!json?.challenge_id) {
      setError("challenge_id was not returned");
      setIsLoading(false);
      return;
    }

    setChallengeId(String(json.challenge_id));
    setStep("otp");
    setIsLoading(false);
    toast.success(
      locale === "ko" ? "인증 코드를 보냈습니다." : "Verification code sent."
    );
  }

  async function verifyOtp(otp: string) {
    setError("");
    setIsLoading(true);
    const res = await fetch(
      `/api/ciam/auth/challenge/${encodeURIComponent(challengeId)}/verify`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ otp }),
      }
    );

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json?.error ?? res.statusText);
      setIsLoading(false);
      return;
    }

    setIsLoading(false);
    setStep("done");
    toast.success(t.success);
  }

  const t = dictionary[locale as keyof typeof dictionary] ?? dictionary.en;

  return (
    <div className="flex flex-col gap-6">
      {step === "email" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!email) return;
            requestOtp();
          }}
        >
          <div className="flex flex-col gap-6">
            <div className="flex flex-col items-center gap-2">
              <div className="flex flex-col items-center gap-2 font-medium">
                <div className="flex size-8 items-center justify-center rounded-md">
                  <UserCheck2Icon className="size-6" />
                </div>
              </div>
              <h1 className="text-xl font-bold">{t.title}</h1>
              <div className="text-center text-sm">
                <span className="text-muted-foreground">{t.description}</span>
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
            <InputOTP
              maxLength={6}
              disabled={isLoading}
              inputMode="numeric"
              onComplete={(otp) => {
                verifyOtp(otp);
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

      {step === "done" && (
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold">
              {t.verification}
            </CardTitle>
            <CardDescription>{t.success}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/p/login">
              <Button className="w-full">{t.go_portal}</Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
