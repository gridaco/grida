"use client";

import { useEditorState } from "@/scaffolds/editor";
import Link from "next/link";

export default function Invalid() {
  const [state] = useEditorState();

  const { basepath } = state;

  return (
    <div className="flex w-full h-full flex-col items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto h-12 w-12 text-primary" />
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Oops, Not a valid page!
        </h1>
        <p className="mt-4 text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
          If you think this is a mistake,{" "}
          <Link href={"/issues/new"} className="underline" target="_new">
            please file an issue.
          </Link>
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
