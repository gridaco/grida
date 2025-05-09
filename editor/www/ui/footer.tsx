//
// https://github.com/launch-ui/launch-ui/blob/main/components/ui/footer.tsx
//

import { cn } from "@/components/lib/utils";
import * as React from "react";

const Footer = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("bg-background pb-4 pt-12 text-foreground", className)}
    {...props}
  />
));
Footer.displayName = "Footer";

const FooterContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "grid grid-cols-2 gap-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5",
      className
    )}
    {...props}
  />
));
FooterContent.displayName = "FooterContent";

const FooterColumn = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col gap-3 md:gap-4", className)}
    {...props}
  />
));
FooterColumn.displayName = "FooterColumn";

const FooterBottom = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "mt-8 flex flex-col items-center justify-between gap-4 border-t pt-4 text-xs text-muted-foreground sm:flex-row",
      className
    )}
    {...props}
  />
));
FooterBottom.displayName = "FooterBottom";

export { Footer, FooterColumn, FooterBottom, FooterContent };
