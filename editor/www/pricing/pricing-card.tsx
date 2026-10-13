// GRIDA-EE: billing — plan card presentation for the public pricing page.

import React from "react";
import { CheckIcon } from "lucide-react";
import { ShineBorder } from "@/www/ui/shine-border";

export function PricingWideCard({
  plan,
  excerpt,
  features = [],
}: {
  plan: string;
  excerpt?: string;
  features?: string[];
}) {
  return (
    <div className="relative mx-auto grid w-full max-w-5xl overflow-hidden rounded-xl border shadow-xl md:grid-cols-2">
      <ShineBorder shineColor={["#A07CFE", "#FE8FB5", "#FFBE7B"]} />
      <div className="flex flex-col justify-center px-10 py-16 md:px-14 md:py-20">
        <div className="flex flex-col gap-4">
          <h2 className="text-6xl font-bold leading-none">{plan}</h2>
          {excerpt && (
            <p className="max-w-xs text-muted-foreground">{excerpt}</p>
          )}
        </div>
      </div>
      <ul className="flex flex-col justify-center gap-4 px-10 py-16 md:py-20 md:pl-0 md:pr-14">
        {features.map((feature) => (
          <li key={feature} className="flex items-center gap-3">
            <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
              <CheckIcon className="size-3" strokeWidth={3} />
            </span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
