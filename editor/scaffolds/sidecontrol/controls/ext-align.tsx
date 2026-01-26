import { ButtonGroup } from "@/components/ui/button-group";
import { buttonVariants } from "@/components/ui-editor/button";
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
      data-testid="ext-align"
      className={cn("w-full flex items-center justify-center gap-1", className)}
    >
      <HorizontalItems disabled={disabled} onAlign={onAlign} />
      <VerticalItems disabled={disabled} onAlign={onAlign} />
      <ButtonGroup>
        <Item
          disabled={disabled}
          tooltip="Distribute horizontally"
          onClick={() => {
            onDistributeEvenly?.("x");
          }}
        >
          <SpaceEvenlyHorizontallyIcon className="size-2.5" />
        </Item>
        <Item
          disabled={disabled}
          tooltip="Distribute vertically"
          onClick={() => {
            onDistributeEvenly?.("y");
          }}
        >
          <SpaceEvenlyVerticallyIcon className="size-2.5" />
        </Item>
      </ButtonGroup>
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
    <ButtonGroup>
      <Item
        disabled={disabled}
        tooltip="Align left"
        onClick={() => {
          onAlign?.({ horizontal: "min" });
        }}
      >
        <AlignLeftIcon className="size-2.5" />
      </Item>
      <Item
        disabled={disabled}
        tooltip="Align horizontal center"
        onClick={() => {
          onAlign?.({ horizontal: "center" });
        }}
      >
        <AlignCenterHorizontallyIcon className="size-2.5" />
      </Item>
      <Item
        disabled={disabled}
        tooltip="Align right"
        onClick={() => {
          onAlign?.({ horizontal: "max" });
        }}
      >
        <AlignRightIcon className="size-2.5" />
      </Item>
    </ButtonGroup>
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
    <ButtonGroup>
      <Item
        disabled={disabled}
        tooltip="Align top"
        onClick={() => {
          onAlign?.({ vertical: "min" });
        }}
      >
        <AlignTopIcon className="size-2.5" />
      </Item>
      <Item
        disabled={disabled}
        tooltip="Align vertical center"
        onClick={() => {
          onAlign?.({ vertical: "center" });
        }}
      >
        <AlignCenterVerticallyIcon className="size-2.5" />
      </Item>
      <Item
        disabled={disabled}
        tooltip="Align bottom"
        onClick={() => {
          onAlign?.({ vertical: "max" });
        }}
      >
        <AlignBottomIcon className="size-2.5" />
      </Item>
    </ButtonGroup>
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
        <button
          disabled={disabled}
          onClick={onClick}
          type="button"
          aria-label={tooltip}
          className={cn(
            buttonVariants({ variant: "outline", size: "icon" }),
            "bg-transparent"
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent collisionPadding={4}>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
