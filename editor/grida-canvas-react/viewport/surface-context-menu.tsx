import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useSelectionState, useEditorFlagsState } from "../provider";
import { toast } from "sonner";
import { cn } from "@/components/lib/utils";
import {
  useContextMenuActions,
  ContextMenuAction,
} from "../use-context-menu-actions";

export function EditorSurfaceContextMenu({
  children,
  className,
}: React.PropsWithChildren<{ className?: string }>) {
  const { selection } = useSelectionState();
  const { debug } = useEditorFlagsState();
  const actions = useContextMenuActions(selection);

  const ActionItem = ({ action }: { action: ContextMenuAction }) => (
    <ContextMenuItem
      onSelect={action.onSelect}
      disabled={action.disabled}
      className="text-xs"
    >
      {action.label}
      {action.shortcut && (
        <ContextMenuShortcut>{action.shortcut}</ContextMenuShortcut>
      )}
    </ContextMenuItem>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger className={cn("w-full h-full", className)}>
        {children}
      </ContextMenuTrigger>
      {/* TODO: disable events via portal, so the canvas won't be pannable while context menu is open */}
      <ContextMenuContent className="w-52">
        <ActionItem action={actions.copy} />
        <ActionItem action={actions.paste} />
        <ContextMenuSeparator />
        <ActionItem action={actions.bringToFront} />
        <ActionItem action={actions.sendToBack} />
        <ContextMenuSeparator />
        <ActionItem action={actions.flatten} />
        <ContextMenuSeparator />
        <ActionItem action={actions.groupWithContainer} />
        <ActionItem action={actions.group} />
        <ActionItem action={actions.autoLayout} />
        <ContextMenuSeparator />
        <ActionItem action={actions.zoomToFit} />
        <ContextMenuSeparator />
        <ActionItem action={actions.toggleActive} />
        <ActionItem action={actions.toggleLocked} />
        <ContextMenuSeparator />
        <ActionItem action={actions.delete} />

        {debug && (
          <>
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
              <span className="font-mono text-[9px] text-muted-foreground truncate">
                ID: {selection.join(", ")}
              </span>
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
