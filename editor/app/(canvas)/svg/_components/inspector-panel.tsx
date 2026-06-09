"use client";

import { memo, useCallback, useSyncExternalStore } from "react";
import {
  useCommands,
  usePaintPreview,
  usePropertyPreview,
  useSelection,
  useSvgEditor,
} from "@grida/svg-editor/react";
import type {
  AlignDirection,
  NodeId,
  PaintValue,
  PreviewSession,
  Rect,
} from "@grida/svg-editor";
import type { editor } from "@/grida-canvas";
import cmath from "@grida/cmath";
import { PaintRow } from "./color-panel";
import { FontFamilyPicker, ensureGoogleFont } from "./font-panel";
import { ProvenanceChip } from "./provenance-chip";
import { AlignControl } from "@/scaffolds/sidecontrol/controls/ext-align";
import {
  PropertyRow,
  PropertyLineLabel,
  PropertyInput,
  PropertyEnumTabs,
  PropertySection,
  PropertySectionContent,
  PropertySectionHeaderItem,
  PropertySectionHeaderLabel,
  PropertySectionHeaderActions,
} from "@/scaffolds/sidecontrol/ui";
import InputPropertyNumber from "@/scaffolds/sidecontrol/ui/number";
import InputPropertyPercentage from "@/scaffolds/sidecontrol/ui/percentage";
import { Button } from "@app/ui/components/button";
import { Toggle } from "@app/ui/components/toggle";
import {
  EyeIcon,
  EyeOffIcon,
  PlusIcon,
  MinusIcon,
  RotateCwIcon,
  FlipHorizontalIcon,
  FlipVerticalIcon,
} from "lucide-react";

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

/**
 * Resolve the numeric value a property currently holds, for feeding into
 * `InputPropertyNumber` and for resolving `delta` changes. Prefers the
 * computed value (already a number when valid); falls back to parsing the
 * declared string. Returns `""` (the input's empty state) when neither
 * yields a finite number.
 */
function numericOf(value: PropertyValue): number | "" {
  const c = value.computed;
  if (typeof c === "number" && Number.isFinite(c)) return c;
  const declared = value.declared;
  if (declared != null) {
    const n = Number.parseFloat(declared);
    if (Number.isFinite(n)) return n;
  }
  return "";
}

/**
 * Resolve a `NumberChange` (from `InputPropertyNumber` in `auto` mode) into an
 * absolute number, given the property's current numeric value. `set` is
 * absolute; `delta` adds to the current value (0 when unset). This adapts the
 * Canvas-editor `editor.api.NumberChange` payload to the SVG editor's
 * string-based `set_property` / preview `update` API without leaking Canvas
 * editor types into the data layer.
 */
function resolveNumberChange(
  change: editor.api.NumberChange,
  current: number | ""
): number {
  if (change.type === "set") return change.value;
  const base = typeof current === "number" ? current : 0;
  return base + change.value;
}

export function InspectorPanel() {
  const selection = useSelection();
  if (selection.length === 1) return <SelectionPanel id={selection[0]} />;
  if (selection.length === 0) {
    return (
      <p className="p-3 text-xs text-muted-foreground">
        Nothing selected. Click an element in the canvas or in the Layers pane.
      </p>
    );
  }
  return <MultiSelectionPanel count={selection.length} />;
}

function MultiSelectionPanel({ count }: { count: number }) {
  return (
    <div className="flex flex-col">
      <MultiSelectionHeader count={count} />
      <PropertySection className="border-b">
        <PropertySectionHeaderItem>
          <PropertySectionHeaderLabel>Align</PropertySectionHeaderLabel>
        </PropertySectionHeaderItem>
        <PropertySectionContent>
          <AlignButtons />
        </PropertySectionContent>
      </PropertySection>
    </div>
  );
}

function MultiSelectionHeader({ count }: { count: number }) {
  return (
    <div className="mx-4 my-2 px-2 py-1.5 bg-muted rounded-md text-xs">
      {count} elements selected
    </div>
  );
}

/**
 * Read-once header — `node.tag` and `node.name` can't change for a fixed
 * id, so we read directly from `editor.tree()` (now memoized, so this is
 * a single cache lookup) instead of subscribing. The visibility toggle is
 * its own subcomponent with a per-leaf `visibility` subscription, so the
 * (read-once) tag chip never re-renders when visibility flips.
 */
