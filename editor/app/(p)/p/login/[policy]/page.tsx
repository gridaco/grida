"use client";

import React, { useMemo, useState } from "react";
import { GalleryVerticalEnd } from "lucide-react";
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
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/spinner";

type Step = "email" | "otp";

type Params = {
  policy: string;
};

export default function CustomerPortalLoginPage({
  params,
}: {
  params: Params;
}) {
  const { policy } = params;

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm policy={policy} />
      </div>
    </div>
  );
}

function LoginForm({ policy }: { policy: string }) {
  const router = useRouter();
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
    fetch(`/p/access/${policy}/with-email`, {
      method: "POST",
      body: JSON.stringify({
        email: email,
      }),
    })
      .then((res) => {
        if (res.ok) {
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

    router.replace(`../session/${policy}`);
  };

  return (
    <div className="flex flex-col gap-6">
      {step === "email" && (
        <form onSubmit={handleEmail}>
          <div className="flex flex-col gap-6">
            <div className="flex flex-col items-center gap-2">
              <div className="flex flex-col items-center gap-2 font-medium">
                <div className="flex h-8 w-8 items-center justify-center rounded-md">
                  <GalleryVerticalEnd className="size-6" />
                </div>
                <span className="sr-only">Acme Inc.</span>
              </div>
              <h1 className="text-xl font-bold">Welcome to Acme Inc.</h1>
              <div className="text-center text-sm">
                Enter your email and we will send you a link directly to your
                customer portal.
              </div>
            </div>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
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
                {isLoading ? "Sending..." : "Continue with Email"}
              </Button>
            </div>
          </div>
        </form>
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
