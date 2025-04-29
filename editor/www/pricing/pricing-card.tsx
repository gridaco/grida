import { Button } from "@/components/ui/button";
import { CheckIcon } from "@radix-ui/react-icons";
import clsx from "clsx";
import React from "react";
import { ShineBorder } from "../ui/shine-border";

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
        relative
        bg-background
        dark:bg-muted/50
        flex-1 flex flex-col p-6 border gap-4 rounded-lg
        md:h-[570px]
        hover:scale-[1.02]
        duration-300
        transition-all
        shadow
        justify-between
        "
    >
      {highlight && (
        <ShineBorder shineColor={["#A07CFE", "#FE8FB5", "#FFBE7B"]} />
      )}
      <div className="flex-[2] flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-2xl font-semibold">{plan}</span>
          <span className=" text-sm font-normal text-muted-foreground">
            {excerpt}
          </span>
        </div>
        <div className="my-2">
          <span className="text-4xl font-bold">{price.primary}</span>
          {price.secondary && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {price.secondary}
            </span>
          )}
        </div>
        <hr />
      </div>
      <div className="flex-[3] flex flex-col gap-3">
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
      <span className="flex-1 text-sm">{name}</span>
      <span className="opacity-50 text-sm">{number}</span>
    </div>
  );
}
