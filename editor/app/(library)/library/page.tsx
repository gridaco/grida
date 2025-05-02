import React from "react";
import { search } from "./actions";
import Categories from "./categories";
import Gallery from "./gallery";

export default async function LibraryHomePage({
  searchParams,
}: {
  searchParams: {
    category?: string;
    search?: string;
  };
}) {
  const q_search = searchParams?.search || "";
  const q_category = searchParams?.category || "";
  const objects =
    q_search || q_category
      ? await search({
          category: q_category,
          text: q_search,
        })
      : await search({
          category: "textures",
        });

  return (
    <div className="space-y-4">
      <section className="px-6 py-10 md:py-20 flex flex-col items-center justify-center text-left md:text-center max-w-2xl mx-auto">
        <div>
          <h1 className="text-xl md:text-4xl font-bold">
            High-Quality, Hand-Picked Graphics — 100% Free &amp; Open Source
          </h1>
          <p className="mt-4 text-muted-foreground">
            All resources in the Grida Library are free for commercial use.
          </p>
        </div>
      </section>
      <section>
        <Categories />
      </section>
      <section>
        <Gallery objects={objects.data} />
      </section>
    </div>
  );
}
