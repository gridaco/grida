import type { Metadata } from "next";
import { aiModelPages } from "@/www/data/ai-model-pages";

export function modelMetadata(page: aiModelPages.Entry): Metadata {
  const canonical = aiModelPages.url(page.slug);
  const socialImage = page.metadata.socialImage;

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
      images: socialImage
        ? [
            {
              url: socialImage.src,
              width: socialImage.width,
              height: socialImage.height,
              alt: socialImage.alt,
            },
          ]
        : undefined,
    },
    twitter: {
      card: socialImage ? "summary_large_image" : "summary",
      title: page.metadata.title,
      description: page.metadata.description,
      images: socialImage ? [socialImage.src] : undefined,
    },
  };
}
