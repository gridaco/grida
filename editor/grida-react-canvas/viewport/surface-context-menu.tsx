import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  useDataTransferEventTarget,
  useDocument,
  useSelection,
} from "../provider";
import { toast } from "sonner";
import { cn } from "@/components/lib/utils";

export function EditorSurfaceContextMenu({
  children,
  className,
}: React.PropsWithChildren<{ className?: string }>) {
  const { selection, paste, order, autoLayout, contain, deleteNode } =
    useDocument();
  const { insertText } = useDataTransferEventTarget();
  const { actions } = useSelection();

  const has_selection = selection.length > 0;
  const can_copy = has_selection;
  const can_send_to_back = has_selection;
  const can_bring_to_front = has_selection;
  // const can_toggle_active = has_selection;
  // const can_toggle_locked = has_selection;
  // TODO: valid ids (not locked, not active, not root)
  // const can_select_layer = state.hits.length >= 2;

  const handlePaste = async (e: Event) => {
    try {
      const clipboardItems = await navigator.clipboard.read();
      if (clipboardItems.length > 0) {
        for (const clipboardItem of clipboardItems) {
          // only handles text/plain via navigator.clipboard
          if (clipboardItem.types.includes("text/plain")) {
            const blob = await clipboardItem.getType("text/plain");
            const text = await blob.text();
            insertText(text, {
              clientX: window.innerWidth / 2,
              clientY: window.innerHeight / 2,
            });
            return;
          }
        }
      }
      paste();
    } catch (e) {}
  };

  //
  return (
    <ContextMenu>
      <ContextMenuTrigger className={cn("w-full h-full", className)}>
        {children}
      </ContextMenuTrigger>
      {/* TODO: disable events via portal, so the canvas won't be pannable while context menu is open */}
      <ContextMenuContent className="min-w-52">
        <ContextMenuItem
          disabled={!can_copy}
          onSelect={actions.copy}
          className="text-xs"
        >
          Copy
        </ContextMenuItem>
        <ContextMenuItem onSelect={handlePaste} className="text-xs">
          Paste
          {/* TODO: with cursor pos "Paste here" */}
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
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={!has_selection}
          onSelect={() => {
            contain("selection");
          }}
          className="text-xs"
        >
          Group with Container
          <ContextMenuShortcut>{"⌥⌘G"}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!has_selection}
          onSelect={() => {
            autoLayout("selection");
          }}
          className="text-xs"
        >
          Auto-Layout
          <ContextMenuShortcut>{"⇧A"}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={!has_selection}
          onSelect={() => {
            deleteNode("selection");
          }}
          className="text-xs"
        >
          Delete
          <ContextMenuShortcut>{"⌫"}</ContextMenuShortcut>
        </ContextMenuItem>

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
        <ContextMenuSeparator />
        <ContextMenuItem
          className="py-1"
          onSelect={() => {
            // copy id
            navigator.clipboard.writeText(selection.join(", ")).then(() => {
              toast.success("Copied ID to clipboard");
            });
          }}
        >
          <span className="font-mono text-[9px] text-muted-foreground">
            ID: {selection.join(", ")}
          </span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
