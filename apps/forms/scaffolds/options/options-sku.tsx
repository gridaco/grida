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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { QuestionMarkCircledIcon } from "@radix-ui/react-icons";

export function OptionsStockEdit({ options }: { options: Option[] }) {
  return (
    <div className="flex flex-col gap-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">
              <HoverCard openDelay={100} closeDelay={0}>
                <HoverCardTrigger>sku</HoverCardTrigger>
                <HoverCardContent>
                  <p className="text-sm font-medium">SKU</p>
                  <p className="text-xs font-light opacity-80">
                    Stock Keeping Unit
                  </p>
                </HoverCardContent>
              </HoverCard>
            </TableHead>
            <TableHead>
              <HoverCard openDelay={100} closeDelay={0}>
                <HoverCardTrigger className="flex gap-1 items-center cursor-pointer">
                  commited
                  <QuestionMarkCircledIcon />
                </HoverCardTrigger>
                <HoverCardContent>
                  <p className="text-sm font-medium">Committed</p>
                  <p className="text-xs font-light opacity-80">
                    Stock that has been reserved for orders
                  </p>
                </HoverCardContent>
              </HoverCard>
            </TableHead>
            <TableHead>
              <HoverCard openDelay={100} closeDelay={0}>
                <HoverCardTrigger className="flex gap-1 items-center cursor-pointer">
                  available
                  <QuestionMarkCircledIcon />
                </HoverCardTrigger>
                <HoverCardContent>
                  <p className="text-sm font-medium">Available</p>
                  <p className="text-xs font-light opacity-80">
                    Stock that is available for sale
                  </p>
                </HoverCardContent>
              </HoverCard>
            </TableHead>
            <TableHead>
              <HoverCard openDelay={100} closeDelay={0}>
                <HoverCardTrigger className="flex gap-1 items-center cursor-pointer">
                  on hand
                  <QuestionMarkCircledIcon />
                </HoverCardTrigger>
                <HoverCardContent>
                  <p className="text-sm font-medium">On Hand</p>
                  <p className="text-xs font-light opacity-80">
                    Stock that is physically (or virtually) on hand
                  </p>
                </HoverCardContent>
              </HoverCard>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {options.map((option) => (
            <SkuItemRow key={option.id} option={option} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SkuItemRow({ option }: { option: Option }) {
  const onSaveStock = (option_id: string, stock: number) => {};

  return (
    <TableRow key={option.id} className="font-mono">
      {/* sku */}
      <TableCell className="font-medium">{option.value}</TableCell>
      {/* comitted */}
      <TableCell>0</TableCell>
      {/* available */}
      <TableCell>
        <AdjustStockCountButton
          stock={0}
          onSave={(n) => {
            onSaveStock(option.id, n);
          }}
        />
      </TableCell>
      {/* on hand */}
      <TableCell>
        <AdjustStockCountButton
          stock={0}
          onSave={(n) => {
            onSaveStock(option.id, n);
          }}
        />
      </TableCell>
    </TableRow>
  );
}

function AdjustStockCountButton({
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

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      onSave?.(vstock);
      setOpen(false);
    }
  };

  const onSaveClick = () => {
    onSave?.(vstock);
    setOpen(false);
  };

  return (
    <div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger>
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
              onChange={(e) => setVStock(parseInt(e.target.value))}
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
