import type { Metadata } from "next";
import { aiModelPages } from "@/www/data/ai-model-pages";

export function modelMetadata(page: aiModelPages.Entry): Metadata {
  const canonical = aiModelPages.url(page.slug);

  return {
    metadataBase: new URL("https://grida.co"),
    title: page.metadata.title,
    description: page.metadata.description,
    keywords: [...page.metadata.keywords],
    alternates: { canonical },
    openGraph: {
      title: page.metadata.title,
      description: page.metadata.description,
      type: "website",
      url: canonical,
    },
    twitter: {
      card: "summary",
      title: page.metadata.title,
      description: page.metadata.description,
    },
  };
}
