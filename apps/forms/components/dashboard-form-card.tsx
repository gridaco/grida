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
    <div className="rounded border border-neutral-500/10 shadow-md">
      <Image width={240} height={300} src={thumbnail} alt="thumbnail" />
      <div className="px-4 py-2">
        <span>{title}</span>
      </div>
    </div>
  );
}
