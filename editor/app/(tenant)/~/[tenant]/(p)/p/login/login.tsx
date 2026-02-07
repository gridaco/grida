"use client";

import React, { useState } from "react";
import { PortalLoginView } from "@/theme/templates/portal-login/202602-default/portal-login-view";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { PortalPresetLoginPage } from "@app/database";

type Step = "email" | "otp";

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
    sendEmail(email)
      .then(({ ok, challenge_id }) => {
        if (ok) {
          setChallengeId(challenge_id ?? null);
          setStep("otp");
        } else {
          toast.error("Something went wrong");
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  const handleOtp = async (otp: string) => {
    setIsLoading(true);
    setError("");

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

  return (
    <PortalLoginView
      overrides={overrides}
      step={step}
      locale={locale}
      viewOnly={false}
      email={email}
      onEmailChange={setEmail}
      onEmailSubmit={handleEmail}
      isLoading={isLoading}
      onOtpComplete={handleOtp}
      onBack={() => setStep("email")}
      error={error}
    />
  );
}
