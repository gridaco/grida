import { notFound } from "next/navigation";
import { service_role } from "@/lib/supabase/server";
import { type Metadata, type Viewport } from "next";
import { Inconsolata, Inter, Lora } from "next/font/google";
import type { FormDocument } from "@/grida-forms-hosted/types";
import { ThemeProvider } from "@/components/theme-provider";
import { stringfyThemeVariables } from "@/theme/palettes/utils";
import { Toaster } from "@/components/ui/sonner";
import { CustomCSS } from "@/theme/customcss";
import { FormAgentGlobalWindowMessagingInterface } from "@/grida-forms-hosted/e/interface";
import { FingerprintProvider } from "@/components/fingerprint";
import palettes from "@/theme/palettes";

const inter = Inter({ subsets: ["latin"], display: "swap" });
const lora = Lora({ subsets: ["latin"], display: "swap" });
const inconsolata = Inconsolata({ subsets: ["latin"], display: "swap" });

const fonts = {
  inter,
  lora,
  inconsolata,
};

type Params = { id: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  // room for improvement - query optimization via rpc or meta from client side
  const { id } = await params;

  const { data: formdoc, error: formdoc_err } = await service_role.forms
    .from("form_document")
    .select(
      `
        id,
        is_powered_by_branding_enabled
      `
    )
    // TODO: change to document id after migration
    .eq("form_id", id)
    .single();

  if (!formdoc) {
    formdoc_err && console.error("ERR: ", formdoc_err);
    return notFound();
  }

  const { data: doc } = await service_role.workspace
    .from("document")
    .select("*")
    .eq("id", formdoc.id)
    .single();

  if (!doc) {
    return notFound();
  }

  const { is_powered_by_branding_enabled } = formdoc;
  const { title } = doc;

  return {
    title: is_powered_by_branding_enabled ? `${title} | Grida Forms` : title,
  };
}

export const viewport: Viewport = {
  initialScale: 1,
  width: "device-width",
  maximumScale: 1,
  viewportFit: "cover",
};

export default async function Layout({
  params,
  children,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<Params>;
}>) {
  const { id } = await params;

  const { data, error } = await service_role.forms
    .from("form_document")
    .select(
      `
        lang,
        stylesheet
      `
    )
    // TODO: change to document id after migration
    .eq("form_id", id)
    .single();

  if (!data) {
    return notFound();
  }

  const { stylesheet, lang } = data as FormDocument;

  const font =
    fonts[stylesheet?.["font-family"] as keyof typeof fonts] || fonts.inter;

  const customcss = stylesheet?.custom
    ? CustomCSS.vanilla(stylesheet?.custom)
    : undefined;
  const palettecss = stylesheet?.palette
    ? stringfyThemeVariables(palettes[stylesheet.palette] as any)
    : undefined;
  const appearance = stylesheet?.appearance || "system";

  const iscsscustomized = !!customcss;

  const props = {
    [CustomCSS.DATA_CUSTOM_CSS_KEY]: iscsscustomized,
  };

  return (
    <html lang={lang} suppressHydrationWarning>
      <body className={font.className} {...props}>
        {iscsscustomized && (
          <style
            id="customcss"
            dangerouslySetInnerHTML={{
              __html: `
              ${customcss}
            `,
            }}
          />
        )}
        <style
          id="custompalette"
          dangerouslySetInnerHTML={{
            __html: `
              ${palettecss}
            `,
          }}
        />
        <FingerprintProvider />
        <FormAgentGlobalWindowMessagingInterface>
          <ThemeProvider
            defaultTheme={appearance}
            forcedTheme={appearance}
            storageKey={`theme-form-agent-${id}`}
          >
            <Toaster position="bottom-center" />
            {children}
          </ThemeProvider>
        </FormAgentGlobalWindowMessagingInterface>
      </body>
    </html>
  );
}
