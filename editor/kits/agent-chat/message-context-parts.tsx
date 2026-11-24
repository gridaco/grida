"use client";

import { useContext } from "react";
import { cn } from "@app/ui/lib/utils";
import { ArrowUpRightIcon, BookOpenIcon, PresentationIcon } from "lucide-react";
import {
  BrowserOpen,
  handleBrowserLinkClick,
} from "@/lib/desktop/browser-open-context";
import {
  IMAGE_REFERENCE_PART,
  readImageReferencePreviews,
} from "@/lib/desktop/images-message-context";
import { SkillMentions } from "@/lib/agent-chat/skill-mentions";
import { SLIDES_TEMPLATE_PART } from "@/lib/desktop/slides-message-context";
import {
  readWorkflowReferencePreviews,
  WORKFLOW_REFERENCE_PART,
} from "@/lib/desktop/workflow-message-context";

type ContextChip =
  | { group: "slides"; title: string }
  | { group: "skills"; title: string; source?: string }
  | { group: "images"; title: string; href: string; thumbnail: string }
  | {
      group: "workflows";
      title: string;
      href: string;
      thumbnail?: string;
      number: number;
    };

const labels = {
  slides: "Slides templates",
  skills: "Selected skills",
  images: "Image references",
  workflows: "Workflow references",
};

function readChips(part: unknown): ContextChip[] {
  if (!part || typeof part !== "object") return [];
  const { kind, version, data } = part as Record<string, unknown>;
  if (
    kind === "skill" &&
    version === 1 &&
    data &&
    typeof data === "object" &&
    "name" in data &&
    typeof data.name === "string" &&
    data.name
  ) {
    const extension =
      "extension" in data && typeof data.extension === "string"
        ? data.extension
        : undefined;
    const name = extension ? `${extension}/${data.name}` : data.name;
    return [
      {
        group: "skills",
        title: name,
        source: SkillMentions.sourceLabel(
          "source" in data ? data.source : undefined,
          extension
        ),
      },
    ];
  }
  if (
    kind === WORKFLOW_REFERENCE_PART.kind &&
    version === WORKFLOW_REFERENCE_PART.version
  ) {
    return readWorkflowReferencePreviews(data).map(
      ({ title, showcaseUrl, posterUrl, number }) => ({
        group: "workflows",
        title,
        href: showcaseUrl,
        thumbnail: posterUrl,
        number,
      })
    );
  }
  if (
    kind === IMAGE_REFERENCE_PART.kind &&
    version === IMAGE_REFERENCE_PART.version
  ) {
    return readImageReferencePreviews(data).map(({ title, url }) => ({
      group: "images",
      title: title.trim() || "Library image",
      href: url,
      thumbnail: url,
    }));
  }
  if (
    kind === SLIDES_TEMPLATE_PART.kind &&
    version === SLIDES_TEMPLATE_PART.version &&
    data &&
    typeof data === "object" &&
    "title" in data &&
    typeof data.title === "string" &&
    data.title.trim()
  )
    return [{ group: "slides", title: data.title }];
  return [];
}

export function MessageContextParts({
  parts,
  className,
}: {
  parts: readonly unknown[];
  className?: string;
}) {
  const openLink = useContext(BrowserOpen);
  const chips = parts.flatMap(readChips);
  const first = chips[0];
  if (!first) return null;
  const label = chips.every(({ group }) => group === first.group)
    ? labels[first.group]
    : "Message context";
  return (
    <ul aria-label={label} className={cn("flex flex-wrap gap-1.5", className)}>
      {chips.map((chip, index) => (
        <li key={index} className="max-w-full min-w-0">
          {chip.group === "slides" || chip.group === "skills" ? (
            <span
              title={chip.group === "skills" ? chip.source : undefined}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-background px-2 py-1 text-xs"
            >
              {chip.group === "slides" ? (
                <PresentationIcon
                  aria-hidden
                  className="size-3.5 shrink-0 text-muted-foreground"
                />
              ) : (
                <BookOpenIcon
                  aria-hidden
                  className="size-3.5 shrink-0 text-muted-foreground"
                />
              )}
              <span className="truncate">{chip.title}</span>
            </span>
          ) : (
            <a
              href={chip.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => handleBrowserLinkClick(event, openLink)}
              aria-label={
                chip.group === "workflows"
                  ? `Open workflow reference ${chip.number}, ${chip.title}`
                  : undefined
              }
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-background p-0.5 pr-1.5 text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {chip.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element -- Render the public reference thumbnail.
                <img
                  src={chip.thumbnail}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  crossOrigin="anonymous"
                  className="size-5 shrink-0 rounded-full object-cover"
                />
              )}
              {chip.group === "workflows" && (
                <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 tabular-nums">
                  {chip.number}
                </span>
              )}
              <span className="truncate">{chip.title}</span>
              <ArrowUpRightIcon
                aria-hidden
                className="size-3 shrink-0 text-muted-foreground"
              />
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