function SelectionHeader({ id }: { id: NodeId }) {
  const editor = useSvgEditor();
  const node = editor.tree().nodes.get(id);
  if (!node) return null;
  return (
    <div className="mx-4 my-2 flex items-center gap-1.5">
      <div className="min-w-0 flex-1 px-2 py-1.5 bg-muted rounded-md font-mono text-xs truncate">
        &lt;{node.tag}
        {node.name ? ` id="${node.name}"` : ""}&gt;
      </div>
      <VisibilityToggle id={id} />
    </div>
  );
}

/**
 * Canvas-style show/hide eye toggle, backed by the `visibility` property
 * (hidden when it resolves to `"hidden"`).
 *
 * `visibility`, not `display`: `display:none` drops the node from the render
 * tree, breaking the DOM-query hit-test + CTM the editor relies on, so a hidden
 * node would become un-pickable. `visibility:hidden` keeps it queryable. Caveat:
 * `visibility` inherits, so a descendant can escape a hidden ancestor. Full
 * rationale + limitation: `packages/grida-svg-editor/docs/geometry.md`
 * ("Show/hide uses `visibility`").
 *
 * Round-trip: hide writes `visibility: hidden`; show writes `null`, *removing*
 * the attribute (not writing `visibility: visible`) so an untouched node returns
 * to its clean default. One undo step per toggle.
 */
function VisibilityToggle({ id }: { id: NodeId }) {
  const cmd = useCommands();
  const value = useNodeProperty(id, "visibility");
  const hidden = value.computed === "hidden" || value.declared === "hidden";
  return (
    <Toggle
      size="sm"
      variant="outline"
      pressed={hidden}
      onPressedChange={(next) =>
        cmd.set_property("visibility", next ? "hidden" : null)
      }
      aria-label={hidden ? "Show" : "Hide"}
      title={hidden ? "Show" : "Hide"}
    >
      {hidden ? <EyeOffIcon /> : <EyeIcon />}
    </Toggle>
  );
}

function SelectionPanel({ id }: { id: NodeId }) {
  const editor = useSvgEditor();
  const tag = editor.tree().nodes.get(id)?.tag;
  const isText = tag === "text" || tag === "tspan";
  const showLayout = !!tag && hasLayoutFields(tag);
  return (
    <div className="flex flex-col" data-testid="svg-inspector-panel">
      <SelectionHeader id={id} />

      <PropertySection className="border-b">
        <PropertySectionHeaderItem>
          <PropertySectionHeaderLabel>Position</PropertySectionHeaderLabel>
        </PropertySectionHeaderItem>
        <PropertySectionContent>
          <AlignButtons />
          <PositionFields id={id} />
          <RotateRow id={id} tag={tag} />
        </PropertySectionContent>
      </PropertySection>

      {showLayout && (
        <PropertySection className="border-b">
          <PropertySectionHeaderItem>
            <PropertySectionHeaderLabel>Layout</PropertySectionHeaderLabel>
          </PropertySectionHeaderItem>
          <PropertySectionContent>
            <LayoutFields id={id} />
          </PropertySectionContent>
        </PropertySection>
      )}

      <PropertySection className="border-b">
        <PropertySectionHeaderItem>
          <PropertySectionHeaderLabel>Appearance</PropertySectionHeaderLabel>
        </PropertySectionHeaderItem>
        <PropertySectionContent>
          <OpacityRow id={id} />
          {tag === "rect" && (
            <NumericPropertyRow
              id={id}
              name="rx"
              label="radius"
              min={0}
              step={1}
            />
          )}
        </PropertySectionContent>
      </PropertySection>

      <PaintSection
        id={id}
        channel="fill"
        title="Fill"
        defaultColor={FILL_DEFAULT_COLOR}
      />

      <PaintSection
        id={id}
        channel="stroke"
        title="Stroke"
        defaultColor={STROKE_DEFAULT_COLOR}
      >
        <NumericPropertyRow id={id} name="stroke-width" label="width" min={0} />
        <StrokeDashRow id={id} />
        <EnumPropertyRow
          id={id}
          name="stroke-linecap"
          label="cap"
          options={STROKE_LINECAP_OPTS}
        />
        <EnumPropertyRow
          id={id}
          name="stroke-linejoin"
          label="join"
          options={STROKE_LINEJOIN_OPTS}
        />
      </PaintSection>

      {isText && (
        <PropertySection className="border-b">
          <PropertySectionHeaderItem>
            <PropertySectionHeaderLabel>Text</PropertySectionHeaderLabel>
          </PropertySectionHeaderItem>
          <PropertySectionContent>
            <FontFamilyRow id={id} />
            <NumericPropertyRow
              id={id}
              name="font-size"
              label="size"
              min={0}
              step={1}
            />
            <EnumPropertyRow
              id={id}
              name="text-anchor"
              label="align"
              options={TEXT_ANCHOR_OPTS}
            />
          </PropertySectionContent>
        </PropertySection>
      )}
    </div>
  );
}

