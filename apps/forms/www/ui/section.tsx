import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils";
import React from "react";

export function Section({
  children,
  className,
  container,
  ...props
}: React.HtmlHTMLAttributes<HTMLDivElement> & {
  container?: boolean;
}) {
  return (
    <div
      {...props}
      className={cn(container ? "container mx-auto" : "", className)}
    >
      {children}
    </div>
  );
}

export function SectionHeader({
  badge,
  title,
  excerpt,
  button,
}: {
  badge: React.ReactNode;
  title: React.ReactNode;
  excerpt: React.ReactNode;
  button?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col container md:max-w-6xl max-w-lg items-center justify-center">
      {badge}
      {/* <Badge
        variant="secondary"
        className="text-base md:text-lg font-medium rounded-full"
      >
      </Badge> */}
      <div className="flex flex-col">
        <span className="text-4xl md:text-5xl lg:text-6xl font-bold py-10 text-center max-w-3xl">
          {title}
        </span>
        <p className=" text-sm md:text-base max-w-xl mx-auto text-muted-foreground text-center">
          {excerpt}
        </p>
      </div>
      {button}
    </div>
  );
}

export function SectionHeaderBadge({ children }: React.PropsWithChildren<{}>) {
  return (
    <Badge
      variant="secondary"
      className="text-base md:text-lg font-medium rounded-full"
    >
      {children}
    </Badge>
  );
}
