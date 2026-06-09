"use client";

import { useMemo, useState } from "react";
import {
  useCommands,
  useSelection,
  useSvgEditor,
} from "@grida/svg-editor/react";
import type { NodeId, ReorderDirection } from "@grida/svg-editor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@app/ui/components/dropdown-menu";

/**
 * Shared right-click context menu for the SVG editor demo, used by both the
 * canvas surface ({@link SvgCanvasContextMenu}) and the layers tree
 * ({@link SvgTreeRowContextMenu}). The menu body ({@link SvgContextMenuItems})
 * and its action bindings ({@link useSvgContextMenuActions}) are factored out
 * so the two triggers render the exact same items with zero duplication.
 *
 * This is modeled on the main Grida Canvas context menu
 * (`grida-canvas-react/viewport/surface-context-menu.tsx`), mirroring only the
 * subset the SVG editor's closed command set supports: z-order, group, ungroup
 * (clean-structural subset only — see package TODO §10), flatten transform,
 * hide/show, delete. There is no copy / paste / duplicate / mask command in the
 * package, so those rows are omitted.
 */

/**
 * Binds the context-menu action set to the current selection. Reads
 * `useSelection()` so the menu reflects (and re-renders on) selection changes
 * without broadening any per-leaf subscriptions. All callbacks are
 * selection-scoped — the package's commands operate on the live selection, so
 * the trigger is responsible for selecting the right node before opening (see
 * {@link SvgCanvasContextMenu}).
 */
export function useSvgContextMenuActions() {
  const editor = useSvgEditor();
  const cmd = useCommands();
  const selection = useSelection();

  return useMemo(() => {
    const hasSelection = selection.length >= 1;
    // The package's `group()` requires 2+ nodes.
    const canGroup = selection.length >= 2;
    const first = selection[0] as NodeId | undefined;
    const isSingleGroup =
      selection.length === 1 &&
      editor.tree().nodes.get(selection[0])?.tag === "g";

    // Hidden state keys off the first selected node's resolved `visibility`,
    // matching the inspector's eye toggle.
    const visibility = first
      ? editor.node_properties(first, ["visibility"])["visibility"]
      : undefined;
    const hidden =
      visibility?.computed === "hidden" || visibility?.declared === "hidden";

    return {
      hasSelection,
      canGroup,
      isSingleGroup,
      hidden,
      reorder: (dir: ReorderDirection) => cmd.reorder(dir),
      group: () => cmd.group(),
      // Dissolve the selected <g>. The package's `ungroup` accepts only the
      // safe clean-structural subset (TODO §10): a group that carries visual
      // state (opacity / class / style / filter / clip-path / mask / fill),
      // is referenced by <use>, lives in <defs>, or is animation-bearing
      // refuses with a no-op. We render the item enabled for any single <g>
      // (no `can_ungroup` API exists) and let that refusal be the gate — a
      // stateful group's Ungroup is simply inert.
      ungroup: () => cmd.ungroup(),
      flattenTransform: () => cmd.flatten_transform(),
      // Selection-scoped: applies to all selected. Show writes `null` (removes
      // the attribute) for a clean round-trip; hide writes `"hidden"`.
      toggleHidden: () =>
        cmd.set_property("visibility", hidden ? null : "hidden"),
      remove: () => cmd.remove(),
    };
  }, [editor, cmd, selection]);
}

/**
 * The shared menu body. Renders `DropdownMenuItem` rows reading
 * {@link useSvgContextMenuActions}. Items use `onSelect` (Radix's keyboard- and
 * pointer-aware activation) rather than `onClick`. Both the canvas and the tree
 * render this verbatim inside their own controlled menu.
 */
