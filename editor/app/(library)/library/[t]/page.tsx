import React from "react";
import { search } from "../actions";
import Categories from "../categories";
import Gallery from "../gallery";
import LibraryHeader from "../header";
import LibraryFooter from "../footer";

type Params = {
  t: string;
};

export default async function LibraryCategoryPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { t } = await params;

  const objects = await search({
    category: t,
  });

  return (
    <div>
      <LibraryHeader />
      <section className="px-6 py-10 md:py-20 flex flex-col items-center justify-center text-left md:text-center max-w-2xl mx-auto">
        <div>
          <h1 className="text-xl md:text-4xl font-bold capitalize">{t}</h1>
          <p className="mt-4 text-muted-foreground">
            All resources in the Grida Library are free for commercial use.
          </p>
        </div>
      </section>
      <main className="container max-w-screen-2xl mx-auto space-y-4 px-6 2xl:px-0">
        <section>
          <Categories />
        </section>
        <section>
          <Gallery objects={objects.data} />
        </section>
      </main>
      <LibraryFooter />
    </div>
  );
}
