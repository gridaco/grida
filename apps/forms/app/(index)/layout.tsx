import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { createServerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import "../globals.css";
import { redirect } from "next/navigation";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Grida Forms",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = cookies();
  const supabase = createServerClient(cookieStore);

  const { data } = await supabase.auth.getSession();

  const isLoggedIn = !!data.session?.user;

  if (isLoggedIn) {
    redirect("/dashboard");
  }

  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
