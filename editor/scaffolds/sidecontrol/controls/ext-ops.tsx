import { cn } from "@/components/lib/utils";
import { Button, buttonVariants } from "@/components/ui-editor/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CaretDownIcon } from "@radix-ui/react-icons";
import {
  SquaresExcludeIcon,
  SquaresSubtractIcon,
  SquaresIntersectIcon,
  SquaresUniteIcon,
} from "lucide-react";

export function OpsControl({ disabled }: { disabled?: boolean }) {
  return (
    <div
      aria-disabled={disabled}
      className={cn(
        "group/ops flex items-center justify-center gap-0"
        // buttonVariants({ variant: "ghost", size: "sm" })
      )}
    >
      <button
        disabled={disabled}
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "rounded-r-none"
        )}
      >
        <SquaresUniteIcon />
      </button>
      <div className="h-full border-r border-transparent" />
      <DropdownMenu>
        <DropdownMenuTrigger disabled={disabled} className="p-0 px-1">
          <CaretDownIcon className="size-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="end">
          <DropdownMenuItem className="text-xs" disabled={disabled}>
            <SquaresUniteIcon className="size-4" />
            Union
          </DropdownMenuItem>
          <DropdownMenuItem className="text-xs" disabled={disabled}>
            <SquaresSubtractIcon className="size-4" />
            Subtract
          </DropdownMenuItem>
          <DropdownMenuItem className="text-xs" disabled={disabled}>
            <SquaresIntersectIcon className="size-4" />
            Intersect
          </DropdownMenuItem>
          <DropdownMenuItem className="text-xs" disabled={disabled}>
            <SquaresExcludeIcon className="size-4" />
            Exclude
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
