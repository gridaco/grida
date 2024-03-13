import { createServerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function EditFormPage({
  params,
}: {
  params: { id: string };
}) {
  return <main className="p-4"></main>;
}
