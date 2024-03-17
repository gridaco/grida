import Image from "next/image";
import React from "react";

export function DashboardFormCard({
  title,
  thumbnail,
}: {
  title: string;
  thumbnail: string;
}) {
  return (
    <div className="rounded border border-neutral-500/10 dark:bg-neutral-900 shadow-md">
      <Image
        className="object-cover w-full h-full"
        width={240}
        height={300}
        src={thumbnail}
        alt="thumbnail"
      />
      <div className="px-4 py-2">
        <span>{title}</span>
      </div>
    </div>
  );
}
