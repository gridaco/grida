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
  oriantation = "center",
}: {
  badge?: React.ReactNode;
  title: React.ReactNode;
  excerpt?: React.ReactNode;
  button?: React.ReactNode;
  oriantation?: "start" | "center" | "end";
}) {
  return (
    <div
      data-orientation={oriantation}
      className="flex flex-col items-center text-center data-[orientation='start']:text-start data-[orientation='start']:items-start data-[orientation='end']:text-end data-[orientation='end']:items-end"
    >
      {badge}
      <div className="flex flex-col">
        <span className="text-4xl md:text-5xl lg:text-6xl font-bold py-10 max-w-3xl">
          {title}
        </span>
        {excerpt && (
          <p
            data-orientation={oriantation}
            className="text-sm md:text-base max-w-xl text-muted-foreground data-[orientation='center']:mx-auto"
          >
            {excerpt}
          </p>
        )}
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
