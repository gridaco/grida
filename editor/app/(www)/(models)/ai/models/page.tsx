import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/www/header";
import Footer from "@/www/footer";
import { ConsoleLinks } from "@/lib/platform/console-links";
import { readPublicModels } from "@/lib/gg/public-models/server";
import { parseFilters } from "@/lib/gg/public-models/catalogue";
import { ModelsBrowser } from "./models-browser";

// No ISR fallback: old HTML must not silently outlive a price/retirement boundary.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "AI Models & Pricing — Grida",
  description:
    "Explore text, image, video, music and 3D models available through Grida AI Gateway. Compare capabilities and current usage pricing.",
  alternates: { canonical: "https://grida.co/ai/models" },
  openGraph: {
    title: "AI Models & Pricing — Grida",
    description:
      "Creative models. One API. Browse models and current usage pricing.",
    url: "https://grida.co/ai/models",
    type: "website",
  },
  twitter: { card: "summary" },
};
export default async function ModelsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [view, params] = await Promise.all([readPublicModels(), searchParams]);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (typeof value === "string") query.set(key, value);
  return (
    <>
      <Header />
      <main className="container mx-auto min-h-[70vh] px-4 pt-36 pb-24 lg:pt-44">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <Link
              href="/ai/gateway"
              className="mb-4 inline-block text-sm text-muted-foreground hover:text-foreground"
            >
              Grida AI Gateway
            </Link>
            <h1 className="text-4xl font-semibold tracking-tight lg:text-5xl">
              Models
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Creative models. One API. Explore capabilities and usage pricing.
            </p>
          </div>
          <a
            href={ConsoleLinks.aiGateway()}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Get API key
          </a>
        </div>
        <ModelsBrowser initial={view} initialFilters={parseFilters(query)} />
      </main>
      <Footer />
    </>
  );
}
