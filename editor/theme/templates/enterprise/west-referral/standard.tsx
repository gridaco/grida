"use client";
import React from "react";
import { cn } from "@/components/lib/utils";
import { InstagramIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";

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
  src: string;
  srcDark?: string;
  width?: number;
  height?: number;
  alt?: string;
};

export function Logo({
  src,
  srcDark,
  alt = "logo",
  width,
  height,
  className,
}: LogoData & {
  className?: string;
}) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={cn("block dark:hidden", className)}
      />
      {srcDark && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={srcDark}
          alt={alt}
          width={width}
          height={height}
          className={cn("hidden dark:block", className)}
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
        "min-h-16 h-16 py-4 flex items-center justify-center",
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
        src={logo.src}
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
  src?: string;
  alt?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-full flex items-center justify-center relative z-10",
        className
      )}
    >
      <figure className="w-full max-w-[400px] max-h-[400px] shadow-xl overflow-hidden z-10 rounded-[var(--radius)] aspect-square">
        {src ? (
          <Image
            src={src}
            alt={alt ?? "main image"}
            width={800}
            height={800}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full relative flex items-center justify-center">
            <Skeleton className="absolute inset-0" />
            <span className="text-muted-foreground text-xs">
              Place your image here
            </span>
          </div>
        )}
      </figure>
      {/* Shadow container with blur effect */}
      {src && (
        <div
          className={`absolute -bottom-4 left-1/2 -translate-x-1/2 w-full h-full
                     blur-xl opacity-25 scale-100 transition-opacity duration-700 -z-10
                     `}
          style={{
            backgroundImage: `url(${src})`,
            backgroundSize: "cover",
            backgroundPosition: "center bottom",
            filter: "blur(24px) brightness(0.8)",
          }}
        />
      )}
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

type LinkData = {
  href: string;
  text: string;
  target?: string;
};

type Links = LinkData[];

export function FooterTemplate({
  logo,
  links = [],
  paragraph,
  instagram,
}: {
  logo?: LogoData;
  links?: Links;
  paragraph?: string;
  instagram?: string;
  support?: string;
}) {
  return (
    <footer className="grid gap-2 px-4 py-10 border-t mt-10">
      <div className="flex items-center justify-between">
        {logo && (
          <div>
            <Logo
              {...logo}
              width={400}
              height={200}
              className="h-4 w-auto object-contain"
            />
          </div>
        )}
        <div className="text-muted-foreground">
          {instagram && <InstagramIcon className="size-4" />}
        </div>
      </div>
      <div className="text-sm text-muted-foreground flex gap-2">
        {links.map((link, index) => (
          <Link
            key={index}
            href={link.href}
            target={link.target}
            className="hover:underline"
          >
            {link.text}
          </Link>
        ))}
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
