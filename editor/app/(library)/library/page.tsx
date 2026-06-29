import React from "react";
import { search } from "./actions";
import Categories from "./_components/categories";
import Gallery from "./_components/gallery";

export default async function LibraryHomePage(props: {
  searchParams: Promise<{
    search?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const q_search = searchParams?.search;
  // "textures" is the default browse showcase for the library home. A search
  // query, however, is global — scoping it to the browse category would hide
  // almost everything (the API route /library/search already searches
  // globally). So only apply the category when NOT searching.
  const category = "textures";
  // Trim-aware: search() treats a whitespace-only query as browse mode, so a
  // blank query must keep the default category (not fall through to unscoped).
  const has_search_query = !!q_search?.trim();
  const search_category = has_search_query ? undefined : category;
  const objects = await search({
    category: search_category,
    text: q_search,
  });

  const next = async (range: [number, number]) => {
    "use server";
    const objects = await search({
      category: search_category,
      text: q_search,
      range,
    });
    return objects.data;
  };

  return (
    <div className="space-y-4">
      {!q_search && (
        <section className="py-10 pt-16 md:py-20 md:pt-32 flex flex-col md:items-center justify-center text-left md:text-center max-w-2xl md:mx-auto">
          <div>
            <h1 className="text-xl md:text-4xl font-bold">
              High-Quality, Hand-Picked Graphics — 100% Free &amp; Open Source
            </h1>
            <p className="mt-2 md:mt-4 text-muted-foreground">
              All resources in the Grida Library are free for commercial use.
            </p>
          </div>
        </section>
      )}
      <section className="mt-4">
        <Categories />
      </section>
      <section>
        <Gallery
          objects={objects.data}
          count={objects.count ?? undefined}
          next={next}
        />
      </section>
    </div>
  );
}
