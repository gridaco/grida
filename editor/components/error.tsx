"use client";

import { useEditorState } from "@/scaffolds/editor";
import { sitemap } from "@/www/data/sitemap";
import Link from "next/link";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";

export function ErrorInvalidSchema({
  data,
}: {
  data?: {
    __schema_version?: string;
  };
}) {
  const [state] = useEditorState();

  const { basepath } = state;

  return (
    <div className="flex w-full h-full flex-col items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-md text-center">
        <Badge variant="destructive">Error: outdated schema version</Badge>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          The document version is outdated.
        </h1>
        <p className="mt-4 text-muted-foreground">
          Sorry, Your document version is created with older version of Grida
          and needs to be updated manually.
          <br />
          Please{" "}
          <Link
            className="underline"
            href={sitemap.links.contact}
            target="_blank"
          >
            contact support
          </Link>{" "}
          for more information.
          {data && (
            <Collapsible className="mt-4 text-muted-foreground font-mono">
              <CollapsibleTrigger>Details</CollapsibleTrigger>
              <CollapsibleContent>
                <div className="prose prose-sm">
                  <pre className="text-xs text-left">
                    {JSON.stringify(data, null, 2)}
                  </pre>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </p>
        <div className="mt-6">
          <Link
            href={`/${basepath}`}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            prefetch={false}
          >
            Back to project home
          </Link>
        </div>
      </div>
    </div>
  );
}
