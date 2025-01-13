import React from "react";
import { CaretDownIcon } from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WorkbenchUI } from "@/components/workbench";
import { cmath } from "@grida/cmath";
import { Input } from "@/components/ui/input";
import { useTransform } from "@/grida-react-canvas/provider";
import { cn } from "@/utils";

export function ZoomControl({ className }: { className?: string }) {
  const { transform, scale, fit, zoomIn, zoomOut } = useTransform();

  const [scaleX, scaleY] = cmath.transform.getScale(transform);

  const pct = Math.round(scaleX * 100);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn("flex items-center", className)}>
        <span className="text-xs text-muted-foreground">{pct + "%"}</span>
        <CaretDownIcon className="ms-1" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end" className="min-w-36">
        <Input
          type="number"
          value={pct + ""}
          min={2}
          step={1}
          max={256}
          onChange={(e) => {
            const v = parseInt(e.target.value) / 100;
            if (v) scale(v, "center");
          }}
          className={WorkbenchUI.inputVariants({ size: "sm" })}
        />
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={zoomIn} className="text-xs">
          Zoom in
          <DropdownMenuShortcut>⌘+</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={zoomOut} className="text-xs">
          Zoom out
          <DropdownMenuShortcut>⌘-</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => fit("*")} className="text-xs">
          Zoom to fit
          <DropdownMenuShortcut>⇧1</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => fit("selection")} className="text-xs">
          Zoom to selection
          <DropdownMenuShortcut>⇧2</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => scale(0.5, "center")}
          className="text-xs"
        >
          Zoom to 50%
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => scale(1, "center")}
          className="text-xs"
        >
          Zoom to 100%
          <DropdownMenuShortcut className="text-xs">⇧0</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => scale(2, "center")}
          className="text-xs"
        >
          Zoom to 200%
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
