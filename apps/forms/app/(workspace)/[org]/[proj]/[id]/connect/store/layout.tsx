import { createServerComponentClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import React from "react";

export default async function Layout({
  params,
  children,
}: Readonly<{
  children: React.ReactNode;
  params: { id: string };
}>) {
  return <>{children}</>;
}
