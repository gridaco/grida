"use client";

import React from "react";
import { FormFieldTypeIcon } from "@/components/form-field-type-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormInputType } from "@/types";
import {
  ChevronDownIcon,
  LockClosedIcon,
  Pencil1Icon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { RenderHeaderCellProps } from "react-data-grid";
import { LinkIcon } from "lucide-react";
import { CellRoot } from "./cell";
import { useCellRootProps } from "../providers";
import type { Data } from "@/lib/data";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const ColumnHeaderCell = React.forwardRef(function ColumnHeaderCell(
  {
    column,
    type,
    fk,
    readonly,
    onEditClick,
    onDeleteClick,
  }: RenderHeaderCellProps<any> & {
    type: FormInputType;
    fk: Data.Relation.NonCompositeRelationship | false;
    readonly: boolean;
    onEditClick?: () => void;
    onDeleteClick?: () => void;
  },
  ref: React.Ref<HTMLDivElement>
) {
  const { name, key } = column;

  const rootprops = useCellRootProps(-1, key);

  return (
    <CellRoot
      ref={ref}
      {...rootprops}
      className="flex items-center justify-between border-t-0"
    >
      <span className="flex items-center gap-2">
        {fk ? (
          <LinkIcon className="min-w-4 w-4 h-4 text-workbench-accent-sky" />
        ) : (
          <FormFieldTypeIcon type={type} className="w-4 h-4" />
        )}
        <span className="font-normal">{name}</span>
        {readonly && (
          <Tooltip>
            <TooltipTrigger>
              <LockClosedIcon className="w-3 h-3 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>readonly</TooltipContent>
          </Tooltip>
        )}
      </span>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button>
            <ChevronDownIcon />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent className="z-50">
            <DropdownMenuItem onClick={onEditClick}>
              <Pencil1Icon className="me-2 align-middle" />
              Edit Field
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDeleteClick}>
              <TrashIcon className="me-2 align-middle" />
              Delete Field
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenu>
    </CellRoot>
  );
});
