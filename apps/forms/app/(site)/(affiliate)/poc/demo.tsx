"use client";

import Image from "next/image";
import React from "react";

export function DemoSubCard({
  artwork,
  alt,
  text1,
  text2,
  className,
}: {
  artwork: string;
  alt: string;
  text1: string;
  text2: string;
  className?: string;
}) {
  return (
    // md:h-[340px] w-full md:col-start-1 md:col-span-2
    <div className={className}>
      <div className="flex flex-col gap-3 p-8">
        <h6 className="text-4xl font-bold">{text1}</h6>
        <span className="max-w-sm text-muted-foreground">{text2}</span>
      </div>
      <Image
        className="absolute inset-0 overflow-hidden object-right-bottom object-cover w-full h-full -z-10"
        src={artwork}
        alt={alt}
        width={500}
        height={500}
      />
    </div>
  );
}
