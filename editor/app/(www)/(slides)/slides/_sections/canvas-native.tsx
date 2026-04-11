"use client";

import React from "react";
import { motion } from "motion/react";
import { SectionHeader, SectionHeaderBadge } from "@/www/ui/section";
import { cn } from "@/components/lib/utils";

const features = [
  {
    title: "Every slide lives on the same canvas",
    description:
      "Zoom out to see your entire deck. Drag objects across slides. Marquee-select across boundaries. One infinite surface.",
    visual: <ZoomOutVisual />,
  },
  {
    title: "Powered by Rust + WebAssembly",
    description:
      "Vector-first rendering. GPU-accelerated compositing. Sub-frame latency. The same engine behind Grida Canvas.",
    visual: <EngineVisual />,
  },
  {
    title: "Open .grida format",
    description:
      "Your deck is a file you own. Inspect it, diff it, commit it. No proprietary binary, no cloud lock-in.",
    visual: <FormatVisual />,
  },
];

export default function CanvasNative() {
  return (
    <section>
      <SectionHeader
        badge={<SectionHeaderBadge>Canvas</SectionHeaderBadge>}
        title={
          <>
            Your ideas deserve
            <br />a bigger stage.
          </>
        }
        excerpt="Every slide is a frame on a shared vector canvas. Design presentations the same way you design everything else."
      />
      <div className="mt-20 md:mt-32 flex flex-col gap-24 md:gap-40">
        {features.map((feature, i) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 60 }}
            viewport={{ once: true, margin: "-100px" }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className={cn(
              "flex flex-col gap-8 md:gap-16 items-center",
              i % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"
            )}
          >
            <div className="flex-1 flex flex-col gap-4 md:max-w-md">
              <h3 className="text-2xl md:text-3xl font-semibold leading-tight">
                {feature.title}
              </h3>
              <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
            <div className="flex-1 w-full">{feature.visual}</div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/**
 * 2x2 grid of monochrome slide frames on a dot-grid canvas.
 */
function ZoomOutVisual() {
  return (
    <div className="relative w-full aspect-[4/3] rounded-xl border bg-muted/20 overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.04] dark:opacity-[0.07]"
        style={{
          backgroundImage:
            "radial-gradient(circle, currentColor 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      />
      <div className="absolute inset-0 p-4 md:p-8 grid grid-cols-2 grid-rows-2 gap-2.5 md:gap-4">
        {[0, 1, 2, 3].map((idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 + idx * 0.08, duration: 0.5 }}
            className="relative rounded-md md:rounded-lg border bg-background shadow-sm overflow-hidden"
          >
            <div className="absolute inset-0 p-2 md:p-3 flex flex-col gap-1">
              <div
                className={cn(
                  "rounded-sm h-1 md:h-1.5 bg-foreground/12",
                  idx % 2 === 0 ? "w-3/4" : "w-1/2"
                )}
              />
              <div className="w-2/5 h-0.5 md:h-1 rounded-sm bg-foreground/6" />
              {idx === 1 && (
                <div className="mt-auto w-full h-[40%] rounded-sm bg-foreground/[0.04]" />
              )}
              {idx === 2 && (
                <div className="mt-auto flex gap-1">
                  {[1, 2, 3].map((b) => (
                    <div
                      key={b}
                      className="flex-1 rounded-sm bg-foreground/[0.05]"
                      style={{ height: `${8 + b * 6}px` }}
                    />
                  ))}
                </div>
              )}
            </div>
            {idx === 1 && (
              <div className="absolute inset-0 ring-2 ring-foreground/20 rounded-md md:rounded-lg pointer-events-none" />
            )}
          </motion.div>
        ))}
      </div>
      {/* Marquee hint */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.8, duration: 0.4 }}
        className="absolute bottom-[10%] left-[8%] w-[84%] h-[36%] border border-foreground/10 bg-foreground/[0.02] rounded-sm pointer-events-none"
      />
    </div>
  );
}

/**
 * Rendering pipeline as horizontal bars — monochrome, structural.
 */
function EngineVisual() {
  const layers = [
    { label: "Skia", width: "92%" },
    { label: "Compositing", width: "74%" },
    { label: "Layout", width: "55%" },
    { label: "Hit test", width: "38%" },
  ];

  return (
    <div className="relative w-full aspect-[4/3] rounded-xl border bg-muted/20 overflow-hidden p-6 md:p-10">
      <div className="h-full flex flex-col justify-center gap-2.5 md:gap-3">
        {layers.map((layer, i) => (
          <motion.div
            key={layer.label}
            initial={{ opacity: 0, scaleX: 0 }}
            whileInView={{ opacity: 1, scaleX: 1 }}
            viewport={{ once: true }}
            transition={{
              delay: 0.2 + i * 0.1,
              duration: 0.6,
              ease: "easeOut",
            }}
            style={{ width: layer.width, transformOrigin: "left" }}
            className="rounded-md bg-foreground/[0.05] px-3 py-2 md:px-4 md:py-2.5"
          >
            <span className="text-xs md:text-sm font-mono text-muted-foreground/50">
              {layer.label}
            </span>
          </motion.div>
        ))}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="flex items-center gap-4 mt-3 md:mt-4 text-xs font-mono text-muted-foreground/30"
        >
          <div className="flex items-center gap-1.5">
            <div className="size-1.5 rounded-full bg-foreground/20" />
            <span>wasm</span>
          </div>
          <span>gpu</span>
          <span>60 fps</span>
        </motion.div>
      </div>
    </div>
  );
}

/**
 * Git diff — monochrome with only +/- carrying subtle weight.
 */
function FormatVisual() {
  const lines: { prefix?: "+" | "-" | " "; text: string }[] = [
    { text: "slides/quarterly-review.grida", prefix: " " },
    { text: "" },
    { text: 'scene "Slides"', prefix: " " },
    { text: '  tray "Title Slide"     1920\u00d71080', prefix: " " },
    { text: '  tray "Key Metrics"     1920\u00d71080', prefix: "-" },
    { text: '  tray "Revenue Detail"  1920\u00d71080', prefix: "+" },
    { text: '  tray "Roadmap"         1920\u00d71080', prefix: " " },
    { text: '  tray "Thank You"       1920\u00d71080', prefix: "+" },
    { text: "" },
    { text: "4 slides \u00b7 48 KB \u00b7 2 changes", prefix: " " },
  ];

  return (
    <div className="relative w-full aspect-[4/3] rounded-xl border bg-muted/20 overflow-hidden p-4 md:p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="h-full flex flex-col justify-center font-mono text-[10px] md:text-xs leading-relaxed"
      >
        {lines.map((line, i) => {
          if (!line.text) return <div key={i} className="h-2 md:h-3" />;
          const isAdd = line.prefix === "+";
          const isRemove = line.prefix === "-";
          return (
            <div
              key={i}
              className={cn(
                "px-2 py-0.5 rounded-sm flex items-center gap-2",
                isAdd && "bg-foreground/[0.04] text-foreground/70",
                isRemove &&
                  "bg-foreground/[0.03] text-foreground/40 line-through",
                !isAdd && !isRemove && "text-muted-foreground/40"
              )}
            >
              <span className="w-3 text-center shrink-0 font-bold">
                {line.prefix === " " ? "" : line.prefix}
              </span>
              <span>{line.text}</span>
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}
