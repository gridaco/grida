import {
  ActionGroup,
  ActionGroupItem,
} from "@/components/ui-editor/action-group";
import { Button } from "@/components/ui-editor/button";
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
import { cn } from "@/components/lib/utils/index";

export function AlignControl({
  disabled,
  onAlign,
  onDistributeEvenly,
  className,
}: {
  disabled?: boolean;
  onAlign?: (alignment: {
    horizontal?: "none" | "min" | "max" | "center";
    vertical?: "none" | "min" | "max" | "center";
  }) => void;
  onDistributeEvenly?: (axis: "x" | "y") => void;
  className?: string;
}) {
  return (
    <div
      className={cn("w-full flex items-center justify-center gap-1", className)}
    >
      <HorizontalItems disabled={disabled} onAlign={onAlign} />
      <VerticalItems disabled={disabled} onAlign={onAlign} />
      <ActionGroup size="icon" variant="outline">
        <Item
          disabled={disabled}
          tooltip="Distribute horizontally"
          onClick={() => {
            onDistributeEvenly?.("x");
          }}
        >
          <SpaceEvenlyHorizontallyIcon />
        </Item>
        <Item
          disabled={disabled}
          tooltip="Distribute vertically"
          onClick={() => {
            onDistributeEvenly?.("y");
          }}
        >
          <SpaceEvenlyVerticallyIcon />
        </Item>
      </ActionGroup>
    </div>
  );
}

function HorizontalItems({
  disabled,
  onAlign,
}: {
  disabled?: boolean;
  onAlign?: (alignment: {
    horizontal?: "none" | "min" | "max" | "center";
  }) => void;
}) {
  return (
    <ActionGroup size="icon" variant="outline">
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
    </ActionGroup>
  );
}

function VerticalItems({
  disabled,
  onAlign,
}: {
  disabled?: boolean;
  onAlign?: (alignment: {
    vertical?: "none" | "min" | "max" | "center";
  }) => void;
}) {
  return (
    <ActionGroup size="icon" variant="outline">
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
    </ActionGroup>
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
        <ActionGroupItem
          disabled={disabled}
          onClick={onClick}
          className="[&_svg:not([class*='size-'])]:size-3"
        >
          {children}
        </ActionGroupItem>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
