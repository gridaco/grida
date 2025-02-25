import { Button } from "@/components/ui/button";
import { CheckIcon } from "@radix-ui/react-icons";
import clsx from "clsx";
import React from "react";

interface PricingCardFeatureItem {
  name: string;
  trail?: string;
}

export function PricingCard({
  plan,
  price,
  excerpt,
  highlight: highlight,
  features = [],
  action,
}: {
  //
  plan: string;
  price: {
    primary: string;
    secondary?: string;
  };
  excerpt: string;
  highlight?: boolean;
  features?: PricingCardFeatureItem[];
  action?: React.ReactNode;
}) {
  return (
    <div
      data-highlight={highlight}
      className="
        bg-background
        flex-1 flex flex-col p-5 border gap-8 rounded-lg
        data-[highlight='true']:border-2
        data-[highlight='true']:border-foreground
        hover:scale-[1.02]
        transition-all
        shadow
        "
    >
      <div className="flex flex-col gap-1">
        <span className="text-2xl font-semibold">{plan}</span>
        <span className=" text-sm font-normal text-muted-foreground">
          {excerpt}
        </span>
      </div>
      <div>
        <span className="text-4xl font-bold">{price.primary}</span>
        {price.secondary && (
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {price.secondary}
          </span>
        )}
      </div>
      <hr />
      <div className="flex flex-col gap-5">
        {features.map((feature, i) => (
          <PricingFeatureRow key={i} {...feature} />
        ))}
      </div>
      {action}
    </div>
  );
}

export function PricingCardButton({
  children,
  inverted,
}: React.PropsWithChildren<{
  inverted?: boolean;
}>) {
  return (
    <Button variant={inverted ? "default" : "outline"} className="w-full">
      {children}
    </Button>
  );
}

export function PricingFeatureRow({
  name,
  trail: number,
}: PricingCardFeatureItem) {
  return (
    <div className="flex items-center w-full gap-2">
      <CheckIcon />
      <span className="flex-1">{name}</span>
      <span className=" opacity-50">{number}</span>
    </div>
  );
}
