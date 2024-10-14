import { cn } from "@/utils";
import Image from "next/image";
import React from "react";

export function HeaderLogo({
  src,
  alt,
  width,
  height,
  className,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-full h-full flex items-center justify-center",
        className
      )}
    >
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        className="w-full h-full object-contain"
      />
    </div>
  );
}

export function Header({ children }: React.PropsWithChildren<{}>) {
  return (
    <header className="absolute top-0 left-0 right-0 w-full h-20 flex items-center justify-center">
      {children}
    </header>
  );
}
