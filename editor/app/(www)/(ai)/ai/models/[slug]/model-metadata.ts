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
      images: [
        {
          url: page.metadata.image.src,
          width: page.metadata.image.width,
          height: page.metadata.image.height,
          alt: page.metadata.image.alt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: page.metadata.title,
      description: page.metadata.description,
      images: [page.metadata.image.src],
    },
  };
}
