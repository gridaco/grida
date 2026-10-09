import Image from "next/image";
import { FolderIcon } from "lucide-react";
import { GridaLogo } from "@grida/react-icons/logos";
import PossibilitiesRow from "./possibilities-row";

export default function OwnershipSection() {
  return (
    <section
      id="ownership"
      aria-labelledby="ownership-heading"
      className="bg-[#fafafa] px-6 py-28 text-[#181818] md:px-10"
    >
      <div className="mx-auto max-w-[1200px]">
        <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_1fr] lg:gap-12">
          <div>
            <p className="mb-7 text-[10px] font-medium tracking-[0.16em] text-neutral-500 uppercase">
              On your terms
            </p>
            <h2
              id="ownership-heading"
              className="text-[clamp(3rem,5.2vw,4rem)] leading-[1.04] font-medium tracking-[-0.055em]"
            >
              Your work.
              <br />
              Your workspace.
            </h2>
            <p className="mt-8 max-w-[390px] text-xl leading-relaxed tracking-[-0.015em] text-neutral-500">
              Real files, in your own folders. Keep your projects on your
              computer, and keep using the tools you love.
            </p>
          </div>

          <div
            role="img"
            aria-label="A project folder containing a Grida design and exported artwork, saved on your computer"
            className="group relative mx-auto aspect-[1.2] w-full max-w-[580px] select-none [&_img]:[-webkit-user-drag:none]"
          >
            <div
              aria-hidden="true"
              className="absolute inset-x-[16%] bottom-[7%] h-[7%] rounded-[50%] bg-black/8 blur-xl"
            />
            <svg
              aria-hidden="true"
              viewBox="0 0 440 270"
              className="absolute top-[32%] left-[11%] w-[78%] overflow-visible"
            >
              <path
                d="M0 25C0 11.2 11.2 0 25 0h105c9 0 14 3 20 10l14 17h251c13.8 0 25 11.2 25 25v193c0 13.8-11.2 25-25 25H25C11.2 270 0 258.8 0 245V25Z"
                fill="#d9d9d9"
              />
            </svg>

            <div
              aria-hidden="true"
              className="absolute top-[19%] left-[18%] flex aspect-[0.76] w-[34%] -rotate-12 flex-col overflow-hidden rounded-lg bg-white p-3 shadow-[0_4px_24px_rgba(0,0,0,0.08)] transition-transform duration-700 ease-out motion-safe:group-hover:-translate-y-3 motion-safe:group-hover:-rotate-[15deg] motion-reduce:transition-none"
            >
              <div className="flex items-center justify-between pb-3 text-[8px] text-neutral-400 sm:text-[10px]">
                <span>Studio studies</span>
                <GridaLogo className="size-3 text-neutral-400" />
              </div>
              <div className="relative flex-1 overflow-hidden rounded-sm bg-[#e6dde9]">
                <Image
                  src="/www/2026-10/canvas-art.webp"
                  alt=""
                  fill
                  sizes="200px"
                  draggable={false}
                  className="object-cover"
                />
              </div>
              <span className="py-3 text-[9px] text-neutral-500 sm:text-[11px]">
                exploration.grida
              </span>
            </div>
            <div
              aria-hidden="true"
              className="absolute top-[13%] left-[44%] flex aspect-[0.77] w-[34%] rotate-[9deg] flex-col overflow-hidden rounded-lg bg-white p-2.5 shadow-[0_4px_28px_rgba(0,0,0,0.1)] transition-transform duration-700 ease-out motion-safe:group-hover:-translate-y-5 motion-safe:group-hover:rotate-[13deg] motion-reduce:transition-none"
            >
              <div className="relative flex-1 overflow-hidden rounded-sm bg-[#edd6c4]">
                <Image
                  src="/www/grida-model-image-still-life-placeholder.webp"
                  alt=""
                  fill
                  sizes="200px"
                  draggable={false}
                  className="object-cover"
                />
              </div>
              <span className="px-1 py-3 text-[9px] text-neutral-500 sm:text-[11px]">
                still-life.png
              </span>
            </div>

            <svg
              aria-hidden="true"
              viewBox="0 0 440 230"
              className="absolute top-[46%] left-[11%] w-[78%] overflow-visible drop-shadow-[0_6px_12px_rgba(0,0,0,0.04)]"
            >
              <defs>
                <linearGradient id="ownership-folder" x2="0%" y2="100%">
                  <stop stopColor="#efefef" />
                  <stop offset="1" stopColor="#e6e6e6" />
                </linearGradient>
              </defs>
              <path
                d="M18 0h404c11 0 19.4 9.6 17.8 20.5L417 209c-1.4 12-11.5 21-23.6 21H46.6c-12.1 0-22.2-9-23.6-21L.2 20.5C-1.4 9.6 7 0 18 0Z"
                fill="url(#ownership-folder)"
              />
            </svg>
            <div
              aria-hidden="true"
              className="absolute top-[63%] left-[20%] text-[#808080]"
            >
              <p className="text-[clamp(0.8rem,1.5vw,1rem)] font-medium tracking-tight">
                Studio studies
              </p>
              <p className="mt-1 text-[10px] opacity-70 sm:text-xs">
                A little room to explore.
              </p>
            </div>
            <p
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 text-xs text-neutral-400"
            >
              <FolderIcon className="size-3.5" strokeWidth={1.5} />
              Projects / Studio studies
            </p>
          </div>
        </div>
      </div>
      <PossibilitiesRow />
    </section>
  );
}
