import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { client, createServerComponentClient } from "@/lib/supabase/server";
import { Metadata } from "next";
import { Inter } from "next/font/google";
import i18next from "i18next";

const inter = Inter({ subsets: ["latin"] });

const IS_PRODUTION = process.env.NODE_ENV === "production";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const id = params.id;

  const { data, error } = await client
    .from("form")
    .select(
      `
        title,
        is_powered_by_branding_enabled
      `
    )
    .eq("id", id)
    .single();

  if (!data) {
    return notFound();
  }

  const { title, is_powered_by_branding_enabled } = data;

  return {
    title: is_powered_by_branding_enabled ? `${title} | Grida Forms` : title,
  };
}

export default async function Layout({
  params,
  children,
}: Readonly<{
  children: React.ReactNode;
  params: { id: string };
}>) {
  const { id } = params;
  const cookieStore = cookies();
  const supabase = createServerComponentClient(cookieStore);

  const { data, error } = await client
    .from("form")
    .select()
    .eq("id", id)
    .single();

  if (!data) {
    return notFound();
  }

  const { default_form_page_language } = data;

  i18next.init({
    lng: default_form_page_language,
    debug: !IS_PRODUTION,
    resources: {
      en: {
        translation: {
          next: "Next",
          back: "Previous",
          submit: "Submit",
          pay: "Pay",
        },
      },
      ko: {
        translation: {
          next: "다음",
          back: "이전",
          submit: "제출",
          pay: "결제",
        },
      },
    },
  });

  return (
    <html lang={default_form_page_language}>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
