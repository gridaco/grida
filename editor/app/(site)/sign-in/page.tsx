import React from "react";
import { ContinueWithGoogleButton } from "@/host/auth/continue-with-google-button";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SignInShell } from "@/components/auth/sign-in-shell";

type SearchParams = {
  redirect_uri?: string;
  next?: string;
};

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to Grida",
};

const USE_INSIDERS_AUTH =
  process.env.NEXT_PUBLIC_GRIDA_USE_INSIDERS_AUTH === "1";

export default async function SigninPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { next, redirect_uri } = await searchParams;
  const q = new URLSearchParams(await searchParams).toString();

  const client = await createClient();

  const auth = await client.auth.getUser();

  if (auth.data.user) {
    return redirect("/");
  }

  if (USE_INSIDERS_AUTH) {
    return redirect("/insiders/auth/basic" + (q ? "?" + q : ""));
  }

  return (
    <SignInShell
      title={
        <>
          Welcome to
          <br /> Grida
        </>
      }
      subtitle="Sign up or Sign in to your account"
    >
      <Suspense>
        <ContinueWithGoogleButton next={next} redirect_uri={redirect_uri} />
      </Suspense>
      <hr />
      <Link
        href={`/sign-in/email?${q}`}
        className="flex items-center gap-1 hover:underline text-sm text-muted-foreground"
      >
        Continue with Email →
      </Link>
    </SignInShell>
  );
}
