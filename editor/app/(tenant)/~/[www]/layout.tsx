import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ToasterWithMax } from "@/components/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { createRouteHandlerWWWClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import "../../../editor.css";

type Params = {
  www: string;
};

const inter = Inter({ subsets: ["latin"] });

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { www } = await params;

  const cookieStore = cookies();
  const client = createRouteHandlerWWWClient(cookieStore);

  const { data, error } = await client
    .from("www_public")
    .select()
    .eq("name", www)
    .single();

  if (error) {
    console.error("www not found", www, error);
    return notFound();
  }

  const og_image = data?.og_image
    ? client.storage.from("www").getPublicUrl(data.og_image).data.publicUrl
    : null;

  const og_images = getOpenGraphImages(og_image);

  const favicon = data.favicon?.src
    ? client.storage.from("www").getPublicUrl(data.favicon.src).data.publicUrl
    : null;
  const faviconDark = data.favicon?.srcDark
    ? client.storage.from("www").getPublicUrl(data.favicon.srcDark).data
        .publicUrl
    : null;

  const icons = getFavicons(favicon, faviconDark);

  return {
    generator: "Grida",
    title: data.title ?? "Made with Grida",
    description: data.description,
    icons: icons,
    openGraph: {
      images: og_images,
    },
  };
}

function getOpenGraphImages(src: string | null) {
  const images = [];

  if (src) {
    images.push({
      url: src,
      width: 1200,
      height: 630,
    });
  }

  return images;
}

function getFavicons(src: string | null, srcDark?: string | null) {
  const icons = [];

  if (src) {
    icons.push({
      rel: "icon",
      url: src,
      media: "(prefers-color-scheme: light)",
    });
  }

  if (srcDark) {
    icons.push({
      rel: "icon",
      url: srcDark,
      media: "(prefers-color-scheme: dark)",
    });
  }

  if (!src && !srcDark) {
    icons.push({
      rel: "icon",
      url: "/favicon.ico",
    });
  }

  return icons;
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
    <html lang="en">
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ToasterWithMax />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
