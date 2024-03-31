import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { client, createServerComponentClient } from "@/lib/supabase/server";
import { Metadata } from "next";
import { Inter } from "next/font/google";
import i18next from "i18next";
import resources from "@/k/i18n";
import { FormPage, FormPageBackgroundSchema } from "@/types";

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
    .select(
      `
        *,
        default_page:form_page!default_form_page_id(
          *
        )
      `
    )
    .eq("id", id)
    .single();

  if (!data) {
    return notFound();
  }

  const { default_form_page_language, default_page } = data;

  i18next.init({
    lng: default_form_page_language,
    debug: false, //!IS_PRODUTION,
    resources: resources,
  });

  const { background } = default_page as any as FormPage;

  return (
    <html lang={default_form_page_language}>
      <body className={inter.className}>
        {children}
        {background && (
          <FormPageBackground {...(background as FormPageBackgroundSchema)} />
        )}
      </body>
    </html>
  );
}

function FormPageBackground({ element, src }: FormPageBackgroundSchema) {
  const renderBackground = () => {
    switch (element) {
      case "iframe":
        return <FormPageBackgroundIframe src={src!} />;
      default:
        return <></>;
    }
  };

  return (
    <div className="fixed select-none inset-0 -z-10">{renderBackground()}</div>
  );
}

function FormPageBackgroundIframe({ src }: { src: string }) {
  return (
    <iframe
      allowTransparency
      className="absolute inset-0 w-screen h-screen -z-10 bg-transparent"
      src={src}
      width="100vw"
      height="100vh"
    />
  );
}
