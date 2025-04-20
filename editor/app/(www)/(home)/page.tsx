import React from "react";
import HomePage from "./_home";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

// grida.co/
export const metadata: Metadata = {
  title: "Grida",
  description: "Grida is a Free & Open Canvas",
};

export default async function WWWIndex() {
  const client = await createClient();

  const { data } = await client.auth.getUser();

  const isLoggedIn = !!data?.user;

  if (isLoggedIn) {
    redirect("/dashboard");
  }

  return <HomePage />;
}
