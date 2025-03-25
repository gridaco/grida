import { Suspense } from "react";
import _Page from "./_page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to Grida",
};

export default function AuthContinueWithEmailPage() {
  return (
    <Suspense>
      <_Page />
    </Suspense>
  );
}
