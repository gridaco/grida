import React from "react";
import Image from "next/image";
import { list, search } from "../actions";

export default async function LibraryHomePage({
  searchParams,
}: {
  searchParams: { search?: string };
}) {
  const q_search = searchParams?.search || "";
  const objects = q_search ? await search(q_search) : await list();

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Library</h1>
        <form method="get">
          <input
            type="search"
            name="search"
            placeholder="Search resources..."
            defaultValue={q_search}
            className="input input-sm w-64"
          />
        </form>
      </div>

      <section>
        <h2 className="text-lg font-medium mb-2">Categories</h2>
        <div className="flex flex-wrap gap-2">
          {/* Category cards placeholder */}
          {["nature", "photos", "textures"].map((category) => (
            <div
              key={category}
              className="bg-muted rounded-md px-3 py-2 text-sm cursor-pointer hover:bg-muted-foreground/10"
            >
              {category}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">Resources</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {/* Resource cards placeholder */}
          {objects.data?.map((object) => (
            <div key={object.id} className="group transition-all">
              <Image
                src={object.url}
                alt={object.description}
                width={object.width}
                height={object.height}
                className="w-full object-cover rounded"
              />
              <div className="py-2">
                <div className="text-xs text-muted-foreground">
                  {object.description}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
