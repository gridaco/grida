"use client";

import React, { useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import type {
  GridaBlock,
  GridaGridImageBlock,
  GridaGridVideoBlock,
  GridaGridButtonBlock,
  GridaGridTypographyBlock,
  GridaFormsStartButtonBlock,
  GridaFormsTimerBlock,
  GridaFormsGalleryBlock,
} from "./types";
import { Button } from "@/components/ui/button";
import clsx from "clsx";

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
    case "https://forms.grida.co/blocks/start-button.schema.json": {
      return <GridaFormsStartButtonBlock {...block} />;
    }
    case "https://forms.grida.co/blocks/timer.schema.json": {
      return <GridaFormsTimerBlock {...block} />;
    }
    case "https://forms.grida.co/blocks/gallery.schema.json": {
      return <GridaFormsGalleryBlock {...block} />;
    }
    default: {
      return <pre>{JSON.stringify(block, null, 2)}</pre>;
    }
  }
}

function GridaGridImageImageBlock({ src, style }: GridaGridImageBlock) {
  return (
    <picture className="w-full h-full not-prose">
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <img
        className="object-cover w-full h-full"
        src={src}
        style={{
          ...style,
        }}
      />
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
    <div
      className={clsx(
        "w-full h-full"
        // "px-4"
      )}
    >
      {React.createElement(element, {}, data)}
    </div>
  );
}

function GridaGridButtonBlock({ label }: GridaGridButtonBlock) {
  return (
    <div
      className={clsx(
        "flex w-full h-full items-center justify-center "
        // "px-4"
      )}
    >
      <Button className="w-full">{label}</Button>
    </div>
  );
}

function GridaFormsStartButtonBlock({ status }: GridaFormsStartButtonBlock) {
  const label = status.ok.label;
  return (
    <div
      className={clsx(
        "flex w-full h-full items-center justify-center "
        // "px-4"
      )}
    >
      <Button className="w-full">{label}</Button>
    </div>
  );
}

function GridaFormsTimerBlock({}: GridaFormsTimerBlock) {
  const mock = useMemo(
    () => new Date().getTime() + 1000 * 60 * 60 * 24 * 10,
    []
  );

  const [days, setDays] = React.useState(0);
  const [hours, setHours] = React.useState(0);
  const [minutes, setMinutes] = React.useState(0);
  const [seconds, setSeconds] = React.useState(0);

  useEffect(() => {
    const fn = () => {
      const now = new Date().getTime();
      const distance = mock - now;

      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor(
        (distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
      );
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      setDays(days);
      setHours(hours);
      setMinutes(minutes);
      setSeconds(seconds);
    };
    const interval = setInterval(fn, 1000);

    return () => clearInterval(interval);
  }, [mock]);

  return (
    <div
      className={clsx(
        "flex w-full h-full items-center justify-center"
        // "px-4"
      )}
    >
      <div className="w-full flex flex-col justify-center gap-4">
        <div className="border-t border-black" />
        <span className="text-center text-xl font-semibold">
          {days}d : {hours}h : {minutes}m : {seconds}s
        </span>
        <div className="border-t border-black" />
      </div>
    </div>
  );
}

function GridaFormsGalleryBlock({ pictures }: GridaFormsGalleryBlock) {
  return (
    <div className={clsx("flex w-full h-full items-center justify-center")}>
      {pictures.map(({ src }, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} className="w-full h-full object-cover" src={src} alt="" />
      ))}
    </div>
  );
}
