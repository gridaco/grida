"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/components/lib/utils/index";

const sidebarTabsTriggerVariants = cva(
  "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-[state=active]:text-secondary-foreground hover:bg-secondary/80 data-[state=active]:shadow",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 rounded-md gap-1.5 p-0.5 px-1.5 has-[>svg]:px-2.5 text-xs",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-6 p-1 [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const Tabs = TabsPrimitive.Root;

function SidebarTabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex h-9 w-fit items-center justify-center gap-1 rounded-lg p-[3px]",
        className
      )}
      {...props}
    />
  );
}

function SidebarTabsTrigger({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger> &
  VariantProps<typeof sidebarTabsTriggerVariants>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(sidebarTabsTriggerVariants({ variant, size, className }))}
      {...props}
    />
  );
}

function SidebarTabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, SidebarTabsList, SidebarTabsTrigger, SidebarTabsContent };
