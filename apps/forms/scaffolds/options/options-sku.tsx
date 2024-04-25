"use client";

import React, { useEffect, useId, useMemo, useState } from "react";
import { cls_save_button } from "@/components/preferences";
import { Option } from "@/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function OptionsStockEdit({ options }: { options: Option[] }) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((option) => (
        <SkuItem key={option.id} option={option} />
      ))}
    </div>
  );
}

function SkuItem({ option }: { option: Option }) {
  const onSaveStock = (option_id: string, stock: number) => {};

  return (
    <div className="flex items-center gap-2 border-b py-1" key={option.id}>
      <div className="flex-1">
        <span className="font-mono">{option.value}</span>
      </div>
      <AdjustInventoryButton
        stock={0}
        onSave={(n) => {
          onSaveStock(option.id, n);
        }}
      />
    </div>
  );
}

function AdjustInventoryButton({
  stock,
  onSave,
}: {
  stock: number;
  onSave?: (stock: number) => void;
}) {
  const [vstock, setVStock] = useState(stock);

  return (
    <div>
      <Popover>
        <PopoverTrigger>
          <Button className="font-mono w-20" type="button" variant="outline">
            {stock}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          alignOffset={8}
          className="flex flex-col gap-1 p-1"
        >
          <p>
            <span className="text-sm">Adjust Inventory</span>
          </p>
          <div className="flex gap-1">
            <Input
              className="flex-1 font-mono"
              autoFocus
              type="number"
              value={vstock}
              onChange={(e) => setVStock(parseInt(e.target.value))}
              min={0}
            />

            <Button
              type="button"
              variant="default"
              className={cls_save_button}
              onClick={() => onSave?.(vstock)}
            >
              Save
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
