import React from "react";
import HomePage from "./_home";
import { createServerComponentClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

// grida.co/
export const metadata: Metadata = {
  title: "Grida",
  description: "Grida is a Free & Open Canvas",
};

export default async function WWWIndex() {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore);

  const { data } = await supabase.auth.getUser();

  const isLoggedIn = !!data?.user;

  if (isLoggedIn) {
    redirect("/dashboard");
  }

  return <HomePage />;
}
