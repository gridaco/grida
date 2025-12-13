import type { Metadata } from "next";
import Image from "next/image";

import Header from "@/www/header";
import FooterWithCTA from "@/www/footer-with-cta";
import { Section, SectionHeader, SectionHeaderBadge } from "@/www/ui/section";

const SITE_URL = "https://grida.co";
const BRAND_URL = `${SITE_URL}/brand`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Grida Brand",
  description: "Official Grida brand assets: logo usage and downloads.",
  alternates: {
    canonical: "/brand",
  },
  openGraph: {
    type: "website",
    url: BRAND_URL,
    title: "Grida Brand",
    description: "Official Grida brand assets: logo usage and downloads.",
    images: [
      { url: "/brand/grida-symbol-240.png", alt: "Grida symbol logo" },
      { url: "/brand/grida-wordmark-400.png", alt: "Grida wordmark logo" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Grida Brand",
    description: "Official Grida brand assets: logo usage and downloads.",
    images: ["/brand/grida-wordmark-400.png"],
  },
};

// grida.co/brand
export default function BrandPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: "Grida",
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "Grida",
        url: SITE_URL,
        description:
          "Grida is a Free & Open Canvas. Official brand assets and logo usage.",
        logo: {
          "@type": "ImageObject",
          url: `${SITE_URL}/brand/grida-symbol-240.png`,
          contentUrl: `${SITE_URL}/brand/grida-symbol-240.png`,
          caption: "Grida symbol logo",
        },
        image: [
          `${SITE_URL}/brand/grida-symbol-240.png`,
          `${SITE_URL}/brand/grida-wordmark-400.png`,
          `${SITE_URL}/brand/grida-symbol-240-dark.png`,
          `${SITE_URL}/brand/grida-wordmark-400-dark.png`,
        ],
        sameAs: ["https://github.com/gridaco/grida", "https://x.com/grida_co"],
      },
      {
        "@type": "WebPage",
        "@id": `${BRAND_URL}#webpage`,
        url: BRAND_URL,
        name: "Grida Brand",
        isPartOf: { "@id": `${SITE_URL}/#website` },
        about: { "@id": `${SITE_URL}/#organization` },
        primaryImageOfPage: {
          "@type": "ImageObject",
          url: `${SITE_URL}/brand/grida-symbol-240.png`,
          contentUrl: `${SITE_URL}/brand/grida-symbol-240.png`,
        },
      },
      {
        "@type": "ImageObject",
        "@id": `${BRAND_URL}#image-grida-symbol`,
        contentUrl: `${SITE_URL}/brand/grida-symbol-240.png`,
        url: `${SITE_URL}/brand/grida-symbol-240.png`,
        caption: "Grida symbol logo (PNG)",
        name: "Grida symbol logo",
      },
      {
        "@type": "ImageObject",
        "@id": `${BRAND_URL}#image-grida-wordmark`,
        contentUrl: `${SITE_URL}/brand/grida-wordmark-400.png`,
        url: `${SITE_URL}/brand/grida-wordmark-400.png`,
        caption: "Grida wordmark logo (PNG)",
        name: "Grida wordmark logo",
      },
    ],
  } as const;

  return (
    <main className="overflow-x-hidden">
      {/* JSON-LD (structured data). Next.js guide: https://nextjs.org/docs/app/guides/json-ld */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <Header className="relative" />

      {/* INTRO (SEO-friendly logo image) */}
      <Section container className="pt-28 md:pt-40 pb-20 md:pb-32">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 lg:gap-24 items-center">
          <div className="max-w-xl">
            <div className="mb-8">
              <SectionHeaderBadge>Brand</SectionHeaderBadge>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight">
              Grida brand
            </h1>
            <p className="mt-8 text-base md:text-lg text-muted-foreground">
              Official logo assets. Simple, monochrome, and consistent.
            </p>
          </div>

          {/* Not a download target — present for crawlers/SEO */}
          <div className="relative rounded-2xl border bg-background overflow-hidden p-10 md:p-12">
            <div className="relative w-full aspect-square">
              {/* Light/Dark aware wordmark */}
              <Image
                src="/brand/grida-wordmark-400.png"
                alt="Grida wordmark logo"
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 40vw"
                className="object-contain dark:hidden"
              />
              <Image
                src="/brand/grida-wordmark-400-dark.png"
                alt="Grida wordmark logo"
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 40vw"
                className="object-contain hidden dark:block"
              />
            </div>
          </div>
        </div>
      </Section>

      <Section container className="py-24 md:py-36 border-t">
        <SectionHeader
          badge={<SectionHeaderBadge>Logos</SectionHeaderBadge>}
          title={"Logo usage"}
          excerpt={
            "Symbol and wordmark. Light and dark previews, with PNG/SVG downloads."
          }
          oriantation="start"
        />

        <div className="mt-8 rounded-2xl border bg-card p-6 text-sm text-muted-foreground max-w-2xl">
          <span className="font-medium text-foreground">Note:</span> our symbol
          and wordmark are strictly{" "}
          <span className="font-medium">black/white monochrome</span>. It’s ok
          to ship only the black (light) asset and derive the white variant via
          CSS <code className="font-mono">filter: invert(1)</code> (or
          equivalent), as long as the artwork stays perfectly B/W.
        </div>

        <div className="mt-14 md:mt-20 grid grid-cols-1 xl:grid-cols-2 gap-14 xl:gap-20">
          {/* Always two rows; on large screens each row is half width */}
          <div className="xl:col-span-1 xl:col-start-1">
            <AssetGroup title="Symbol">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <BrandAssetCard
                  title="Light"
                  label="Light"
                  variant="light"
                  previewSrc="/brand/grida-symbol-240.png"
                  pngDownloadSrc="/brand/grida-symbol-240.png"
                  svgDownloadSrc="/brand/grida-symbol-240.svg"
                  alt="Grida symbol logo (light)"
                />
                <BrandAssetCard
                  title="Dark"
                  label="Dark"
                  variant="dark"
                  previewSrc="/brand/grida-symbol-240-dark.png"
                  pngDownloadSrc="/brand/grida-symbol-240-dark.png"
                  svgDownloadSrc="/brand/grida-symbol-240-dark.svg"
                  alt="Grida symbol logo (dark)"
                />
              </div>
            </AssetGroup>
          </div>

          <div className="xl:col-span-1 xl:col-start-1">
            <AssetGroup title="Wordmark">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <BrandAssetCard
                  title="Light"
                  label="Light"
                  variant="light"
                  previewSrc="/brand/grida-wordmark-400.png"
                  pngDownloadSrc="/brand/grida-wordmark-400.png"
                  svgDownloadSrc="/brand/grida-wordmark-400.svg"
                  alt="Grida wordmark logo (light)"
                />
                <BrandAssetCard
                  title="Dark"
                  label="Dark"
                  variant="dark"
                  previewSrc="/brand/grida-wordmark-400-dark.png"
                  pngDownloadSrc="/brand/grida-wordmark-400-dark.png"
                  svgDownloadSrc="/brand/grida-wordmark-400-dark.svg"
                  alt="Grida wordmark logo (dark)"
                />
              </div>
            </AssetGroup>
          </div>
        </div>
      </Section>

      <FooterWithCTA />
    </main>
  );
}

function AssetGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-xl md:text-2xl font-semibold tracking-tight">
          {title}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          PNG previews (for search indexing) + PNG/SVG downloads.
        </p>
      </div>
      {children}
    </section>
  );
}

function BrandAssetCard({
  title,
  label,
  variant,
  previewSrc,
  pngDownloadSrc,
  svgDownloadSrc,
  alt,
}: {
  title: string;
  label: string;
  variant: "light" | "dark";
  previewSrc: string;
  pngDownloadSrc: string;
  svgDownloadSrc: string;
  alt: string;
}) {
  const isDark = variant === "dark";

  return (
    <div className="relative">
      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="px-6 py-5 border-b text-sm text-muted-foreground">
          {label}
        </div>
        <div
          className={
            isDark
              ? "p-12 md:p-14 bg-neutral-950 text-white"
              : "p-12 md:p-14 bg-white text-neutral-900"
          }
        >
          <div className="relative w-full h-20 md:h-24">
            <Image
              src={previewSrc}
              alt={alt}
              fill
              priority
              sizes="(max-width: 640px) 100vw, 40vw"
              className="object-contain"
            />
          </div>
        </div>
      </div>

      {/* download control (bottom-right, outside card) */}
      <div className="absolute -bottom-5 right-4">
        <div className="flex items-center gap-2 rounded-full border bg-background/70 backdrop-blur-md px-4 py-2 shadow-sm supports-[backdrop-filter]:bg-background/60">
          <span className="text-xs text-muted-foreground">{title}</span>
          <span className="text-xs text-muted-foreground">·</span>
          <a
            href={svgDownloadSrc}
            download
            className="text-xs font-medium hover:underline"
            aria-label={`${label} download SVG`}
          >
            svg
          </a>
          <span className="text-xs text-muted-foreground">|</span>
          <a
            href={pngDownloadSrc}
            download
            className="text-xs font-medium hover:underline"
            aria-label={`${label} download PNG`}
          >
            png
          </a>
        </div>
      </div>
    </div>
  );
}
