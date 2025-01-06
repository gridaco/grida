import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useDocument, useSelection } from "../provider";

export function EditorSurfaceContextMenu({
  children,
}: React.PropsWithChildren<{}>) {
  const { selection, state, paste, order } = useDocument();
  const { actions } = useSelection();

  const has_selection = selection.length > 0;
  const can_copy = has_selection;
  const can_send_to_back = has_selection;
  const can_bring_to_front = has_selection;
  const can_toggle_active = has_selection;
  const can_toggle_locked = has_selection;
  // TODO: valid ids (not locked, not active, not root)
  const can_select_layer = state.surface_raycast_detected_node_ids.length >= 2;

  //
  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-52">
        <ContextMenuItem
          disabled={!can_copy}
          onSelect={actions.copy}
          className="text-xs"
        >
          Copy
        </ContextMenuItem>
        <ContextMenuItem onSelect={paste} className="text-xs">
          Paste here
        </ContextMenuItem>
        <ContextMenuSeparator />
        {/* <ContextMenuItem disabled={!can_select_layer}>
          Select Layer
        </ContextMenuItem> */}

        <ContextMenuItem
          disabled={!can_bring_to_front}
          onSelect={() => {
            order("selection", "front");
          }}
          className="text-xs"
        >
          Bring to front
          <ContextMenuShortcut>{"]"}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!can_send_to_back}
          onSelect={() => {
            order("selection", "back");
          }}
          className="text-xs"
        >
          Send to back
          <ContextMenuShortcut>{"["}</ContextMenuShortcut>
        </ContextMenuItem>
        {/* <ContextMenuSeparator /> */}
        {/* <ContextMenuItem
          disabled={!can_toggle_active}
          // onSelect={actions}
        >
          Set Active/Inactive
          <ContextMenuShortcut>{"⌘⇧H"}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!can_toggle_locked}
          // onSelect={change.toggleLocked}
        >
          Lock/Unlock
          <ContextMenuShortcut>{"⌘⇧L"}</ContextMenuShortcut>
        </ContextMenuItem> */}
      </ContextMenuContent>
    </ContextMenu>
  );
}
