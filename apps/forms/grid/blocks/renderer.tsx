"use client";

import React from "react";
import dynamic from "next/dynamic";
import type {
  GridaBlock,
  GridaGridImageBlock,
  GridaGridVideoBlock,
  GridaGridButtonBlock,
  GridaGridTypographyBlock,
} from "./types";
import { Button } from "@/components/ui/button";

const ReactPlayer = dynamic(() => import("react-player/lazy"), { ssr: false });

export function GridaBlockRenderer(block: GridaBlock) {
  const { type } = block;
  switch (type) {
    case "image":
      return <GridaGridImageImageBlock {...block} />;
    case "typography":
      return <GridaGridTypographyBlock {...block} />;
    case "button":
      return <GridaGridButtonBlock {...block} />;
    case "video":
      return <GridaGridVideoBlock {...block} />;
  }
}

function GridaGridImageImageBlock({ src }: GridaGridImageBlock) {
  return (
    <picture className="w-full h-full not-prose">
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <img className="object-cover w-full h-full" src={src} />
    </picture>
  );
}

function GridaGridVideoBlock({ src }: GridaGridVideoBlock) {
  return (
    <div className="w-full h-full">
      <ReactPlayer
        className="pointer-events-none"
        url={src}
        playing={true}
        controls={true}
        width="100%"
        height="100%"
      />
    </div>
  );
}

function GridaGridTypographyBlock({ element, data }: GridaGridTypographyBlock) {
  return (
    <div className="w-full h-full px-4">
      {React.createElement(element, {}, data)}
    </div>
  );
}

function GridaGridButtonBlock({ label }: GridaGridButtonBlock) {
  return (
    <div className="flex w-full h-full items-center justify-center">
      <Button>{label}</Button>
    </div>
  );
}
