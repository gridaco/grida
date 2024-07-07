import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { client, createServerComponentClient } from "@/lib/supabase/server";
import { Metadata } from "next";
import { Inconsolata, Inter, Lora } from "next/font/google";
import { FormPage } from "@/types";
import { ThemeProvider } from "@/components/theme-provider";

export const revalidate = 0;

const inter = Inter({ subsets: ["latin"], display: "swap" });
const lora = Lora({ subsets: ["latin"], display: "swap" });
const inconsolata = Inconsolata({ subsets: ["latin"], display: "swap" });

const fonts = {
  inter,
  lora,
  inconsolata,
};

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
    .select(
      `
        default_form_page_language,
        default_form_page:form_page!default_form_page_id(
          stylesheet
        )
      `
    )
    .eq("id", id)
    .single();

  if (!data) {
    return notFound();
  }

  const { default_form_page_language, default_form_page: default_form_pages } =
    data;

  // this is safe to cast this way - typegen has a bug
  const default_form_page = default_form_pages as unknown as FormPage;

  const font =
    fonts[
      default_form_page.stylesheet?.["font-family"] as keyof typeof fonts
    ] || fonts.inter;

  return (
    <html lang={default_form_page_language} suppressHydrationWarning>
      <body className={font.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
