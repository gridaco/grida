import React from "react";
import HomePage from "./_home";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

// grida.co/
export const metadata: Metadata = {
  title: "An open canvas to design and create — Grida",
  description:
    "An open-source design canvas. Create images, slides, and designs with AI in Grida Desktop for macOS, Windows, and Linux.",
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