// SVG primitives have no shared geometry attribute set: rect/image/use have
// (x, y, width, height); circle has (cx, cy, r); etc. The host has to switch
// on tag, which leaks per-element semantics across the package boundary
// (a known constraint — see the @grida/svg-editor README, principle P3).
//
// Geometry is split across two sections: POSITION_PROPS (placement coords) go
// in Position; SIZE_PROPS (the size dimensions) go in Layout. "Size" is per
// shape: rect/image/use → width/height, circle → r, ellipse → rx/ry — the
// radii are width/height-like, so they live with Layout, not Position. A
// `<line>` has only endpoints (placement, not a size box), so it has no Layout
// section.
//
// `<svg>` is intentionally absent from every table here: editing root x/y/w/h
// mutates the viewport, not the content, and nested-svg bbox lies
// (docs/wg/feat-svg-editor/geometry.md). The root falls through to no fields.
const POSITION_PROPS = {
  rect: ["x", "y"],
  image: ["x", "y"],
  use: ["x", "y"],
  circle: ["cx", "cy"],
  ellipse: ["cx", "cy"],
  line: ["x1", "y1", "x2", "y2"],
} as const satisfies Record<string, readonly string[]>;

const SIZE_PROPS = {
  rect: ["width", "height"],
  image: ["width", "height"],
  use: ["width", "height"],
  circle: ["r"],
  ellipse: ["rx", "ry"],
} as const satisfies Record<string, readonly string[]>;

const READONLY_BBOX_TAGS = new Set([
  "path",
  "polyline",
  "polygon",
  "g",
  "text",
  "tspan",
]);

/** Whether the tag contributes a Layout (size) section. */
function hasLayoutFields(tag: string): boolean {
  return tag in SIZE_PROPS || READONLY_BBOX_TAGS.has(tag);
}

/**
 * Position-section geometry fields (placement + shape coords, never the
 * width/height box). Editable SVG attributes for shapes with a stable schema;
 * a read-only world-bbox x/y readout for the rest; nothing for tags without
 * either (e.g. the `<svg>` root). No section chrome of its own.
 *
 * `tag` is read once via `editor.tree()` without subscribing: tag is immutable
 * for a given id today (no `set_tag` op exists). TODO §2 entertains
 * circle→ellipse surgery on non-uniform resize; if that lands, these fields
 * will stale until selection changes — revisit then.
 */
function PositionFields({ id }: { id: NodeId }) {
  const editor = useSvgEditor();
  const tag = editor.tree().nodes.get(id)?.tag;
  if (!tag) return null;

  const props =
    tag in POSITION_PROPS
      ? POSITION_PROPS[tag as keyof typeof POSITION_PROPS]
      : null;
  if (props) {
    return (
      <>
        {props.map((name) => (
          <NumericPropertyRow key={name} id={id} name={name} />
        ))}
      </>
    );
  }
  if (READONLY_BBOX_TAGS.has(tag))
    return <BoundsFields id={id} axis="position" />;
  return null;
}

/**
 * Layout-section geometry fields — the width/height box only. Editable for
 * shapes that carry a native `width`/`height` (rect/image/use); a read-only
 * world-bbox width/height readout for the bbox tags. The caller only mounts
 * the Layout section when {@link hasLayoutFields} is true, so this never
 * renders an empty fragment for circle/ellipse/line.
 */
