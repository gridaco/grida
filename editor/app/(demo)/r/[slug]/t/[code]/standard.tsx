import React from "react";
import { cn } from "@/utils";
import { InstagramIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export function Section({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section {...props} className={cn("w-full px-4", className)}>
      {children}
    </section>
  );
}

type LogoData = {
  srcLight: string;
  srcDark?: string;
};

export function Logo({
  srcLight,
  srcDark,
  alt = "logo",
  width,
  height,
  className,
}: {
  srcLight: string;
  srcDark?: string;
  alt?: string;
  width: number;
  height: number;
  className?: string;
}) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={srcLight}
        alt={alt}
        width={width}
        height={height}
        className={cn("hidden dark:block", className)}
      />
      {srcDark && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={srcDark}
          alt={alt}
          width={width}
          height={height}
          className={cn("block dark:hidden", className)}
        />
      )}
    </>
  );
}

export function Header({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <header
      {...props}
      className={cn(
        "min-h-16 h-16 flex items-center justify-center",
        className
      )}
    >
      {children}
    </header>
  );
}

export function BrandHostChip({
  logo,
  name,
}: {
  logo: LogoData;
  name: string;
}) {
  return (
    <div className="flex items-center gap-1.5 mt-4">
      <Logo
        srcLight={logo.srcLight}
        srcDark={logo.srcDark}
        alt="brand logo"
        width={40}
        height={40}
        className="size-5 bg-background rounded-full overflow-hidden border"
      />
      <div className="text-sm text-muted-foreground">
        <span>{name}</span>
      </div>
      {/* <CaretRightIcon /> */}
    </div>
  );
}

export function MainImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <div className={cn("w-full flex items-center justify-center", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={800}
        height={800}
        className="max-w-[400px] max-h-[400px] aspect-square rounded-xl object-cover overflow-hidden shadow-2xl"
      />
    </div>
  );
}

export function Title({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <h1 {...props} className={cn("text-2xl font-semibold w-10/12", className)}>
      {children}
    </h1>
  );
}

export function FooterTemplate({
  logo,
  paragraph,
  instagram,
  privacy,
  homepage,
}: {
  logo: LogoData;
  paragraph?: string;
  instagram?: string;
  privacy: string;
  support?: string;
  homepage?: string;
}) {
  return (
    <footer className="grid gap-2 px-4 py-10 border-t mt-10">
      <div className="flex items-center justify-between">
        <div>
          <Logo
            {...logo}
            width={400}
            height={200}
            className="h-4 w-auto object-contain"
          />
        </div>
        <div className="text-muted-foreground">
          {instagram && <InstagramIcon className="size-4" />}
        </div>
      </div>
      <div className="text-sm text-muted-foreground flex gap-2">
        <Link href="/support">고객센터</Link>
        {privacy && <Link href={privacy}>개인정보</Link>}
        {homepage && <Link href={homepage}>{homepage}</Link>}
      </div>
      <hr className="my-4" />
      {paragraph && (
        <p className="text-xs text-muted-foreground/60">
          <span dangerouslySetInnerHTML={{ __html: paragraph }} />
        </p>
      )}
    </footer>
  );
}
