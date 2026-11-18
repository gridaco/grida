"use client";

import { useEffect, useRef } from "react";
import { ArrowUpRightIcon, XIcon } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@app/ui/components/hover-card";
import { cn } from "@app/ui/lib/utils";
import {
  workflowShowcaseUrl,
  workflowShowcases,
  type WorkflowShowcase,
} from "./workflow-showcases";

type WorkflowReferencePick = Readonly<{
  number: number;
  showcase: WorkflowShowcase;
}>;

type WorkflowReferenceControls = {
  picks: readonly WorkflowReferencePick[];
  disabled: boolean;
  onToggle: (showcase: WorkflowShowcase) => void;
};

function WorkflowVideo({ src, poster }: { src: string; poster: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;

    const showPoster = () => {
      video.pause();
      if (video.hasAttribute("src")) {
        video.removeAttribute("src");
        video.load();
      }
    };
    const syncPlayback = () => {
      if (preference.matches) {
        showPoster();
        return;
      }
      if (!visible) {
        video.pause();
        return;
      }
      if (!video.hasAttribute("src")) video.src = src;
      // A browser that declines autoplay can still show the poster.
      void video.play().catch(() => {});
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      syncPlayback();
    });
    observer.observe(video);
    preference.addEventListener("change", syncPlayback);
    return () => {
      observer.disconnect();
      preference.removeEventListener("change", syncPlayback);
      showPoster();
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      poster={poster}
      crossOrigin="anonymous"
      muted
      loop
      playsInline
      preload="none"
      aria-hidden="true"
      className="size-full object-cover"
    />
  );
}

function WorkflowPreview({
  image,
  description,
  motion,
}: WorkflowShowcase["preview"]) {
  if (motion?.kind === "video") {
    return <WorkflowVideo src={motion.src} poster={image} />;
  }

  return (
    <picture className="block size-full">
      {motion && (
        <source media="(prefers-reduced-motion: reduce)" srcSet={image} />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- Preserve the published CDN cover, including animation. */}
      <img
        src={motion?.src ?? image}
        alt={description}
        crossOrigin="anonymous"
        loading="lazy"
        decoding="async"
        className="size-full object-cover"
      />
    </picture>
  );
}

function WorkflowSummary({
  input,
  output,
}: Pick<WorkflowShowcase, "input" | "output">) {
  return (
    <p className="mt-0.5 text-xs text-muted-foreground">
      {input} <span aria-hidden="true">→</span>
      <span className="sr-only">to</span> {output}
    </p>
  );
}

export function WorkflowGallery({
  picks,
  disabled,
  onToggle,
}: WorkflowReferenceControls) {
  return (
    <section aria-labelledby="workflow-gallery-heading">
      <h2
        id="workflow-gallery-heading"
        className="mb-3 text-sm font-medium text-muted-foreground"
      >
        Workflows
      </h2>
      <ul className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 md:grid-cols-3">
        {workflowShowcases.map((showcase) => {
          const { slug, title, input, output, preview } = showcase;
          const number = picks.find(
            (pick) => pick.showcase.slug === slug
          )?.number;
          const picked = number !== undefined;
          return (
            <li key={slug} className="group relative min-w-0">
              <div
                className={cn(
                  "aspect-[8/5] overflow-hidden rounded-xl bg-muted",
                  picked && "ring-2 ring-primary/40"
                )}
              >
                <WorkflowPreview {...preview} />
              </div>
              <h3 className="mt-2.5 text-sm font-medium">{title}</h3>
              <WorkflowSummary input={input} output={output} />
              <button
                type="button"
                disabled={disabled}
                onClick={() => onToggle(showcase)}
                aria-label={`Use ${title} as a reference`}
                aria-pressed={picked}
                className="absolute inset-0 cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:cursor-default"
              />
              {picked && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-2 left-2 grid h-7 min-w-7 place-items-center rounded-full bg-foreground px-1.5 text-xs font-semibold text-background tabular-nums shadow-sm"
                >
                  {number}
                </span>
              )}
              <a
                href={workflowShowcaseUrl(slug)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open ${title} showcase`}
                title="Open showcase"
                className="absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-background/90 text-foreground opacity-0 shadow-sm transition hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
              >
                <ArrowUpRightIcon aria-hidden className="size-3.5" />
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function WorkflowReferenceTray({
  picks,
  disabled,
  onToggle,
}: WorkflowReferenceControls) {
  return (
    <ul
      aria-label="Workflow references"
      className="flex flex-wrap-reverse gap-2 p-0.5"
    >
      {picks.map(({ number, showcase }) => (
        <li
          key={showcase.slug}
          className="flex h-8 min-w-0 max-w-full shrink-0 items-center gap-1.5 rounded-full border bg-background px-1 shadow-sm"
        >
          <HoverCard openDelay={120} closeDelay={80}>
            <HoverCardTrigger asChild>
              <span className="flex min-w-0 items-center gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element -- Use the published still cover. */}
                <img
                  src={showcase.preview.image}
                  alt=""
                  crossOrigin="anonymous"
                  draggable={false}
                  className="size-6 shrink-0 rounded-full bg-muted object-cover"
                />
                <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums">
                  {number}
                </span>
                <span className="truncate text-xs">{showcase.title}</span>
              </span>
            </HoverCardTrigger>
            <HoverCardContent
              side="top"
              align="start"
              sideOffset={8}
              className="w-64 overflow-hidden p-0"
            >
              <div className="aspect-[8/5] bg-muted">
                <WorkflowPreview {...showcase.preview} />
              </div>
              <div className="p-2.5">
                <a
                  href={workflowShowcaseUrl(showcase.slug)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 rounded-sm text-xs font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {showcase.title}
                  <ArrowUpRightIcon
                    aria-hidden
                    className="size-3.5 shrink-0 text-muted-foreground"
                  />
                </a>
                <WorkflowSummary
                  input={showcase.input}
                  output={showcase.output}
                />
              </div>
            </HoverCardContent>
          </HoverCard>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onToggle(showcase)}
            aria-label={`Remove reference ${number}, ${showcase.title}`}
            className="grid size-5 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-50"
          >
            <XIcon aria-hidden className="size-3" />
          </button>
        </li>
      ))}
    </ul>
  );
}
