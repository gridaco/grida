import { Card, CardContent } from "@/components/ui/card";
import React from "react";

type Picture = {
  src: string;
  name: string;
};

export function GalleryModelCard({
  media,
  title,
  paragraph,
  lines,
}: {
  media?: Array<Picture>;
  title: string | React.ReactNode;
  subtitle?: string | React.ReactNode;
  paragraph?: string | React.ReactNode;
  lines?: Array<string | React.ReactNode>;
}) {
  return (
    <Card className="overflow-hidden rounded-sm">
      <div className="aspect-video bg-neutral-100 dark:bg-neutral-900">
        {media ? (
          <>
            {media.map((picture) => (
              <img
                src={picture.src}
                alt={picture.name}
                className="w-full h-full object-cover"
              />
            ))}
          </>
        ) : (
          <></>
        )}
      </div>
      <CardContent className="pt-4">{title}</CardContent>
    </Card>
  );
}
