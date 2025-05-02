import React from "react";
import { search } from "./actions";
import Categories from "./_components/categories";
import Gallery from "./_components/gallery";

export default async function LibraryHomePage({
  searchParams,
}: {
  searchParams: {
    search?: string;
  };
}) {
  const q_search = searchParams?.search;

  const objects = await search({
    category: q_search ? undefined : "textures",
    text: q_search,
  });

  return (
    <div className="space-y-4">
      {!q_search && (
        <section className="px-6 py-10 pt-16 md:py-20 md:pt-32 flex flex-col items-center justify-center text-left md:text-center max-w-2xl mx-auto">
          <div>
            <h1 className="text-xl md:text-4xl font-bold">
              High-Quality, Hand-Picked Graphics — 100% Free &amp; Open Source
            </h1>
            <p className="mt-4 text-muted-foreground">
              All resources in the Grida Library are free for commercial use.
            </p>
          </div>
        </section>
      )}
      <section className="mt-4">
        <Categories />
      </section>
      <section>
        <Gallery objects={objects.data} />
      </section>
    </div>
  );
}
