"use client";

import React from "react";
import { motion } from "motion/react";
import Link from "next/link";
import { SectionHeader, SectionHeaderBadge } from "@/www/ui/section";
import { Button } from "@app/ui/components/button";
import { sitemap } from "@/www/data/sitemap";
import { ArrowUpRight, TerminalIcon } from "lucide-react";

const capabilities = [
  {
    title: "Headless & backend-agnostic",
    description:
      "The core never touches window, document, or the DOM. It parses SVG, owns the IR, takes commands, and emits state — bring any rendering surface.",
  },
  {
    title: "A legible source of state",
    description:
      "Subscribe to designed views — selection, properties, paint, tree, dirty — never raw pointer events. Bring your own toolbar, panels, and inspector.",
  },
  {
    title: "A closed, typed command set",
    description:
      "select, set_paint, resize, rotate, group, tidy. Every command picks the cleanest in-place edit and keeps the round-trip guarantee intact.",
  },
];

export default function Sdk({ codeHtml }: { codeHtml: string }) {
  return (
    <section>
      <SectionHeader
        badge={<SectionHeaderBadge>SDK</SectionHeaderBadge>}
        title={<>Not just an app. An SDK.</>}
        excerpt="The same editor, headless. A backend-agnostic SDK you can embed in your own product — or hand straight to an agent."
      />

      <div className="mt-14 md:mt-20 grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 items-center">
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          viewport={{ once: true, margin: "-80px" }}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="rounded-xl border bg-muted/20 overflow-hidden"
        >
          <div className="flex items-center gap-2 border-b px-4 py-2.5 text-xs font-mono text-muted-foreground/60">
            <TerminalIcon className="size-3.5" />
            <span>npm install @grida/svg-editor</span>
          </div>
          <div
            className="p-4 md:p-6 overflow-x-auto text-[11px] md:text-xs leading-relaxed [&_code]:font-mono"
            dangerouslySetInnerHTML={{ __html: codeHtml }}
          />
        </motion.div>

        <div className="flex flex-col gap-6 md:gap-8">
          {capabilities.map((c, i) => (
            <motion.div
              key={c.title}
              initial={{ opacity: 0, y: 20 }}
              viewport={{ once: true }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut", delay: i * 0.08 }}
              className="flex flex-col gap-1.5"
            >
              <h3 className="text-base md:text-lg font-semibold leading-snug">
                {c.title}
              </h3>
              <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                {c.description}
              </p>
            </motion.div>
          ))}

          <div className="flex flex-wrap gap-3 mt-2">
            <Link
              href={sitemap.links.npm_svg_editor}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button className="gap-2">
                View on npm
                <ArrowUpRight className="size-4" />
              </Button>
            </Link>
            <Link href={sitemap.links.svg_editor_docs}>
              <Button variant="outline">Docs</Button>
            </Link>
            <Link
              href={sitemap.links.github_grida}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline">GitHub</Button>
            </Link>
          </div>
        </div>
      </div>

      <p className="mt-10 md:mt-14 text-center text-xs text-muted-foreground/60">
        Experimental · v0.x — the API is still moving. Not stable for production
        yet.
      </p>
    </section>
  );
}
