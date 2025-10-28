"use client";

import type React from "react";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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

import { toast } from "sonner";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";

type Step = "email" | "otp";

export default function _Page() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const redirect_uri = searchParams.get("redirect_uri");

  const supabase = useMemo(() => createBrowserClient(), []);
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      toast("Please enter your email address");
      return;
    }

    setIsLoading(true);

    // Simulate API call
    const { data, error } = await supabase.auth.signInWithOtp({
      email: email,
      options: {
        shouldCreateUser: false,
      },
    });
    setIsLoading(false);

    if (error) {
      console.log("error", error);
      toast.error(error.message);
      return;
    }

    setStep("otp");
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

    if (next) {
      router.replace(next);
    } else if (redirect_uri) {
      router.replace(redirect_uri);
    } else {
      router.replace("/dashboard");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      {step === "email" && (
        <Card className="w-full max-w-md border-none bg-transparent shadow-none">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold">Sign in</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleEmail} className="space-y-4">
              <div className="space-y-2">
                <Input
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  className="w-full"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Sending..." : "Continue with Email"}
              </Button>
            </form>
            <div className="mt-4">
              <Link
                href="/sign-in"
                className="flex items-center gap-1 hover:underline text-sm text-muted-foreground"
              >
                ← Other Login options
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
      {step === "otp" && (
        <Card className="w-full max-w-md border-none bg-transparent shadow-none">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold">Verification</CardTitle>
            <CardDescription className="max-w-xs">
              <span className="text-sm text-muted-foreground">
                If you have an account, We have sent a code to{" "}
                <strong>{email}</strong>. Enter it below.
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OTP onComplete={handleOtp} disabled={isLoading} />

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
                    Verifying...
                  </>
                ) : (
                  <>← Back</>
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
