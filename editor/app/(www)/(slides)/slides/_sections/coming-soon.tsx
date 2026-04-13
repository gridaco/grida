"use client";

import React from "react";
import { motion } from "motion/react";
import { SectionHeader, SectionHeaderBadge } from "@/www/ui/section";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/lib/utils";
import { TerminalIcon, ServerIcon, UsersIcon, CodeIcon } from "lucide-react";

const items = [
  {
    icon: TerminalIcon,
    title: "CLI Export",
    code: "$ grida export deck.grida --format=pdf",
    description: "Headless PDF, PNG, SVG from the command line.",
    className: "md:col-span-2",
  },
  {
    icon: CodeIcon,
    title: "API-driven generation",
    description:
      "POST data, get a deck. Programmatic slide creation for reports, dashboards, personalized content.",
    className: "md:col-span-1",
  },
  {
    icon: UsersIcon,
    title: "Real-time collaboration",
    description: "Multiplayer editing on the same deck.",
    className: "md:col-span-1",
  },
  {
    icon: ServerIcon,
    title: "Self-host & embed",
    description:
      "Run the slides viewer on your own infra. Embed the renderer in your app.",
    className: "md:col-span-2",
  },
];

export default function ComingSoon() {
  return (
    <section>
      <SectionHeader
        badge={<SectionHeaderBadge>Roadmap</SectionHeaderBadge>}
        title={<>What&apos;s next.</>}
      />
      <div className="mt-16 md:mt-24 grid grid-cols-1 md:grid-cols-3 gap-4">
        {items.map((item, i) => (
          <motion.div
            key={item.title}
            initial={{ opacity: 0, y: 24 }}
            viewport={{ once: true }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: i * 0.08 }}
            className={cn(
              "flex flex-col gap-4 rounded-xl border p-5 md:p-6",
              "bg-background",
              item.className
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <item.icon className="size-3.5 text-muted-foreground/40" />
                <h3 className="text-sm font-semibold">{item.title}</h3>
              </div>
              <Badge
                variant="secondary"
                className="text-[10px] font-medium rounded-full"
              >
                Coming soon
              </Badge>
            </div>
            {item.code && (
              <code className="text-xs font-mono text-muted-foreground/40 bg-muted/40 rounded-md px-3 py-2 block">
                {item.code}
              </code>
            )}
            <p className="text-sm text-muted-foreground leading-relaxed">
              {item.description}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
