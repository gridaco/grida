import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Header from "@/www/header";
import Footer from "@/www/footer";
import { aiModelPages } from "@/www/data/ai-model-pages";
import { modelMetadata } from "./model-metadata";
import { ModelOverview } from "./model-overview";

type ModelPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return aiModelPages.active.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({
  params,
}: ModelPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = aiModelPages.bySlug(slug);
  if (!page) notFound();
  return modelMetadata(page);
}

export default async function AiModelPage({ params }: ModelPageProps) {
  const { slug } = await params;
  const page = aiModelPages.bySlug(slug);
  if (!page) notFound();

  return (
    <>
      <Header />
      <main>
        <ModelOverview page={page} />
      </main>
      <Footer />
    </>
  );
}
