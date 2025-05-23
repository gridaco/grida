import React from "react";
import { type Metadata } from "next";
import { getCategory, search } from "../actions";
import { notFound } from "next/navigation";
import Categories from "../_components/categories";
import Gallery from "../_components/gallery";

type Params = {
  t: string;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { t } = await params;
  const category = await getCategory(t);
  if (!category) return notFound();
  return {
    title: `${category.name}`,
    keywords: [category.name, "free"],
    description:
      category.description ||
      `Browse ${category.name} resources in the Grida Library. All resources are free for commercial use.`,
  };
}

export default async function LibraryCategoryPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { t } = await params;

  const category = await getCategory(t);
  if (!category) return notFound();
  const objects = await search({
    category: t,
  });

  const next = async (range: [number, number]) => {
    "use server";
    const objects = await search({
      category: t,
      range,
    });
    return objects.data;
  };

  return (
    <div className="space-y-4">
      <section className="py-10 pt-16 md:py-20 md:pt-32 flex flex-col md:items-center justify-center text-left md:text-center max-w-2xl md:mx-auto">
        <div>
          <h1 className="text-xl md:text-4xl font-bold capitalize">
            {category.name}
          </h1>
          <p className="mt-2 md:mt-4 text-muted-foreground">
            {category.description ||
              "All resources in the Grida Library are free for commercial use."}
          </p>
        </div>
      </section>
      <section>
        <Categories />
      </section>
      <section>
        <Gallery
          objects={objects.data}
          next={next}
          count={objects.count ?? undefined}
        />
      </section>
    </div>
  );
}