function LayoutFields({ id }: { id: NodeId }) {
  const editor = useSvgEditor();
  const tag = editor.tree().nodes.get(id)?.tag;
  if (!tag) return null;

  const props =
    tag in SIZE_PROPS ? SIZE_PROPS[tag as keyof typeof SIZE_PROPS] : null;
  if (props) {
    return (
      <>
        {props.map((name) => (
          <NumericPropertyRow key={name} id={id} name={name} />
        ))}
      </>
    );
  }
  if (READONLY_BBOX_TAGS.has(tag)) return <BoundsFields id={id} axis="size" />;
  return null;
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

/**
 * Read-only world-bbox readout for tags with no editable geometry schema
 * (path/g/text/…). `axis` selects which pair to show so the readout can be
 * split across the Position (x/y) and Layout (width/height) sections.
 */
function BoundsFields({ id, axis }: { id: NodeId; axis: "position" | "size" }) {
  const bounds = useNodeBounds(id);
  if (axis === "position") {
    return (
      <>
        <ReadOnlyField label="x" value={bounds?.x} />
        <ReadOnlyField label="y" value={bounds?.y} />
      </>
    );
  }
  return (
    <>
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
    <PropertyRow>
      <PropertyLineLabel>{label}</PropertyLineLabel>
      <PropertyInput
        type="text"
        value={
          value !== undefined && Number.isFinite(value)
            ? cmath.ui.formatNumber(value, 2)
            : ""
        }
        readOnly
        placeholder="—"
        className="font-mono"
      />
    </PropertyRow>
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
  const preview = usePaintPreview(channel);
  return (
    <PaintRow
      label={channel}
      value={value}
      onSetPaint={(p) => cmd.set_paint(channel, p)}
      preview={preview}
    />
  );
}

// Default solid colors applied when a paint is added via the `+` button.
// Fill picks a neutral placeholder (Figma-style); stroke picks black. SVG's
// own initial values differ — `fill` defaults to black, `stroke` to none —
// which is why the add/remove state keys off the *computed* paint, not the
// presence of an attribute (see `paintExists`).
const FILL_DEFAULT_COLOR = "#d9d9d9";
const STROKE_DEFAULT_COLOR = "#000000";

/**
 * A paint "exists" when its computed value resolves to a real paint — i.e.
 * anything other than `none` (and not an unresolved/invalid value). This is
 * the single source of truth for a paint section's add (`+`) / remove (`−`)
 * state.
 *
 * Note the SVG-default asymmetry: an element with no `fill` attribute
 * computes to black → "exists" (shows `−`); an element with no `stroke`
 * computes to `none` → "absent" (shows `+`).
 */
function paintExists(value: PaintValue): boolean {
  const c = value.computed;
  if (c == null || typeof c !== "object") return false;
  if ("error" in c) return false;
  return c.kind !== "none";
}

/**
 * Boolean-only `paintExists` subscription. `useNodePaint` returns a fresh
 * value every color-drag tick, which would re-render the whole `PaintSection`
 * (header + children) on each frame even though `exists` only flips at the
 * none↔present boundary. Snapshotting to a primitive lets
 * `useSyncExternalStore`'s `Object.is` short-circuit those renders — only
 * `SubscribedPaintRow`, which actually shows the color, re-renders on a drag.
 */
function usePaintExists(id: NodeId, channel: "fill" | "stroke"): boolean {
  const editor = useSvgEditor();
  const subscribe = useCallback(
    (cb: () => void) => editor.subscribe(cb),
    [editor]
  );
  const get = useCallback(
    () => paintExists(editor.node_paint(id, channel)),
    [editor, id, channel]
  );
  return useSyncExternalStore(subscribe, get, get);
}

/**
 * A Fill / Stroke section with Figma-style add / remove. Channel-agnostic so
 * both paint sections share one behavior.
 *
 * - Absent (computed color `none`) → header shows `+`. Clicking it sets ONLY
 *   the color (to `defaultColor`); it does not write any sibling property
 *   (`stroke-width`, cap, join, dash, …) — those are passed as `children`
 *   and are preserved across add/remove, becoming visible again on add.
 * - Present → header shows `−` (remove), which unsets ONLY the color
 *   (`<channel>: none`); sibling attributes remain on the element untouched,
 *   so re-adding restores them.
 *
 * Color and the sibling properties stay orthogonal: toggling a paint on/off
 * never disturbs width or line style.
 */
function PaintSection({
  id,
  channel,
  title,
  defaultColor,
  children,
}: {
  id: NodeId;
  channel: "fill" | "stroke";
  title: string;
  defaultColor: string;
  /** Extra rows (e.g. stroke width / cap / join), shown only when present. */
  children?: React.ReactNode;
}) {
  const cmd = useCommands();
  const exists = usePaintExists(id, channel);
  return (
    <PropertySection className="border-b">
      <PropertySectionHeaderItem>
        <PropertySectionHeaderLabel>{title}</PropertySectionHeaderLabel>
        <PropertySectionHeaderActions>
          {exists ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-5 p-0"
              aria-label={`Remove ${channel}`}
              onClick={() => cmd.set_paint(channel, { kind: "none" })}
            >
              <MinusIcon className="size-3" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="size-5 p-0"
              aria-label={`Add ${channel}`}
              onClick={() =>
                cmd.set_paint(channel, {
                  kind: "color",
                  value: { kind: "rgb", value: defaultColor },
                })
              }
            >
              <PlusIcon className="size-3" />
            </Button>
          )}
        </PropertySectionHeaderActions>
      </PropertySectionHeaderItem>
      {exists && (
        <PropertySectionContent className="flex flex-col gap-2">
          <div className="px-4">
            <SubscribedPaintRow id={id} channel={channel} />
          </div>
          {children}
        </PropertySectionContent>
      )}
    </PropertySection>
  );
}

/**
 * Editable numeric attribute row — geometry (x/y/width/height, cx/cy/r, …) and
 * any other scalar property (stroke-width, rx, font-size). The single
 * parameterized row for every number field in the inspector.
 *
 * Commit semantics, preserved from the original text-input row:
 * - scrub / arrow-key during typing → `usePropertyPreview(name).update(str)`
 *   (many `update`, no history entry)
 * - commit (Enter / blur / arrow) → `update` + `commit()` so the gesture
 *   collapses into a single undo step.
 *
 * `InputPropertyNumber` runs in `auto` mode and emits `editor.api.NumberChange`
 * deltas/sets; `resolveNumberChange` folds them against the current value
 * (read from the same per-leaf subscription) into an absolute string.
 *
 * `label` overrides the row label (defaults to the attribute name); `min`
 * clamps the resolved value (e.g. 0 for non-negative quantities like width /
 * radius / size); `step` sets the scrub/arrow increment.
 */
function NumericPropertyRow({
  id,
  name,
  label = name,
  min,
  step,
}: {
  id: NodeId;
  name: string;
  label?: string;
  min?: number;
  step?: number;
}) {
  const value = useNodeProperty(id, name);
  const preview = usePropertyPreview(name);
  const current = numericOf(value);
  return (
    <PropertyRow>
      <PropertyLineLabel>{label}</PropertyLineLabel>
      <div className="flex w-full gap-1.5 items-center">
        <NumericInputAdapter
          value={current}
          preview={preview}
          resolve={(change) => {
            const n = resolveNumberChange(change, current);
            return min != null ? Math.max(min, n) : n;
          }}
          min={min}
          step={step}
        />
        <ProvenanceChip carrier={value.provenance.carrier} />
      </div>
    </PropertyRow>
  );
}

/**
 * The scrub→commit `NumberChange` handler pair shared by every numeric
 * inspector row. `resolve` folds a change against the row's current value
 * (and applies any clamp); the result is formatted to `precision` decimals and
 * pushed through the property-preview session — many `update` during a scrub,
 * one `commit` on release, so the whole gesture collapses into one undo step.
 */
function numberPreviewHandlers(
  preview: PreviewSession,
  resolve: (change: editor.api.NumberChange) => number,
  precision = 2
) {
  const next = (change: editor.api.NumberChange) =>
    cmath.ui.formatNumber(resolve(change), precision);
  return {
    onValueChange: (change: editor.api.NumberChange) =>
      preview.update(next(change)),
    onValueCommit: (change: editor.api.NumberChange) => {
      preview.update(next(change));
      preview.commit();
    },
  };
}

/**
 * Thin wrapper that routes `InputPropertyNumber`'s `NumberChange` callbacks
 * through the SVG editor's string-based property-preview session. Lives here
 * (host-side adapter) rather than touching the headless control.
 */
function NumericInputAdapter({
  value,
  preview,
  resolve,
  step,
  min,
}: {
  value: number | "";
  preview: PreviewSession;
  resolve: (change: editor.api.NumberChange) => number;
  step?: number;
  min?: number;
}) {
  return (
    <InputPropertyNumber
      mode="auto"
      value={value}
      step={step}
      min={min}
      className="flex-1 font-mono"
      {...numberPreviewHandlers(preview, resolve)}
    />
  );
}

/**
 * Reads the current rotation (degrees) out of the node's `transform` declared
 * string. The editor authors rotation as `transform="rotate(θ cx cy)"` (package
 * doctrine — there is no public rotation getter), so parsing the first
 * `rotate(...)` token is reliable. Defaults to `0` when there's no transform or
 * no `rotate(...)`.
 *
 * Matches `rotate(` then captures the first signed/decimal/exponent number; the
 * optional `cx cy` are not captured.
 */
const ROTATE_RE = /rotate\(\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)/i;

function rotationDegreesOf(value: PropertyValue): number {
  const declared = value.declared;
  if (declared == null) return 0;
  const m = ROTATE_RE.exec(declared);
  if (!m) return 0;
  const n = Number.parseFloat(m[1]);
  return Number.isFinite(n) ? n : 0;
}

// `stroke-linecap` / `stroke-linejoin` segmented tabs. The SVG values are
// the option values verbatim. `PropertyEnumTabs` (the compact tab control,
// no portal) is used instead of the shared Select-based `StrokeCapControl` /
// `StrokeJoinControl`: a Radix Select can't take `modal={false}`, and an
// un-modal'd portal over a canvas surface leaks the close-click to the
// element behind it (controls/README.md). Three options each — a tab
// control is also the tighter UI.
const STROKE_LINECAP_OPTS: { label: string; value: string }[] = [
  { label: "Butt", value: "butt" },
  { label: "Round", value: "round" },
  { label: "Square", value: "square" },
];

const STROKE_LINEJOIN_OPTS: { label: string; value: string }[] = [
  { label: "Miter", value: "miter" },
  { label: "Round", value: "round" },
  { label: "Bevel", value: "bevel" },
];

// `text-anchor` — horizontal alignment of `<text>`/`<tspan>` relative to its
// (x, y) anchor point. The SVG values are the option values verbatim.
const TEXT_ANCHOR_OPTS: { label: string; value: string }[] = [
  { label: "Start", value: "start" },
  { label: "Middle", value: "middle" },
  { label: "End", value: "end" },
];

/**
 * A `PropertyEnumTabs` row bound to a single string property (e.g. stroke
 * cap/join). One `set_property` write per change, one undo step.
 */
function EnumPropertyRow({
  id,
  name,
  label,
  options,
}: {
  id: NodeId;
  name: string;
  label: string;
  options: { label: string; value: string }[];
}) {
  const cmd = useCommands();
  const value = useNodeProperty(id, name);
  const computed =
    typeof value.computed === "string" ? value.computed : undefined;
  return (
    <PropertyRow>
      <PropertyLineLabel>{label}</PropertyLineLabel>
      <div className="flex w-full gap-1.5 items-center">
        <div className="flex-1 min-w-0">
          <PropertyEnumTabs
            enum={options}
            value={computed}
            onValueChange={(v) => cmd.set_property(name, v)}
          />
        </div>
        <ProvenanceChip carrier={value.provenance.carrier} />
      </div>
    </PropertyRow>
  );
}

/**
 * `font-family` row — the Google-Fonts picker. Reads the computed family (a
 * string for this non-numeric property), and on pick writes the bare family
 * name via `set_property` (one undo step) and asks the host to load its
 * stylesheet so the canvas re-renders in the chosen font.
 */
function FontFamilyRow({ id }: { id: NodeId }) {
  const cmd = useCommands();
  const value = useNodeProperty(id, "font-family");
  const family =
    typeof value.computed === "string"
      ? value.computed
      : (value.declared ?? "");
  return (
    <PropertyRow>
      <PropertyLineLabel>font</PropertyLineLabel>
      <div className="flex w-full gap-1.5 items-center">
        <div className="flex-1 min-w-0">
          <FontFamilyPicker
            value={family}
            onSelect={(f) => {
              ensureGoogleFont(f);
              cmd.set_property("font-family", f);
            }}
          />
        </div>
        <ProvenanceChip carrier={value.provenance.carrier} />
      </div>
    </PropertyRow>
  );
}

/**
 * `stroke-dasharray` — freeform string (e.g. `"4 2"`). Bound to `.declared`;
 * on blur/Enter, writes the string, or `null` (removes the attr) when empty.
 * One undo step per commit. Kept freeform for now — no structured editor.
 */
function StrokeDashRow({ id }: { id: NodeId }) {
  const cmd = useCommands();
  const value = useNodeProperty(id, "stroke-dasharray");
  const declared = value.declared ?? "";
  const commit = (next: string) =>
    cmd.set_property("stroke-dasharray", next === "" ? null : next);
  return (
    <PropertyRow>
      <PropertyLineLabel>dash</PropertyLineLabel>
      <div className="flex w-full gap-1.5 items-center">
        <PropertyInput
          type="text"
          // `key` resets the uncontrolled input's text when the underlying
          // value changes externally (undo/redo, selection change).
          key={declared}
          defaultValue={declared}
          placeholder="e.g. 4 2"
          className="flex-1 font-mono"
          onBlur={(e) => {
            const next = e.currentTarget.value.trim();
            if (next !== declared) commit(next);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <ProvenanceChip carrier={value.provenance.carrier} />
      </div>
    </PropertyRow>
  );
}

/**
 * `transform` rotation, in degrees.
 *
 * Commit-only: wires `onValueCommit` (NOT `onValueChange`) → `cmd.rotate_to`,
 * which takes radians, is absolute, and auto-pivots on the selection bbox
 * center (uses the attached surface, present in the demo). There is no rotate
 * preview session, so a continuous scrub would push one history entry per tick;
 * commit-only gives exactly one undo step per change.
 *
 * Gated to a single non-`<svg>` selection by the caller.
 */
function RotateRow({ id, tag }: { id: NodeId; tag?: string }) {
  const cmd = useCommands();
  const value = useNodeProperty(id, "transform");
  if (!tag || tag === "svg") return null;
  const degrees = rotationDegreesOf(value);
  return (
    <PropertyRow>
      <PropertyLineLabel>rotate</PropertyLineLabel>
      <div className="flex w-full gap-1.5 items-center">
        <InputPropertyNumber
          mode="auto"
          value={degrees}
          step={1}
          suffix="°"
          className="flex-1 font-mono"
          onValueCommit={(change) =>
            cmd.rotate_to(
              (resolveNumberChange(change, degrees) * Math.PI) / 180
            )
          }
        />
        {/* Each is one atomic command → one undo step. `rotate` composes a
            +90° turn (clockwise in SVG's y-down space); `transform` flips
            in place about the selection bbox center. */}
        <Button
          variant="ghost"
          size="icon"
          className="size-6 p-0"
          aria-label="Rotate 90° right"
          onClick={() => cmd.rotate(Math.PI / 2)}
        >
          <RotateCwIcon className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 p-0"
          aria-label="Flip horizontal"
          onClick={() => cmd.transform([-1, 0, 0, 1, 0, 0])}
        >
          <FlipHorizontalIcon className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 p-0"
          aria-label="Flip vertical"
          onClick={() => cmd.transform([1, 0, 0, -1, 0, 0])}
        >
          <FlipVerticalIcon className="size-3.5" />
        </Button>
        <ProvenanceChip carrier={value.provenance.carrier} />
      </div>
    </PropertyRow>
  );
}

/**
 * `opacity` — the unitless [0,1] CSS opacity, shown as a percentage.
 *
 * Uses `InputPropertyPercentage` (decimal in, "%"-suffixed display) rather
 * than the Canvas `OpacityControl`: the latter bundles a slider whose
 * `onValueChange` commits on every tick, which would make a single drag many
 * undo steps. The percentage input keeps the original text-field's clean
 * scrub (`onValueChange`) → single-`commit` semantics (constraint: one-step
 * undo per gesture).
 */
function OpacityRow({ id }: { id: NodeId }) {
  const value = useNodeProperty(id, "opacity");
  const preview = usePropertyPreview("opacity");
  const current = numericOf(value);
  const resolved = current === "" ? 1 : current;
  return (
    <PropertyRow>
      <PropertyLineLabel>opacity</PropertyLineLabel>
      <div className="flex w-full gap-1.5 items-center">
        <InputPropertyPercentage
          mode="auto"
          type="number"
          value={resolved}
          min={0}
          max={1}
          step={0.01}
          className="flex-1"
          {...numberPreviewHandlers(
            preview,
            (change) => clamp01(resolveNumberChange(change, resolved)),
            4
          )}
        />
        <ProvenanceChip carrier={value.provenance.carrier} />
      </div>
    </PropertyRow>
  );
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

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
      className="justify-between px-4 mb-1"
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
