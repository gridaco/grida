"use client";

import React from "react";
import {
  useNumberInput,
  useNumberGesture,
  useSliderValue,
  useHexValueInput,
  type NumberChange,
  type RGB,
} from "@grida/number-input/react";
import { Slider } from "@app/ui/components/slider";
import { Button } from "@app/ui/components/button";
import { CopyToClipboardInput } from "@/components/copy-to-clipboard-input";
import { NpmLogo } from "@grida/react-icons/logos";
import { GitHubLogoIcon } from "@radix-ui/react-icons";
import { ArrowRightIcon } from "lucide-react";
import Footer from "@/www/footer";
import Header from "@/www/header";
import Link from "next/link";

const NPM_URL = "https://www.npmjs.com/package/@grida/number-input";
const GITHUB_URL =
  "https://github.com/gridaco/grida/tree/main/packages/grida-number-input";

// Related demos — where these hooks ship in product, and the package index.
const RELATED: { href: string; label: string }[] = [
  { href: "/canvas", label: "Canvas playground" },
  { href: "/packages", label: "All packages" },
];

/**
 * Demo card — prose outside, interaction inside.
 *
 * Title and hint sit above the boundary; the bordered frame holds only the
 * live control (Stage) and its state readout (Output). Same separation as
 * the svg-editor SpecCard / tree-view ComponentDemo pattern.
 */
