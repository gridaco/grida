import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@app/ui/components/button";
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
      <main className="container mx-auto min-h-[70vh] px-4 pt-28 pb-24 lg:pt-32">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-6">
          <div className="max-w-2xl">
            <Link
              href="/ai/gateway"
              className="mb-2 inline-block text-sm text-muted-foreground hover:text-foreground"
            >
              Grida AI Gateway
            </Link>
            <h1 className="text-3xl font-semibold tracking-tight lg:text-4xl">
              Models
            </h1>
            <p className="mt-2 text-base text-muted-foreground">
              Explore models, capabilities, and pricing.
            </p>
          </div>
          <Button asChild>
            <a href={ConsoleLinks.aiGateway()}>Get API key</a>
          </Button>
        </div>
        <ModelsBrowser initial={view} initialFilters={parseFilters(query)} />
      </main>
      <Footer />
    </>
  );
}
