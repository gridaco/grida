import React from "react";
import Image from "next/image";
import { list, listCategories, search } from "../actions";
import { Input } from "@/components/ui/input";
import { GridaLogo } from "@/components/grida-logo";
import { getBlurDataURLFromColor } from "@/utils/placeholder";
import type { Library } from "@/lib/library";
import Link from "next/link"; //

export default async function LibraryHomePage({
  searchParams,
}: {
  searchParams: {
    category?: string;
    search?: string;
  };
}) {
  const categories = await listCategories();
  const q_search = searchParams?.search || "";
  const q_category = searchParams?.category || "";
  const objects =
    q_search || q_category
      ? await search({
          category: q_category,
          text: q_search,
        })
      : await search({
          category: "shapes",
        });

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/library"
          className="text-2xl font-semibold flex items-center gap-2"
        >
          <GridaLogo />
          <span>Library</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/library/license" className="hover:underline">
            License
          </Link>
          <Link href="/tools" className="hover:underline">
            Tools
          </Link>
          <form method="get">
            <Input
              type="search"
              name="search"
              placeholder="Search resources..."
              defaultValue={q_search}
              className=""
            />
          </form>
        </div>
      </div>

      <section>
        <div className="flex flex-wrap gap-2">
          {/* Category cards placeholder */}
          {categories.map((category) => (
            <Link key={category.id} href={`?category=${category.id}`}>
              <div className="bg-muted rounded-md px-3 py-2 text-sm cursor-pointer hover:bg-muted-foreground/10">
                {category.name}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {/* Resource cards placeholder */}
          {objects.data?.map((object) => (
            <Link
              key={object.id}
              href={`/library/o/${object.id}`}
              className="group transition-all"
            >
              <ImageCard object={object} />
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

function ImageCard({
  object,
}: {
  object: Library.Object & {
    url: string;
    author: Library.Author | null;
  };
}) {
  const text =
    object.description || object.alt || object.title || object.prompt;
  return (
    <div className="group relative">
      <Image
        src={object.url}
        alt={
          object.alt ||
          object.description ||
          object.title ||
          object.prompt ||
          object.category
        }
        width={object.width}
        height={object.height}
        placeholder={object.color ? "blur" : undefined}
        blurDataURL={
          object.color ? getBlurDataURLFromColor(object.color) : undefined
        }
        className="w-full object-cover rounded"
      />
      <div className="py-2 flex flex-col gap-1">
        <div className="max-h-10">
          <p className="text-xs text-muted-foreground line-clamp-2">{text}</p>
        </div>
        {object.author && (
          <Link
            href={object.author.blog ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
          >
            <div className="text-xs underline">@{object.author.name}</div>
          </Link>
        )}
      </div>
    </div>
  );
}
