import React from "react";
import { CaretDownIcon } from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
import { keyboardShortcutText } from "@/grida-canvas-hosted/playground/uxhost-shortcut-renderer";

export function ZoomControl({ className }: { className?: string }) {
  const editor = useCurrentEditor();
  const ruler = useEditorState(editor, (state) => state.ruler);
  const pixelgrid = useEditorState(editor, (state) => state.pixelgrid);
  const pixelpreview = useEditorState(editor, (state) => state.pixelpreview);
  const outline_mode = useEditorState(editor, (state) => state.outline_mode);
  const outline_mode_ignores_clips = useEditorState(
    editor,
    (state) => state.outline_mode_ignores_clips
  );
  const { scaleX } = useTransformState();

  const pct = Math.round(scaleX * 100);

  return (
    <DropdownMenu modal={false}>
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
            if (v) editor.camera.scale(v, "center");
          }}
          className={WorkbenchUI.inputVariants({ size: "sm" })}
        />
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={false}
          onSelect={editor.camera.zoomIn.bind(editor)}
          className="text-xs"
        >
          Zoom in
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.view.zoom-in")}
          </DropdownMenuShortcut>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={false}
          onSelect={editor.camera.zoomOut.bind(editor)}
          className="text-xs"
        >
          Zoom out
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.view.zoom-out")}
          </DropdownMenuShortcut>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={false}
          onSelect={() => editor.camera.fit("*")}
          className="text-xs"
        >
          Zoom to fit
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.view.zoom-to-fit")}
          </DropdownMenuShortcut>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={false}
          onSelect={() => editor.camera.fit("selection")}
          className="text-xs"
        >
          Zoom to selection
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.view.zoom-to-selection")}
          </DropdownMenuShortcut>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={false}
          onSelect={() => editor.camera.scale(0.5, "center")}
          className="text-xs"
        >
          Zoom to 50%
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={false}
          onSelect={() => editor.camera.scale(1, "center")}
          className="text-xs"
        >
          Zoom to 100%
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.view.zoom-to-100")}
          </DropdownMenuShortcut>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={false}
          onSelect={() => editor.camera.scale(2, "center")}
          className="text-xs"
        >
          Zoom to 200%
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs">
            Outlines
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-40">
            <DropdownMenuCheckboxItem
              checked={outline_mode === "on"}
              onSelect={() => {
                editor.surface.surfaceToggleOutlineMode();
              }}
              className="text-xs"
            >
              Show outlines
              <DropdownMenuShortcut>
                {keyboardShortcutText(
                  "workbench.surface.view.toggle-outline-mode"
                )}
              </DropdownMenuShortcut>
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={outline_mode_ignores_clips}
              disabled={outline_mode !== "on"}
              onSelect={() => {
                editor.surface.surfaceToggleOutlineModeIgnoresClips();
              }}
              className="text-xs"
            >
              Ignore clips content
            </DropdownMenuCheckboxItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs">
            Pixel preview
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-40">
            <DropdownMenuRadioGroup
              value={pixelpreview}
              onValueChange={(v) => {
                editor.surface.surfaceConfigurePixelPreviewScale(
                  v as "disabled" | "1x" | "2x"
                );
              }}
            >
              <DropdownMenuRadioItem value="disabled" className="text-xs">
                Disabled
                <DropdownMenuShortcut>
                  {keyboardShortcutText(
                    "workbench.surface.view.toggle-pixel-preview"
                  )}
                </DropdownMenuShortcut>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="1x" className="text-xs">
                1x
                <DropdownMenuShortcut>
                  {keyboardShortcutText(
                    "workbench.surface.view.toggle-pixel-preview"
                  )}
                </DropdownMenuShortcut>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="2x" className="text-xs">
                2x
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuCheckboxItem
          checked={pixelgrid === "on"}
          onSelect={() => {
            editor.surface.surfaceTogglePixelGrid();
          }}
          className="text-xs"
        >
          Pixel Grid
          <DropdownMenuShortcut>
            {keyboardShortcutText(
              "workbench.surface.view.hide-show-pixel-grid"
            )}
          </DropdownMenuShortcut>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={ruler === "on"}
          onSelect={() => {
            editor.surface.surfaceToggleRuler();
          }}
          className="text-xs"
        >
          Ruler
          <DropdownMenuShortcut>
            {keyboardShortcutText("workbench.surface.view.hide-show-ruler")}
          </DropdownMenuShortcut>
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