export function SvgContextMenuItems() {
  const actions = useSvgContextMenuActions();
  return (
    <>
      {/* ── Z-order ── */}
      <DropdownMenuItem
        className="text-xs"
        disabled={!actions.hasSelection}
        onSelect={() => actions.reorder("bring_to_front")}
      >
        Bring to front
        <DropdownMenuShortcut>]</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem
        className="text-xs"
        disabled={!actions.hasSelection}
        onSelect={() => actions.reorder("bring_forward")}
      >
        Bring forward
      </DropdownMenuItem>
      <DropdownMenuItem
        className="text-xs"
        disabled={!actions.hasSelection}
        onSelect={() => actions.reorder("send_backward")}
      >
        Send backward
      </DropdownMenuItem>
      <DropdownMenuItem
        className="text-xs"
        disabled={!actions.hasSelection}
        onSelect={() => actions.reorder("send_to_back")}
      >
        Send to back
        <DropdownMenuShortcut>[</DropdownMenuShortcut>
      </DropdownMenuItem>

      {/* ── Group / Ungroup ── */}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        className="text-xs"
        disabled={!actions.canGroup}
        onSelect={() => actions.group()}
      >
        Group
        <DropdownMenuShortcut>⌘G</DropdownMenuShortcut>
      </DropdownMenuItem>
      {actions.isSingleGroup && (
        // Functional for any single <g>. The package's `ungroup` accepts only
        // the safe clean-structural subset (TODO §10); for a group carrying
        // visual state it no-ops (refuses) rather than mangling the render —
        // we leave the item enabled and let that refusal be the gate (there's
        // intentionally no `can_ungroup` API to interrogate).
        <DropdownMenuItem
          className="text-xs"
          onSelect={() => actions.ungroup()}
        >
          Ungroup
          <DropdownMenuShortcut>⇧⌘G</DropdownMenuShortcut>
        </DropdownMenuItem>
      )}

      {/* ── Flatten transform ── */}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        className="text-xs"
        disabled={!actions.hasSelection}
        onSelect={() => actions.flattenTransform()}
      >
        Flatten transform
      </DropdownMenuItem>

      {/* ── Hide / Show ── */}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        className="text-xs"
        disabled={!actions.hasSelection}
        onSelect={() => actions.toggleHidden()}
      >
        {actions.hidden ? "Show" : "Hide"}
        <DropdownMenuShortcut>⇧⌘H</DropdownMenuShortcut>
      </DropdownMenuItem>

      {/* ── Delete ── */}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        className="text-xs text-destructive focus:text-destructive"
        disabled={!actions.hasSelection}
        onSelect={() => actions.remove()}
      >
        Delete
        <DropdownMenuShortcut>⌫</DropdownMenuShortcut>
      </DropdownMenuItem>
    </>
  );
}

/**
 * A controlled context menu positioned at a screen point. Built on
 * `DropdownMenu` (controlled `open`) rather than Radix `ContextMenu`, because
 * the DOM surface `preventDefault()`s the `contextmenu` event before React's
 * synthetic dispatch — and Radix's `ContextMenuTrigger` (via
 * `composeEventHandlers`) refuses to open when the event is already
 * `defaultPrevented`. So the canvas would never open an auto-triggered
 * ContextMenu. Instead the host owns the `onContextMenu` handler (which fires
 * regardless of `defaultPrevented`) and opens this menu imperatively at the
 * cursor via a 0-size fixed virtual anchor.
 */
function useContextMenuAt() {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const open = (e: React.MouseEvent, before?: () => void) => {
    e.preventDefault();
    before?.();
    setPos({ x: e.clientX, y: e.clientY });
  };
  return { pos, open, close: () => setPos(null) };
}

function ContextMenuAt({
  pos,
  onClose,
  children,
}: {
  pos: { x: number; y: number } | null;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu open={!!pos} onOpenChange={(o) => !o && onClose()}>
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden
          className="fixed h-0 w-0"
          style={{ left: pos?.x ?? 0, top: pos?.y ?? 0 }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom" sideOffset={2}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Wraps the canvas surface and opens the shared context menu on right-click.
 * Before opening, selects the hovered node (unless already selected) so the
 * menu acts on the element under the pointer — mirroring the main Canvas editor.
 *
 * Uses the host-owned `onContextMenu` + controlled {@link ContextMenuAt} rather
 * than Radix's auto-trigger: the DOM surface `preventDefault()`s the
 * `contextmenu` event before React's synthetic dispatch, which suppresses an
 * auto-triggered Radix `ContextMenu` (it won't open on a pre-prevented event).
 * Our own `onContextMenu` still fires, so we open the menu imperatively.
 */
export function SvgCanvasContextMenu({
  children,
}: {
  children: React.ReactNode;
}) {
  const editor = useSvgEditor();
  const cmd = useCommands();
  const selection = useSelection();
  const menu = useContextMenuAt();

  return (
    <div
      className="absolute inset-0"
      data-testid="svg-canvas-context-menu"
      onContextMenu={(e) =>
        menu.open(e, () => {
          const hovered = editor.surface_hover();
          if (hovered && !selection.includes(hovered)) cmd.select(hovered);
        })
      }
    >
      {children}
      <ContextMenuAt pos={menu.pos} onClose={menu.close}>
        <SvgContextMenuItems />
      </ContextMenuAt>
    </div>
  );
}

/**
 * Wraps a single layers-tree row. On right-click, selects `id` first (unless
 * already in the selection) and opens the shared menu at the cursor. Same
 * controlled mechanism as {@link SvgCanvasContextMenu}.
 */
export function SvgTreeRowContextMenu({
  id,
  children,
}: {
  id: NodeId;
  children: React.ReactNode;
}) {
  const cmd = useCommands();
  const selection = useSelection();
  const menu = useContextMenuAt();

  return (
    <div
      className="contents"
      onContextMenu={(e) =>
        menu.open(e, () => {
          if (!selection.includes(id)) cmd.select(id);
        })
      }
    >
      {children}
      <ContextMenuAt pos={menu.pos} onClose={menu.close}>
        <SvgContextMenuItems />
      </ContextMenuAt>
    </div>
  );
}
