"use client";

import React from "react";
import { SectionHeader, SectionHeaderBadge } from "@/www/ui/section";
import { GridCells } from "./grid";
import {
  GitCompareIcon,
  ShieldCheckIcon,
  EraserIcon,
  EyeIcon,
} from "lucide-react";

const guarantees = [
  {
    icon: GitCompareIcon,
    title: "Round-trips by default",
    description:
      "Open and save with no edits, get byte-for-byte the same file. Comments, whitespace, attribute order, even unknown-namespace attributes survive untouched.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Mutates minimally",
    description:
      "Change one attribute and the diff is one attribute. Rotate a rect and it writes a transform on the rect itself — no wrapping <g>, no collapse to a matrix.",
  },
  {
    icon: EraserIcon,
    title: "Adds no proprietary noise",
    description:
      "No editor namespaces, no invented .st0 classes or SVGID ids, no eight-decimal coordinates rewriting nodes you never touched.",
  },
  {
    icon: EyeIcon,
    title: "Honest about its scope",
    description:
      "CSS cascades, SMIL animation, <switch> branches, foreign metadata — preserved and surfaced, never silently mangled. When it can't edit something cleanly, it refuses rather than corrupt it.",
  },
];

export default function Clean() {
  return (
    <section>
      <div className="px-6 md:px-12 pt-20 md:pt-28 pb-12 md:pb-16">
        <SectionHeader
          badge={<SectionHeaderBadge>Clean</SectionHeaderBadge>}
          title={<>What &ldquo;clean&rdquo; means.</>}
          excerpt="Illustrator wraps your file in its own scaffolding. Inkscape stamps every save with its namespaces. Both render fine — and leave markup the next editor, the next AI pass, or a git diff can't make sense of. A clean editor doesn't."
        />
      </div>
      <GridCells className="grid-cols-1 sm:grid-cols-2">
        {guarantees.map((g) => (
          <div
            key={g.title}
            className="flex flex-col gap-4 bg-background p-6 md:p-10"
          >
            <g.icon className="size-5 text-muted-foreground/50" />
            <h3 className="text-lg md:text-xl font-semibold leading-tight">
              {g.title}
            </h3>
            <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
              {g.description}
            </p>
          </div>
        ))}
      </GridCells>
    </section>
  );
}
