"use client";

import React from "react";
import Marquee from "react-fast-marquee";

export function TickerTape({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Marquee>) {
  return (
    <Marquee className={className} {...props}>
      {children}
    </Marquee>
  );
}
