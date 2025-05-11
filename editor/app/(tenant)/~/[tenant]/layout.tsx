import type { Metadata, Viewport } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { createWWWClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Tenant } from "@/lib/tenant";
import "../../../globals.css";

type Params = {
  tenant: string;
};

const inter = Inter({ subsets: ["latin"] });

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { tenant } = await params;

  const wwwClient = await createWWWClient();

  const { data, error } = await wwwClient
    .from("www_public")
    .select()
    .eq("name", tenant)
    .single();

  if (error) {
    console.warn("www not found", tenant, error);
    return notFound();
  }

  const og_image = data?.og_image
    ? wwwClient.storage.from("www").getPublicUrl(data.og_image).data.publicUrl
    : null;

  const og_images = Tenant.www.metadata.getOpenGraphImages(og_image);

  const favicon = data.favicon?.src
    ? wwwClient.storage.from("www").getPublicUrl(data.favicon.src).data
        .publicUrl
    : null;
  const faviconDark = data.favicon?.srcDark
    ? wwwClient.storage.from("www").getPublicUrl(data.favicon.srcDark).data
        .publicUrl
    : null;

  const icons = Tenant.www.metadata.getFavicons(favicon, faviconDark);

  const title = data.title || "Made with Grida";

  return {
    generator: "Grida",
    title: { default: title, template: `%s | ${title}` },
    description: data.description,
    icons: icons,
    openGraph: {
      images: og_images,
    },
  };
}

export const viewport: Viewport = {
  initialScale: 1,
  width: "device-width",
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        {process.env.NEXT_PUBLIC_GAID && (
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GAID} />
        )}
        <Analytics />
        <SpeedInsights />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Toaster position="bottom-center" />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
