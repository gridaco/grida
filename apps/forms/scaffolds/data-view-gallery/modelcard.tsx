import { Card, CardContent } from "@/components/ui/card";
import React from "react";

export function GalleryModelCard({
  media,
  title,
  paragraph,
  lines,
}: {
  media?: React.ReactNode;
  title?: string | React.ReactNode;
  subtitle?: string | React.ReactNode;
  paragraph?: string | React.ReactNode;
  lines?: Array<string | React.ReactNode>;
}) {
  return (
    <Card className="overflow-hidden rounded-md">
      <CardMediaRoot>
        <>{media ? media : <div />}</>
      </CardMediaRoot>
      <CardContent className="pt-4 px-2 border-t">
        {title}
        <CardPropertyLines>
          {lines?.map((l, i) => {
            return <CardPropertyLine key={i}>{l}</CardPropertyLine>;
          })}
        </CardPropertyLines>
      </CardContent>
    </Card>
  );
}

function CardMediaRoot({ children }: React.PropsWithChildren<{}>) {
  return (
    <div className="w-full aspect-video overflow-hidden bg-neutral-100 dark:bg-neutral-900">
      {children}
    </div>
  );
}

function CardPropertyLines({ children }: React.PropsWithChildren<{}>) {
  return <div className="flex flex-col w-full gap-2">{children}</div>;
}

function CardPropertyLine({ children }: React.PropsWithChildren<{}>) {
  return <div className="flex">{children}</div>;
}
