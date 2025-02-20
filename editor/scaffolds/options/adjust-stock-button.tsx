"use client";

import React, { useEffect, useState } from "react";
import { cls_save_button } from "@/components/preferences";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function AdjustStockCountButton({
  stock,
  onSave,
}: {
  stock: number;
  onSave?: (stock: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [vstock, setVStock] = useState(stock);

  useEffect(() => {
    setVStock(stock);
  }, [stock]);

  const save = () => {
    if (isNaN(vstock) || vstock < 0) {
      setVStock(0);
      return;
    }
    onSave?.(vstock);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      save();
    }
  };

  const onSaveClick = () => {
    save();
  };

  return (
    <div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            className="font-mono text-xs w-20"
            type="button"
            variant="outline"
          >
            {stock}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          alignOffset={8}
          className="flex flex-col gap-1 p-2"
        >
          <div className="py-1">
            <span className="text-sm font-medium">Adjust Inventory</span>
            <p className="text-xs font-light opacity-80">
              Enter the new stock count
            </p>
          </div>
          <div className="flex gap-1">
            <Input
              className="flex-1 font-mono"
              autoFocus
              type="number"
              value={vstock}
              onChange={(e) => {
                const v = parseInt(e.target.value);
                setVStock(isNaN(v) ? 0 : v);
              }}
              onKeyDown={onKeyDown}
              min={0}
            />

            <Button
              type="button"
              variant="default"
              className={cls_save_button}
              onClick={onSaveClick}
            >
              Save
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
