"use client";

import { memo, useCallback, useSyncExternalStore } from "react";
import {
  useCommands,
  usePaintPreview,
  useSelection,
  useSvgEditor,
} from "@grida/svg-editor/react";
import type {
  AlignDirection,
  GradientEntry,
  NodeId,
  PaintValue,
  Rect,
} from "@grida/svg-editor";
import cmath from "@grida/cmath";
import { PaintRow } from "./color-panel";
import { ProvenanceChip } from "./provenance-chip";
import { AlignControl } from "@/scaffolds/sidecontrol/controls/ext-align";
import { Button } from "@app/ui/components/button";
import { Separator } from "@app/ui/components/separator";
import { Input } from "@app/ui/components/input";
import { Label } from "@app/ui/components/label";

// Per-leaf subscriptions. `editor.node_paint` / `node_properties` /
// `defs.gradients.list()` are reference-stable across no-op emits, so
// `useSyncExternalStore` short-circuits via `Object.is` with no
// userland diffing. A fill drag re-renders only the fill row.

function useNodePaint(id: NodeId, channel: "fill" | "stroke"): PaintValue {
  const editor = useSvgEditor();
  const subscribe = useCallback(
    (cb: () => void) => editor.subscribe(cb),
    [editor]
  );
  const get = useCallback(
    () => editor.node_paint(id, channel),
    [editor, id, channel]
  );
  return useSyncExternalStore(subscribe, get, get);
}

function useGradients(): ReadonlyArray<GradientEntry> {
  const editor = useSvgEditor();
  const subscribe = useCallback(
    (cb: () => void) => editor.defs.gradients.subscribe(cb),
    [editor]
  );
  const get = useCallback(() => editor.defs.gradients.list(), [editor]);
  return useSyncExternalStore(subscribe, get, get);
}

type PropertyValue = ReturnType<
  ReturnType<typeof useSvgEditor>["node_properties"]
>[string];

function useNodeProperty(id: NodeId, name: string): PropertyValue {
  const editor = useSvgEditor();
  const subscribe = useCallback(
    (cb: () => void) => editor.subscribe(cb),
    [editor]
  );
  const get = useCallback(
    () => editor.node_properties(id, [name])[name],
    [editor, id, name]
  );
  return useSyncExternalStore(subscribe, get, get);
}

export function InspectorPanel() {
  const selection = useSelection();
  if (selection.length === 1) return <SelectionPanel id={selection[0]} />;
  if (selection.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Nothing selected. Click an element in the canvas or in the Layers pane.
      </p>
    );
  }
  return <MultiSelectionPanel count={selection.length} />;
}

function MultiSelectionPanel({ count }: { count: number }) {
  return (
    <div className="flex flex-col gap-3">
      <MultiSelectionHeader count={count} />
      <Section title="Align">
        <AlignButtons />
      </Section>
    </div>
  );
}

function MultiSelectionHeader({ count }: { count: number }) {
  return (
    <div className="px-2 py-1.5 bg-muted rounded-md text-xs">
      {count} elements selected
    </div>
  );
}

/**
 * Read-once header — `node.tag` and `node.name` can't change for a fixed
 * id, so we read directly from `editor.tree()` (now memoized, so this is
 * a single cache lookup) instead of subscribing.
 */
function SelectionHeader({ id }: { id: NodeId }) {
  const editor = useSvgEditor();
  const node = editor.tree().nodes.get(id);
  if (!node) return null;
  return (
    <div className="px-2 py-1.5 bg-muted rounded-md font-mono text-xs truncate">
      &lt;{node.tag}
      {node.name ? ` id="${node.name}"` : ""}&gt;
    </div>
  );
}

function SelectionPanel({ id }: { id: NodeId }) {
  return (
    <div className="flex flex-col gap-3">
      <SelectionHeader id={id} />

      <Section title="Align">
        <AlignButtons />
      </Section>

      <GeometrySection id={id} />

      <Section title="Color">
        <div className="flex flex-col gap-2 w-full">
          <SubscribedPaintRow id={id} channel="fill" />
          <SubscribedPaintRow id={id} channel="stroke" />
        </div>
      </Section>

      <Section title="Properties">
        <SubscribedPropertyRow id={id} name="stroke-width" />
        <SubscribedPropertyRow id={id} name="opacity" />
      </Section>

      <Section title="Arrange">
        <ArrangeButtons />
      </Section>
    </div>
  );
}

// SVG primitives have no shared geometry attribute set: rect/image/use have
// (x, y, width, height); circle has (cx, cy, r); etc. The host has to switch
// on tag, which leaks per-element semantics across the package boundary
// (README §P3) — see FEEDBACK.md §4.1.
//
// `<svg>` is intentionally absent from both this table and READONLY_BBOX_TAGS:
// editing root x/y/w/h mutates the viewport, not the content, and nested-svg
// bbox lies (docs/wg/feat-svg-editor/geometry.md). The root falls through to the no-section branch.
const GEOMETRY_PROPS = {
  rect: ["x", "y", "width", "height"],
  image: ["x", "y", "width", "height"],
  use: ["x", "y", "width", "height"],
  circle: ["cx", "cy", "r"],
  ellipse: ["cx", "cy", "rx", "ry"],
  line: ["x1", "y1", "x2", "y2"],
} as const satisfies Record<string, readonly string[]>;

const READONLY_BBOX_TAGS = new Set([
  "path",
  "polyline",
  "polygon",
  "g",
  "text",
  "tspan",
]);

