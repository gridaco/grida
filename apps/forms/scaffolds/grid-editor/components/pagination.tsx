"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkbenchUI } from "@/components/workbench";
import { ArrowLeftIcon, ArrowRightIcon } from "@radix-ui/react-icons";

export function GridQueryPaginationControl({
  page,
  min,
  max,
  hasNext,
  hasPrev,
  onNext,
  onPaginate,
  onPrev,
}: {
  page: number;
  min: number;
  max: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPaginate: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        disabled={!hasPrev}
        variant="outline"
        className={WorkbenchUI.buttonVariants({
          variant: "outline",
          size: "icon",
        })}
        onClick={onPrev}
      >
        <ArrowLeftIcon className="w-3.5 h-3.5" />
      </Button>
      <div className="flex flex-1 items-center gap-1 text-xs">
        <p className="text-muted-foreground">Page</p>
        <Input
          type="number"
          min={min + 1}
          max={max}
          value={page + 1}
          onChange={(e) => {
            const i = parseInt(e.target.value) - 1;
            if (i >= min && i <= max) {
              onPaginate(i);
            }
          }}
          className={WorkbenchUI.inputVariants()}
        />
        <p className="text-muted-foreground whitespace-nowrap">of {max + 1}</p>
      </div>
      <Button
        disabled={!hasNext}
        variant="outline"
        className={WorkbenchUI.buttonVariants({
          variant: "outline",
          size: "icon",
        })}
        onClick={onNext}
      >
        <ArrowRightIcon className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
