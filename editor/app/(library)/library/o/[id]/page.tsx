import React from "react";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getObject } from "@/app/(library)/library/actions";
import { Button } from "@/components/ui/button";
import { getBlurDataURLFromColor } from "@/utils/placeholder";
import Similar from "./similar";
import Link from "next/link";

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const object = await getObject(params.id);
  if (!object) return notFound();

  const { author } = object;

  const title: string =
    object.title ||
    object.description ||
    object.alt ||
    object.prompt ||
    object.objects[0] ||
    object.categories[0] ||
    object.category;

  return {
    title: title,
    description: object.description,
    keywords: [object.license, "free", ...object.keywords, ...object.objects],
    category: object.category,
    openGraph: {
      images: [{ url: object.url }],
    },
    authors: author
      ? [
          {
            name: author.name,
            url: author.blog ?? undefined,
          },
        ]
      : undefined,
  };
}

export default async function ObjectPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const object = await getObject(params.id);
  if (!object) return notFound();

  const { author } = object;

  const text =
    object.description || object.alt || object.title || object.prompt;

  const has_colors = object.colors && object.colors.length > 0;

  return (
    <div>
      <section className="container max-w-4xl mx-auto flex flex-col items-center justify-center text-center min-h-screen p-8">
        <Image
          // intentionally not optimized for cost savings
          unoptimized
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
          className="w-full object-cover rounded-xl"
          placeholder={object.color ? "blur" : undefined}
          blurDataURL={
            object.color ? getBlurDataURLFromColor(object.color) : undefined
          }
          style={{
            maxWidth: object.width,
            maxHeight: object.height,
          }}
        />
        {has_colors && (
          <div className="flex gap-2 mt-4">
            {object.color && (
              <div
                className="size-8 rounded-full"
                style={{
                  backgroundColor: object.color,
                }}
              />
            )}
            <Separator orientation="vertical" className="h-8" />
            {object.colors.map((color, i) => (
              <div
                key={i}
                className="size-8 rounded-full"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2 mt-4">
          {object.objects.map((keyword, i) => (
            <Badge variant="outline" key={i}>
              {keyword}
            </Badge>
          ))}
          {object.keywords.map((keyword, i) => (
            <Badge variant="outline" key={i}>
              {keyword}
            </Badge>
          ))}
        </div>
        <h1 className="text-2xl mt-4">{object.title}</h1>
        <p className="text-xs text-muted-foreground">{text}</p>
        {author && (
          <div>
            <Link
              href={author.blog ?? "#"}
              className="text-xs underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              by {author.name}
            </Link>
          </div>
        )}
        <hr />

        {/* license */}
        <div className="flex gap-2 mt-4">
          <span className="text-xs">License: {object.license}</span>
          {object.generator && (
            <span className="text-xs">Generator: {object.generator}</span>
          )}
        </div>

        <footer className="mt-10">
          <Link href={object.download} download>
            <Button>Download</Button>
          </Link>
        </footer>
      </section>
      <section>
        <Similar object_id={object.id} />
      </section>
    </div>
  );
}
