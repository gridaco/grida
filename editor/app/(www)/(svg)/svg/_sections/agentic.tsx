"use client";

import React from "react";
import { motion } from "motion/react";
import { SectionHeader, SectionHeaderBadge } from "@/www/ui/section";
import { GridCells } from "./grid";

const points = [
  {
    title: "Plain text, not a binary",
    description:
      "A model writes an SVG the way it writes code — straight to text. No proprietary file to decode, no Figma- or Sketch-specific bridge to stand up and keep alive.",
  },
  {
    title: "The format models already speak",
    description:
      "HTML, CSS, and SVG are what LLMs read and write fluently. Put your design system on the one vector format that's already their native tongue.",
  },
  {
    title: "Round-trip, or the loop breaks",
    description:
      "Generation is the easy part; staying in sync is the hard part. People and agents take turns on one file — and that holds only when every save is a clean, readable diff.",
  },
];

export default function Agentic({ diffHtml }: { diffHtml: string }) {
  return (
    <section>
      <div className="px-6 md:px-12 pt-20 md:pt-28">
        <SectionHeader
          badge={<SectionHeaderBadge>Agentic</SectionHeaderBadge>}
          title={
            <>
              LLMs are
              <br />
              great at SVG.
            </>
          }
          excerpt="Agentic design runs on plain text. No binary to reverse-engineer, no platform-specific MCP to wire up and babysit — just markup a model already knows how to write. SVG is the only vector format that fits."
        />

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          viewport={{ once: true, margin: "-80px" }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="mt-16 md:mt-24 mb-16 md:mb-24 max-w-3xl mx-auto"
        >
          <CoEditVisual diffHtml={diffHtml} />
        </motion.div>
      </div>

      <GridCells className="grid-cols-1 md:grid-cols-3">
        {points.map((p, i) => (
          <div
            key={p.title}
            className="flex flex-col gap-3 bg-background p-6 md:p-8"
          >
            <span className="text-xs font-mono text-muted-foreground/40">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="text-sm md:text-base font-semibold leading-snug">
              {p.title}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {p.description}
            </p>
          </div>
        ))}
      </GridCells>
    </section>
  );
}

/**
 * A logo.svg passing between an AI agent and a human, rendered as a real Shiki
 * diff — only the two intended `fill` lines change, the rest survives verbatim.
 */
function CoEditVisual({ diffHtml }: { diffHtml: string }) {
  return (
    <div className="rounded-xl border bg-muted/20 overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-2.5 text-xs font-mono text-muted-foreground/60">
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-foreground/20" />
          ai agent
        </span>
        <span className="text-muted-foreground/30">round-trips →</span>
        <span className="flex items-center gap-1.5">
          human
          <span className="size-1.5 rounded-full bg-foreground/20" />
        </span>
      </div>
      <div
        className="p-4 md:p-6 overflow-x-auto text-[11px] md:text-xs leading-relaxed [&_code]:font-mono"
        dangerouslySetInnerHTML={{ __html: diffHtml }}
      />
      <div className="border-t px-4 py-2.5 font-mono text-[10px] md:text-xs text-muted-foreground/40">
        1 file changed · 1 attribute · 0 noise
      </div>
    </div>
  );
}
