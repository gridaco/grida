import React from "react";
import { CaretDownIcon } from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WorkbenchUI } from "@/components/workbench";
import { Input } from "@/components/ui/input";
import { useTransformState } from "@/grida-canvas-react/provider";
import { cn } from "@/components/lib/utils";
import {
  useCurrentEditor,
  useEditorState,
} from "@/grida-canvas-react/use-editor";

export function ZoomControl({ className }: { className?: string }) {
  const editor = useCurrentEditor();
  const ruler = useEditorState(editor, (state) => state.ruler);
  const pixelgrid = useEditorState(editor, (state) => state.pixelgrid);
  const { scaleX } = useTransformState();

  const pct = Math.round(scaleX * 100);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn("flex items-center", className)}>
        <span className="text-xs text-muted-foreground">{pct + "%"}</span>
        <CaretDownIcon className="ms-1" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end" className="min-w-52">
        <Input
          type="number"
          value={pct + ""}
          min={2}
          step={1}
          max={256}
          onChange={(e) => {
            const v = parseInt(e.target.value) / 100;
            if (v) editor.scale(v, "center");
          }}
          className={WorkbenchUI.inputVariants({ size: "sm" })}
        />
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={false}
          onSelect={editor.zoomIn}
          className="text-xs"
        >
          Zoom in
          <DropdownMenuShortcut>⌘+</DropdownMenuShortcut>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={false}
          onSelect={editor.zoomOut}
          className="text-xs"
        >
          Zoom out
          <DropdownMenuShortcut>⌘-</DropdownMenuShortcut>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={false}
          onSelect={() => editor.fit("*")}
          className="text-xs"
        >
          Zoom to fit
          <DropdownMenuShortcut>⇧1</DropdownMenuShortcut>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={false}
          onSelect={() => editor.fit("selection")}
          className="text-xs"
        >
          Zoom to selection
          <DropdownMenuShortcut>⇧2</DropdownMenuShortcut>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={false}
          onSelect={() => editor.scale(0.5, "center")}
          className="text-xs"
        >
          Zoom to 50%
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={false}
          onSelect={() => editor.scale(1, "center")}
          className="text-xs"
        >
          Zoom to 100%
          <DropdownMenuShortcut className="text-xs">⇧0</DropdownMenuShortcut>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={false}
          onSelect={() => editor.scale(2, "center")}
          className="text-xs"
        >
          Zoom to 200%
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={pixelgrid === "on"}
          onSelect={() => {
            editor.togglePixelGrid();
          }}
          className="text-xs"
        >
          Pixel Grid
          <DropdownMenuShortcut>⇧'</DropdownMenuShortcut>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={ruler === "on"}
          onSelect={() => {
            editor.toggleRuler();
          }}
          className="text-xs"
        >
          Ruler
          <DropdownMenuShortcut>⇧R</DropdownMenuShortcut>
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