/**
 * Geometry panel. Branches on tag — editable SVG-attribute fields for shapes
 * with a stable attribute schema, read-only world-bbox readout for the rest.
 *
 * `tag` is read once via `editor.tree()` without subscribing: tag is immutable
 * for a given id today (no `set_tag` op exists). TODO §2 entertains
 * circle→ellipse surgery on non-uniform resize; if that lands, this section
 * will stale until selection changes — revisit then.
 */
function GeometrySection({ id }: { id: NodeId }) {
  const editor = useSvgEditor();
  const tag = editor.tree().nodes.get(id)?.tag;
  if (!tag) return null;

  const props =
    tag in GEOMETRY_PROPS
      ? GEOMETRY_PROPS[tag as keyof typeof GEOMETRY_PROPS]
      : null;
  if (!props && !READONLY_BBOX_TAGS.has(tag)) return null;

  return (
    <Section title="Geometry">
      <div className="grid grid-cols-2 gap-1.5">
        {props ? (
          props.map((name) => (
            <SubscribedPropertyRow key={name} id={id} name={name} />
          ))
        ) : (
          <BoundsFields id={id} />
        )}
      </div>
    </Section>
  );
}

/**
 * Subscribed to the geometry channel (`subscribe_geometry`), not the main
 * `subscribe` — bounds change on geometry_version bumps (drag, resize, text
 * edit, structure), not on presentation-only writes (fill, opacity). See
 * README §Observation — geometry.
 */
function useNodeBounds(id: NodeId): Rect | null {
  const editor = useSvgEditor();
  const subscribe = useCallback(
    (cb: () => void) => editor.subscribe_geometry(cb),
    [editor]
  );
  const get = useCallback(
    () => editor.geometry?.bounds_of(id) ?? null,
    [editor, id]
  );
  return useSyncExternalStore<Rect | null>(subscribe, get, () => null);
}

function BoundsFields({ id }: { id: NodeId }) {
  const bounds = useNodeBounds(id);
  return (
    <>
      <ReadOnlyField label="x" value={bounds?.x} />
      <ReadOnlyField label="y" value={bounds?.y} />
      <ReadOnlyField label="width" value={bounds?.width} />
      <ReadOnlyField label="height" value={bounds?.height} />
    </>
  );
}

function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: number | undefined;
}) {
  return (
    <div className="flex flex-col gap-1 w-full">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input
        type="text"
        value={
          value !== undefined && Number.isFinite(value)
            ? cmath.ui.formatNumber(value, 2)
            : ""
        }
        readOnly
        placeholder="—"
        className="flex-1 h-7 text-xs font-mono"
      />
    </div>
  );
}

function SubscribedPaintRow({
  id,
  channel,
}: {
  id: NodeId;
  channel: "fill" | "stroke";
}) {
  const cmd = useCommands();
  const value = useNodePaint(id, channel);
  const gradients = useGradients();
  const preview = usePaintPreview(channel);
  return (
    <PaintRow
      label={channel}
      value={value}
      gradients={gradients}
      onSetPaint={(p) => cmd.set_paint(channel, p)}
      preview={preview}
      onCreateGradient={(def) => cmd.set_paint_from_gradient(channel, def)}
    />
  );
}

function SubscribedPropertyRow({ id, name }: { id: NodeId; name: string }) {
  const cmd = useCommands();
  const value = useNodeProperty(id, name);
  return (
    <PropertyRow
      label={name}
      value={value}
      onChange={(v) => cmd.set_property(name, v)}
    />
  );
}

// `memo` with no reactive props — mounts once per SelectionPanel,
// inert during paint / property / drag activity.
const ARRANGE_ACTIONS = [
  { label: "Forward", dir: "bring_forward" },
  { label: "Backward", dir: "send_backward" },
  { label: "To Front", dir: "bring_to_front" },
  { label: "To Back", dir: "send_to_back" },
] as const;

const ArrangeButtons = memo(function ArrangeButtons() {
  const cmd = useCommands();
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {ARRANGE_ACTIONS.map(({ label, dir }) => (
        <Button
          key={dir}
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => cmd.reorder(dir)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
});

// Map the shared `AlignControl` axis-keyed payload to the package's
// `AlignDirection` enum. `horizontal` writes shift X (left/right/center-X);
// `vertical` writes shift Y. `none` is a no-op (matches the spec of
// `AlignControl.onAlign`'s allowed values).
const HORIZONTAL_TO_DIR: Record<"min" | "max" | "center", AlignDirection> = {
  min: "left",
  max: "right",
  center: "horizontal_centers",
};
const VERTICAL_TO_DIR: Record<"min" | "max" | "center", AlignDirection> = {
  min: "top",
  max: "bottom",
  center: "vertical_centers",
};

const AlignButtons = memo(function AlignButtons() {
  const cmd = useCommands();
  return (
    <AlignControl
      onAlign={({ horizontal, vertical }) => {
        if (horizontal && horizontal !== "none") {
          cmd.align(HORIZONTAL_TO_DIR[horizontal]);
        }
        if (vertical && vertical !== "none") {
          cmd.align(VERTICAL_TO_DIR[vertical]);
        }
      }}
    />
  );
});

function PropertyRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: PropertyValue;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-1 w-full">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <div className="flex gap-1.5 items-center">
        <Input
          type="text"
          value={value.declared ?? ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : e.target.value)
          }
          placeholder={String(value.computed ?? "")}
          className="flex-1 h-7 text-xs font-mono"
        />
        <ProvenanceChip carrier={value.provenance.carrier} />
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </h3>
        <Separator className="flex-1" />
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}
