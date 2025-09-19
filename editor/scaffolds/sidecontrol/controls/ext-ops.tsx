import { cn } from "@/components/lib/utils";
import { buttonVariants } from "@/components/ui-editor/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import cg from "@grida/cg";
import { CaretDownIcon } from "@radix-ui/react-icons";
import {
  SquaresExcludeIcon,
  SquaresSubtractIcon,
  SquaresIntersectIcon,
  SquaresUniteIcon,
} from "lucide-react";

export function OpsControl({
  disabled,
  onOp,
  className,
}: {
  disabled?: boolean;
  onOp?: (op: cg.BooleanOperation) => void;
  className?: string;
}) {
  return (
    <div
      aria-disabled={disabled}
      className={cn(
        "group/ops flex items-center justify-center gap-0",
        className
      )}
    >
      <button
        disabled={disabled}
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "rounded-r-none"
        )}
        onClick={() => onOp?.("union")}
      >
        <SquaresUniteIcon />
      </button>
      <div className="h-full border-r border-transparent" />
      <DropdownMenu>
        <DropdownMenuTrigger disabled={disabled} className="p-0 px-1">
          <CaretDownIcon className="size-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="end">
          <DropdownMenuItem
            className="text-xs"
            disabled={disabled}
            onSelect={() => onOp?.("union")}
          >
            <SquaresUniteIcon className="size-4" />
            Union
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-xs"
            disabled={disabled}
            onSelect={() => onOp?.("difference")}
          >
            <SquaresSubtractIcon className="size-4" />
            Subtract
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-xs"
            disabled={disabled}
            onSelect={() => onOp?.("intersection")}
          >
            <SquaresIntersectIcon className="size-4" />
            Intersect
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-xs"
            disabled={disabled}
            onSelect={() => onOp?.("xor")}
          >
            <SquaresExcludeIcon className="size-4" />
            Exclude
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
