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
      bg-neutral-50 dark:bg-neutral-900
        flex-1 flex flex-col p-7 border border-neutral-500/10 dark:border-neutral-500/50 gap-8 rounded-lg
        data-[highlight='true']:bg-neutral-100 data-[highlight='true']:dark:bg-neutral-100 data-[highlight='true']:dark:text-black
        hover:scale-[1.02]
        transition-all
        "
    >
      <div className="flex flex-col gap-1">
        <span className="text-3xl font-semibold">{plan}</span>
        <span className=" text-sm font-normal opacity-50">{excerpt}</span>
      </div>
      <div>
        <span className="text-[48px] font-medium">{price.primary}</span>
        {price.secondary && (
          <span className="ml-2 text-sm font-normal opacity-50">
            {price.secondary}
          </span>
        )}
      </div>
      <hr className=" opacity-15" />
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
    <button
      className={clsx(
        `
          text-lg font-medium px-5 py-3 rounded text-black dark:text-white bg-neutral-200 dark:bg-neutral-800
          hover:invert
          transition-all
        `,
        inverted && "invert"
      )}
    >
      {children}
    </button>
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
