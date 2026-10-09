"use client";

import type { ComponentProps, ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger } from "@app/ui/components/tabs";
import { cn } from "@app/ui/lib/utils";

interface VerticalTab {
  value: string;
  title: string;
  description: ReactNode;
  action?: ReactNode;
}

type VerticalTabsProps = Omit<ComponentProps<typeof Tabs>, "orientation"> & {
  label: string;
  items: VerticalTab[];
};

/** Selection can be controlled by a parent; scrolling and timing stay outside. */
export default function VerticalTabs({
  label,
  items,
  children,
  className,
  ...props
}: VerticalTabsProps) {
  return (
    <Tabs
      orientation="vertical"
      className={cn(
        "grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-12 lg:gap-16",
        className
      )}
      {...props}
    >
      <TabsList
        aria-label={label}
        className="w-full items-stretch justify-start gap-0 rounded-none bg-transparent p-0"
      >
        {items.map((item) => (
          <div
            key={item.value}
            className="group/vertical-tab w-full border-t border-foreground/10 py-5 md:py-6"
          >
            <TabsTrigger
              value={item.value}
              className="h-auto flex-none justify-start rounded-lg border-0 bg-transparent px-0 py-2 text-left text-xl font-medium whitespace-normal transition-colors data-[state=active]:bg-transparent data-[state=active]:text-3xl group-data-[variant=default]/tabs-list:data-[state=active]:shadow-none after:hidden dark:data-[state=active]:bg-transparent"
            >
              {item.title}
            </TabsTrigger>
            <div className="hidden pt-4 group-has-[[data-state=active]]/vertical-tab:block">
              <div className="text-base leading-relaxed text-muted-foreground md:text-lg">
                {item.description}
              </div>
              {item.action && <div className="mt-6">{item.action}</div>}
            </div>
          </div>
        ))}
      </TabsList>
      <div className="min-w-0">{children}</div>
    </Tabs>
  );
}