function DemoCard({
  title,
  hint,
  bullets,
  children,
}: React.PropsWithChildren<{
  title: string;
  hint: React.ReactNode;
  bullets?: React.ReactNode[];
}>) {
  return (
    <section className="space-y-3">
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">{hint}</p>
        {bullets && (
          <ul className="text-sm text-muted-foreground max-w-2xl list-disc pl-5 space-y-1">
            {bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="overflow-hidden rounded-lg border">{children}</div>
    </section>
  );
}

function Stage({ children }: React.PropsWithChildren) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center gap-4 bg-muted/30 px-8 py-10">
      {children}
    </div>
  );
}

function Output({ children }: React.PropsWithChildren) {
  return (
    <div className="border-t bg-background px-4 py-2 font-mono text-xs text-muted-foreground">
      {children}
    </div>
  );
}

const inputClassName =
  "w-32 px-2 py-1 text-sm border rounded-md bg-background font-mono focus:outline-none focus:ring-1 focus:ring-ring";

function BasicNumberDemo() {
  const [committed, setCommitted] = React.useState(24);
  const input = useNumberInput({
    value: committed,
    step: 1,
    mode: "fixed",
    onValueCommit: (value: NumberChange | number) =>
      setCommitted(value as number),
  });

  return (
    <>
      <Stage>
        <input
          ref={input.inputRef}
          type={input.inputType}
          className={inputClassName}
          value={input.internalValue}
          onChange={input.handleChange}
          onKeyDown={input.handleKeyDown}
          onFocus={input.handleFocus}
          onBlur={input.handleBlur}
        />
      </Stage>
      <Output>committed: {committed}</Output>
    </>
  );
}

function PercentageDemo() {
  // Stored as 0–1, displayed as 0–100%.
  const [opacity, setOpacity] = React.useState(0.5);
  const input = useNumberInput({
    value: opacity,
    suffix: "%",
    scale: 100,
    step: 0.01,
    min: 0,
    max: 1,
    mode: "fixed",
    onValueCommit: (value: NumberChange | number) =>
      setOpacity(value as number),
  });

  return (
    <>
      <Stage>
        <input
          ref={input.inputRef}
          type={input.inputType}
          className={inputClassName}
          value={input.internalValue}
          onChange={input.handleChange}
          onKeyDown={input.handleKeyDown}
          onFocus={input.handleFocus}
          onBlur={input.handleBlur}
        />
      </Stage>
      <Output>stored: {opacity.toFixed(2)}</Output>
    </>
  );
}

function MixedDemo() {
  const [widths, setWidths] = React.useState<[number, number]>([80, 160]);
  const mixed = widths[0] !== widths[1];
  const input = useNumberInput({
    value: mixed ? "mixed" : widths[0],
    step: 1,
    min: 8,
    max: 240,
    onValueCommit: (change: NumberChange | number) => {
      const c = change as NumberChange;
      if (c.type === "set") setWidths([c.value, c.value]);
    },
  });

  return (
    <>
      <Stage>
        <div className="flex items-center gap-3">
          <input
            ref={input.inputRef}
            type={input.inputType}
            className={inputClassName}
            value={input.internalValue}
            onChange={input.handleChange}
            onKeyDown={input.handleKeyDown}
            onFocus={input.handleFocus}
            onBlur={input.handleBlur}
          />
          <button
            type="button"
            className="text-xs text-muted-foreground underline underline-offset-2"
            onClick={() => setWidths([80, 160])}
          >
            reset
          </button>
        </div>
        <div className="w-64 space-y-2">
          {widths.map((w, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className="h-4 rounded-sm bg-foreground/20"
                style={{ width: w }}
              />
              <span className="text-xs text-muted-foreground font-mono">
                {w}
              </span>
            </div>
          ))}
        </div>
      </Stage>
      <Output>
        widths: {widths[0]} · {widths[1]}
        {mixed ? " — mixed" : ""}
      </Output>
    </>
  );
}

function ScrubDemo() {
  const [value, setValue] = React.useState(120);
  const { bind } = useNumberGesture({
    mode: "auto",
    step: 1,
    sensitivity: 1,
    axisForValue: "x",
    onValueChange: (change) => {
      const c = change as NumberChange;
      if (c.type === "delta") {
        setValue((prev) => Math.max(0, Math.min(256, prev + c.value)));
      }
    },
  });

  return (
    <>
      <Stage>
        <div className="flex items-center gap-2">
          <span
            {...bind()}
            className="px-2 py-1 text-sm font-mono border rounded-md bg-background cursor-ew-resize select-none touch-none"
          >
            W
          </span>
          <span className="text-sm font-mono w-12">{value}</span>
        </div>
        <div className="w-64">
          <div
            className="h-4 rounded-sm bg-foreground/20"
            style={{ width: value }}
          />
        </div>
      </Stage>
      <Output>value: {value}</Output>
    </>
  );
}

function SliderDemo() {
  const marks = [0, 25, 50, 75, 100];
  const slider = useSliderValue({
    min: 0,
    max: 100,
    step: 1,
    marks,
    defaultValue: 40,
  });

  return (
    <>
      <Stage>
        <div className="w-64 space-y-2">
          <Slider
            min={0}
            max={100}
            value={slider.value}
            onValueChange={slider.onValueChange}
            onValueCommit={slider.onValueCommit}
          />
          <div className="relative h-2">
            {marks.map((mark) => (
              <span
                key={mark}
                className="absolute size-1 rounded-full bg-foreground/30 -translate-x-1/2"
                style={{ left: `${mark}%` }}
              />
            ))}
          </div>
        </div>
      </Stage>
      <Output>
        value: {slider.value[0]}
        {slider.isSnapped ? " — snapped" : ""}
      </Output>
    </>
  );
}

// Intentionally local — the package's rgbToHex/hexToRgb are not a committed
// public surface, so the demo must not depend on them.
const toHexColor = (c: RGB) =>
  `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

const fromHexColor = (hex: string): RGB => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
});

function HexDemo() {
  const [color, setColor] = React.useState<RGB>({ r: 255, g: 128, b: 64 });
  const input = useHexValueInput({
    value: color,
    onValueCommit: (rgb) => setColor(rgb),
  });

  return (
    <>
      <Stage>
        <div className="flex items-center gap-2">
          {/* The swatch is a native color input — picking syncs back into the hex field. */}
          <input
            type="color"
            aria-label="Pick color"
            value={toHexColor(color)}
            onChange={(e) => setColor(fromHexColor(e.target.value))}
            className="size-7 cursor-pointer appearance-none rounded-md border bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-[5px] [&::-webkit-color-swatch]:border-none"
          />
          <div className="flex items-center border rounded-md bg-background px-2 py-1">
            <span className="text-sm font-mono text-muted-foreground">#</span>
            <input
              {...input}
              className="w-20 text-sm font-mono bg-transparent focus:outline-none"
              spellCheck={false}
            />
          </div>
        </div>
      </Stage>
      <Output>
        rgb({color.r}, {color.g}, {color.b})
      </Output>
    </>
  );
}

export default function NumberInputPackagePage() {
  return (
    <main className="min-h-screen">
      <Header className="relative" />

      {/* Hero */}
      <section className="container mx-auto px-4 pt-32 pb-12">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-200 bg-zinc-50 text-xs font-medium text-zinc-600">
            <span className="size-1.5 rounded-full bg-amber-500" />
            v0 · ESM + CJS · MIT
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight font-mono">
            @grida/number-input
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Headless React hooks for editor-grade number inputs — the input
            behaviors of the Grida editor&apos;s properties panel, extracted as
            a package. Typed parsing, step precision, commit safety, mixed-value
            state, scrub gestures, snapping sliders, and hex color input.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href={NPM_URL} target="_blank" rel="noopener noreferrer">
              <Button size="lg" variant="outline">
                <NpmLogo className="size-8 mr-1" />
                npm
              </Button>
            </Link>
            <Link href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              <Button size="lg" variant="outline">
                <GitHubLogoIcon className="size-4 mr-2" />
                GitHub
              </Button>
            </Link>
          </div>
          <div className="pt-2 max-w-sm mx-auto">
            <CopyToClipboardInput value="pnpm add @grida/number-input" />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
            {RELATED.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {label}
                <ArrowRightIcon className="size-3" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Demos */}
      <div className="container mx-auto max-w-2xl px-4 pb-24 space-y-12">
        <DemoCard
          title="Number input"
          hint={
            <>
              Type a value — <kbd>↑</kbd>/<kbd>↓</kbd> steps, <kbd>Shift</kbd>{" "}
              for ×10, <kbd>Enter</kbd> or blur commits. Invalid input never
              commits.
            </>
          }
        >
          <BasicNumberDemo />
        </DemoCard>

        <DemoCard
          title="Suffix + display scale"
          hint={
            <>
              Stored as 0–1, displayed as a percentage. Type <code>50</code> or{" "}
              <code>50%</code> — the commit is <code>0.5</code>.
            </>
          }
        >
          <PercentageDemo />
        </DemoCard>

        <DemoCard
          title="Mixed value (multi-selection)"
          hint={
            <>
              Two objects with different widths show as <code>mixed</code> — the
              multi-selection state in a properties panel. Commit a number to
              set both.
            </>
          }
        >
          <MixedDemo />
        </DemoCard>

        <DemoCard
          title="Scrub label (virtual slider)"
          hint={
            <>
              Drag the <code>W</code> label horizontally to change the value —
              pointer lock keeps the drag going past screen edges.
            </>
          }
        >
          <ScrubDemo />
        </DemoCard>

        <DemoCard
          title="Slider with mark snapping"
          hint="Drag near a mark (0, 25, 50, 75, 100) and the value snaps to it."
        >
          <SliderDemo />
        </DemoCard>

        <DemoCard
          title="Hex color input"
          hint={
            <>
              Place the caret on a channel and press <kbd>↑</kbd>/<kbd>↓</kbd>{" "}
              to step it. Or click the swatch to pick with the native color
              picker.
            </>
          }
          bullets={[
            <>
              Fuzzy expansion — <code>8</code> → <code>888888</code>,{" "}
              <code>F80</code> → <code>FF8800</code>; the first hex run is
              extracted, <code>#</code> and stray characters are ignored.
            </>,
            <>
              Alpha extraction — 4-digit (<code>RGBA</code>) and 8-digit (
              <code>RRGGBBAA</code>) input commit the RGB plus a separate 0–1
              opacity.
            </>,
            <>
              Channel-aware stepping — a selection spanning channels steps them
              together, and the selection is restored after each step.
            </>,
            <>
              <kbd>Shift</kbd> for coarse steps; works in <code>u8</code>{" "}
              (0–255) or <code>f32</code> (0–1) channel units.
            </>,
            <>
              Free typing while focused — invalid input reverts to the last
              valid color on commit.
            </>,
          ]}
        >
          <HexDemo />
        </DemoCard>
      </div>

      <Footer />
    </main>
  );
}
