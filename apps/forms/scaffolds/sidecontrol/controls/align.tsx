import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlignTopIcon,
  AlignRightIcon,
  AlignLeftIcon,
  AlignBottomIcon,
  AlignCenterHorizontallyIcon,
  AlignCenterVerticallyIcon,
  SpaceEvenlyHorizontallyIcon,
  SpaceEvenlyVerticallyIcon,
} from "@radix-ui/react-icons";
import React from "react";

export function AlignControl({
  disabled,
  onAlign,
}: {
  disabled?: boolean;
  onAlign?: (alignment: {
    horizontal?: "none" | "min" | "max" | "center";
    vertical?: "none" | "min" | "max" | "center";
  }) => void;
}) {
  return (
    <div className="w-full flex items-center gap-2">
      <div className="flex items-center gap-0 justify-center">
        <Item
          disabled={disabled}
          tooltip="Align left"
          onClick={() => {
            onAlign?.({ horizontal: "min" });
          }}
        >
          <AlignLeftIcon />
        </Item>
        <Item
          disabled={disabled}
          tooltip="Align horizontal center"
          onClick={() => {
            onAlign?.({ horizontal: "center" });
          }}
        >
          <AlignCenterHorizontallyIcon />
        </Item>
        <Item
          disabled={disabled}
          tooltip="Align right"
          onClick={() => {
            onAlign?.({ horizontal: "max" });
          }}
        >
          <AlignRightIcon />
        </Item>
      </div>
      <div className="flex items-center gap-0 justify-center">
        <Item
          disabled={disabled}
          tooltip="Align top"
          onClick={() => {
            onAlign?.({ vertical: "min" });
          }}
        >
          <AlignTopIcon />
        </Item>
        <Item
          disabled={disabled}
          tooltip="Align vertical center"
          onClick={() => {
            onAlign?.({ vertical: "center" });
          }}
        >
          <AlignCenterVerticallyIcon />
        </Item>
        <Item
          disabled={disabled}
          tooltip="Align bottom"
          onClick={() => {
            onAlign?.({ vertical: "max" });
          }}
        >
          <AlignBottomIcon />
        </Item>
      </div>
      <div className="flex items-center gap-0 justify-center">
        <Item
          disabled={disabled}
          tooltip="Distribute horizontally"
          onClick={() => {
            // onAlign?.({ vertical: "min" });
          }}
        >
          <SpaceEvenlyHorizontallyIcon />
        </Item>
        <Item
          disabled={disabled}
          tooltip="Distribute vertically"
          onClick={() => {
            // onAlign?.({ vertical: "center" });
          }}
        >
          <SpaceEvenlyVerticallyIcon />
        </Item>
      </div>
    </div>
  );
}

function Item({
  tooltip,
  children,
  disabled,
  onClick,
}: React.PropsWithChildren<{
  tooltip: string;
  disabled?: boolean;
  onClick?: () => void;
}>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className="p-1"
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
