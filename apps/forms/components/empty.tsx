import React from "react";

export default function EmptyWelcome({
  art,
  title,
  paragraph,
}: {
  art?: React.ReactNode;
  title: React.ReactNode;
  paragraph: React.ReactNode;
}) {
  return (
    <div className="flex w-full flex-col items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8 border border-dashed rounded m-10">
      <div className="mx-auto max-w-md text-center">
        <div className="flex items-center justify-center">{art}</div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mt-4 text-muted-foreground">{paragraph}</p>
        {/* <div className="mt-6">
          <Link
            href={`/${basepath}`}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            prefetch={false}
          >
            Back to project home
          </Link>
        </div> */}
      </div>
    </div>
  );
}
