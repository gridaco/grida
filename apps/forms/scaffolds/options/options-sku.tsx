"use client";

import React, { useEffect, useId, useMemo, useState } from "react";
import { cls_save_button } from "@/components/preferences";
import type { Option } from "@/types";
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
import type { InventoryStock, MutableInventoryStock } from "@/types/inventory";
import { CopyToClipboardInput } from "@/components/copy-to-clipboard-input";
import { AdjustStockCountButton } from "./adjust-stock-button";

interface InventoryTrackableOption extends Option, InventoryStock {}

export function OptionsStockEdit({
  options,
  onChange,
}: {
  options: InventoryTrackableOption[];
  onChange?: (id: string, stock: MutableInventoryStock) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">option</TableHead>
            <TableHead>
              <HoverCard openDelay={100} closeDelay={100}>
                <HoverCardTrigger>sku</HoverCardTrigger>
                <HoverCardContent>
                  <p className="text-sm font-medium">SKU (Auto Generated)</p>
                  <p className="text-xs font-light opacity-80">
                    Stock Keeping Unit
                  </p>
                </HoverCardContent>
              </HoverCard>
            </TableHead>
            <TableHead>
              <HoverCard openDelay={100} closeDelay={100}>
                <HoverCardTrigger className="flex gap-1 items-center cursor-pointer">
                  committed
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
              <HoverCard openDelay={100} closeDelay={100}>
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
            {/* <TableHead>
              <HoverCard openDelay={100} closeDelay={100}>
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
            </TableHead> */}
          </TableRow>
        </TableHeader>
        <TableBody>
          {options.map((option) => (
            <SkuItemRow
              key={option.id}
              option={option}
              onChange={(stock) => {
                onChange?.(option.id, stock);
              }}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SkuItemRow({
  option,
  onChange,
}: {
  option: InventoryTrackableOption;
  onChange?: (stock: MutableInventoryStock) => void;
}) {
  const [availabe, setAvailable] = useState(option.available);
  const [onHand, setOnHand] = useState(option.on_hand);

  const sku_preview = option.id.slice(0, 8);

  useEffect(() => {
    setAvailable(option.available);
    setOnHand(option.on_hand);
  }, [option.available, option.on_hand]);

  const onChangeAvailable = (value: number) => {
    const diff = value - option.available;
    setAvailable((v) => v + diff);
    setOnHand((v) => v + diff);
  };

  const onChangeOnHand = (value: number) => {
    const diff = value - option.on_hand;
    setOnHand((v) => v + diff);
    setAvailable((v) => v + diff);
  };

  useEffect(() => {
    onChange?.({ available: availabe, on_hand: onHand });
  }, [availabe, onHand]);

  return (
    <TableRow key={option.id} className="font-mono">
      {/* name (option) */}
      <TableCell className="font-medium">{option.value}</TableCell>
      {/* sku - id for option */}
      <TableCell>
        <HoverCard openDelay={100} closeDelay={100}>
          <HoverCardTrigger className="flex gap-1 items-center cursor-pointer">
            <pre className="text-xs">{sku_preview}</pre>
          </HoverCardTrigger>
          <HoverCardContent>
            <CopyToClipboardInput value={option.id} />
          </HoverCardContent>
        </HoverCard>
      </TableCell>
      {/* comitted */}
      <TableCell>{option.committed}</TableCell>
      {/* available */}
      <TableCell>
        <AdjustStockCountButton
          stock={option.available}
          onSave={onChangeAvailable}
        />
      </TableCell>
      {/* on hand */}
      {/* <TableCell>
        <AdjustStockCountButton
          stock={option.on_hand}
          onSave={onChangeOnHand}
        />
      </TableCell> */}
    </TableRow>
  );
}
