import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { createServerComponentClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { GoogleAnalytics } from "@next/third-parties/google";
import "../globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Grida Forms",
  description:
    "Grida Forms is a headless & api-first form builder for developers",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = cookies();
  const supabase = createServerComponentClient(cookieStore);

  const { data } = await supabase.auth.getSession();

  const isLoggedIn = !!data.session?.user;

  if (isLoggedIn) {
    redirect("/dashboard");
  }

  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
      {process.env.NEXT_PUBLIC_GAID && (
        <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GAID} />
      )}
    </html>
  );
}
