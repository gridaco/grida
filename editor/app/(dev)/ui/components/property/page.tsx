"use client";

import React from "react";
import { PropertyEnumV2, type EnumItem } from "@/scaffolds/sidecontrol/ui";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const blendModeItems: EnumItem<string>[][] = [
  [{ value: "normal", label: "Normal" }],
  [
    { value: "darken", label: "Darken" },
    { value: "multiply", label: "Multiply" },
    { value: "color-burn", label: "Color Burn" },
  ],
  [
    { value: "lighten", label: "Lighten" },
    { value: "screen", label: "Screen" },
    { value: "color-dodge", label: "Color Dodge" },
  ],
  [
    { value: "overlay", label: "Overlay" },
    { value: "hard-light", label: "Hard Light" },
    { value: "soft-light", label: "Soft Light" },
  ],
  [
    { value: "difference", label: "Difference" },
    { value: "exclusion", label: "Exclusion" },
  ],
];

const fontWeightItems: EnumItem<string>[] = [
  { value: "100", label: "Thin" },
  { value: "200", label: "Extra Light" },
  { value: "300", label: "Light" },
  { value: "400", label: "Regular" },
  { value: "500", label: "Medium" },
  { value: "600", label: "Semi Bold" },
  { value: "700", label: "Bold" },
  { value: "800", label: "Extra Bold" },
  { value: "900", label: "Black" },
];

const strokeCapItems: EnumItem<string>[] = [
  { value: "none", label: "None" },
  { value: "round", label: "Round" },
  { value: "square", label: "Square" },
];

// ---------------------------------------------------------------------------
// Demo: Grouped enum (blend mode)
// ---------------------------------------------------------------------------

function GroupedDemo() {
  const [value, setValue] = React.useState<string>("normal");
  const [seeked, setSeeked] = React.useState<string | undefined>();

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Grouped — Blend mode</h3>
      <p className="text-xs text-muted-foreground max-w-prose">
        Grouped <code>EnumItem[][]</code> with separators between groups.
        Hover or arrow-key through items to see <code>onValueSeeked</code> fire.
      </p>
      <div className="flex items-center gap-4">
        <PropertyEnumV2
          enum={blendModeItems}
          value={value}
          placeholder="Blend mode…"
          onValueChange={setValue}
          onValueSeeked={setSeeked}
        />
        <div className="text-xs text-muted-foreground space-y-1">
          <div>
            Selected: <code className="font-mono">{value}</code>
          </div>
          <div>
            Seeked: <code className="font-mono">{seeked ?? "(none)"}</code>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demo: Live preview (font weight)
// ---------------------------------------------------------------------------

function PreviewDemo() {
  const [committed, setCommitted] = React.useState<string>("400");
  const [preview, setPreview] = React.useState<string | undefined>();

  const effective = preview ?? committed;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">
        Live preview — Font weight
      </h3>
      <p className="text-xs text-muted-foreground max-w-prose">
        The <code>onValueSeeked</code> callback drives a live preview.
        The text weight changes as you hover or arrow through items,
        and commits only on click / Enter.
      </p>
      <div className="flex items-center gap-6">
        <PropertyEnumV2
          enum={fontWeightItems}
          value={committed}
          placeholder="Font weight…"
          onValueChange={(v) => {
            setCommitted(v);
            setPreview(undefined);
          }}
          onValueSeeked={setPreview}
        />

        <div
          className="text-2xl transition-all duration-150"
          style={{ fontWeight: Number(effective) }}
        >
          Grida Canvas
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <div>
            Committed: <code className="font-mono">{committed}</code>
          </div>
          <div>
            Previewing:{" "}
            <code className="font-mono">{preview ?? "(none)"}</code>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demo: Flat enum (simple)
// ---------------------------------------------------------------------------

function FlatDemo() {
  const [value, setValue] = React.useState<string>("none");

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Flat — Stroke cap</h3>
      <p className="text-xs text-muted-foreground max-w-prose">
        Flat <code>EnumItem[]</code> without groups. Works as a drop-in
        replacement for <code>PropertyEnum</code>.
      </p>
      <div className="flex items-center gap-4">
        <PropertyEnumV2
          enum={strokeCapItems}
          value={value}
          placeholder="Stroke cap…"
          onValueChange={setValue}
        />
        <div className="text-xs text-muted-foreground">
          Selected: <code className="font-mono">{value}</code>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PropertyDemoPage() {
  return (
    <main className="container max-w-screen-lg mx-auto py-10">
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold mb-2">PropertyEnumV2</h1>
          <p className="text-sm text-muted-foreground max-w-prose">
            Successor to <code>PropertyEnum</code>. Built on Base UI Combobox
            with <code>onValueSeeked</code> support — fires when the user
            hovers or navigates to an item via keyboard, before committing.
            This enables live-preview patterns (blend mode, font weight, etc.)
            directly in the property panel without manual DropdownMenu wiring.
          </p>
        </div>

        <hr />

        <GroupedDemo />

        <hr />

        <PreviewDemo />

        <hr />

        <FlatDemo />
      </div>
    </main>
  );
}
