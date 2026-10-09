import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BillingConsumerError } from "@/lib/platform/billing-consumer";
import {
  accountContinuation,
  accountPath,
  accountSignInPath,
  resolveAccountContinuation,
} from "@/lib/platform/console-account";
import { Button } from "@app/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@app/ui/components/card";
import { ChangeAccountForm } from "./change-account-form";
import { changeAccount } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Choose an account",
  robots: { index: false, follow: false },
  // Native form POSTs retain Origin without sharing the continuation cross-origin.
  referrer: "same-origin" as const,
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let continuation: string;
  try {
    continuation = accountContinuation(await searchParams);
  } catch {
    return notFound();
  }
  try {
    const resolved = await resolveAccountContinuation(continuation);
    const signInURL = accountSignInPath(continuation);
    const client = await createClient();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error && error.name !== "AuthSessionMissingError")
      throw new BillingConsumerError();
    return (
      <main className="mx-auto flex min-h-svh max-w-md items-center px-6 py-12">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>
              <h1>Choose an account</h1>
            </CardTitle>
            <CardDescription>
              Choose the Grida account to use in the console. You will confirm
              any change there.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {user ? (
              <>
                <Button asChild className="w-full">
                  <Link href={resolved.returnURL} prefetch={false}>
                    Continue as {user.email ?? "current account"}
                  </Link>
                </Button>
                <ChangeAccountForm
                  action={changeAccount.bind(null, continuation)}
                  permalink={accountPath(continuation)}
                />
              </>
            ) : (
              <Button asChild className="w-full">
                <Link href={signInURL} prefetch={false}>
                  Sign in
                </Link>
              </Button>
            )}
            <Button asChild variant="ghost" className="w-full">
              <Link href={resolved.cancelURL} prefetch={false}>
                Cancel
              </Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  } catch (error) {
    const expired =
      error instanceof BillingConsumerError && error.code !== "unavailable";
    return (
      <main className="mx-auto max-w-md space-y-4 px-6 py-16">
        <h1 className="text-xl font-semibold">Account request unavailable</h1>
        <p className="text-muted-foreground">
          {expired
            ? "This request has expired or is no longer available. Return to the console and try again."
            : "Account switching is temporarily unavailable. Please try again."}
        </p>
        {!expired && (
          <Button asChild variant="outline">
            <Link href={accountPath(continuation)} prefetch={false}>
              Try again
            </Link>
          </Button>
        )}
      </main>
    );
  }
}
