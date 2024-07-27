"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CommitIcon, GearIcon } from "@radix-ui/react-icons";
import { format, startOfDay, addSeconds } from "date-fns";
import { format as formatTZ } from "date-fns-tz";
import { LOCALTZ, tztostr } from "../../editor/symbols";
import { useEditorState } from "@/scaffolds/editor";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export function GridViewSettings() {
  const [state, dispatch] = useEditorState();

  const {
    campaign: { scheduling_tz },
    datetz,
    dateformat,
    datagrid_filter,
    datagrid_table,
  } = state;

  // dummy example date - happy star wars day!
  const starwarsday = useMemo(
    () => new Date(new Date().getFullYear(), 4, 4),
    []
  );

  const tzoffset = useMemo(
    () => s2Hmm(new Date().getTimezoneOffset() * -1 * 60),
    []
  );

  const tzoffset_scheduling_tz = useMemo(
    () =>
      scheduling_tz
        ? formatTZ(new Date(), "XXX", { timeZone: scheduling_tz })
        : undefined,
    [scheduling_tz]
  );

  const simulator_available = datagrid_table !== "x-supabase-main-table";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center justify-center">
          <Badge variant="outline" className="cursor-pointer">
            <GearIcon />
          </Badge>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel>Table Settings</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={datagrid_filter.empty_data_hidden}
          onCheckedChange={(checked) => {
            dispatch({
              type: "editor/data-grid/filter",
              empty_data_hidden: checked,
            });
          }}
        >
          Hide records with empty data
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={datagrid_filter.masking_enabled}
          onCheckedChange={(checked) => {
            dispatch({
              type: "editor/data-grid/filter",
              masking_enabled: checked,
            });
          }}
        >
          Mask data
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={dateformat}
          onValueChange={(value) => {
            dispatch({
              type: "editor/data-grid/dateformat",
              dateformat: value as any,
            });
          }}
        >
          <DropdownMenuRadioItem value="date">
            Date
            <DropdownMenuShortcut>
              {starwarsday.toLocaleDateString()}
            </DropdownMenuShortcut>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="time">
            Time
            <DropdownMenuShortcut>
              {starwarsday.toLocaleTimeString()}
            </DropdownMenuShortcut>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="datetime">
            Date Time
            <DropdownMenuShortcut className="ms-4">
              {starwarsday.toLocaleString()}
            </DropdownMenuShortcut>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={tztostr(datetz, "browser")}
          onValueChange={(tz) => {
            switch (tz) {
              case "browser":
                dispatch({ type: "editor/data-grid/tz", tz: LOCALTZ });
                return;
              default:
                dispatch({ type: "editor/data-grid/tz", tz: tz });
                return;
            }
          }}
        >
          <DropdownMenuRadioItem value="browser">
            Local Time
            <DropdownMenuShortcut>(UTC+{tzoffset})</DropdownMenuShortcut>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="UTC">
            UTC Time
            <DropdownMenuShortcut>(UTC+0)</DropdownMenuShortcut>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            disabled={!scheduling_tz}
            value={scheduling_tz ?? "N/A"}
          >
            Scheduling Time
            {scheduling_tz && (
              <DropdownMenuShortcut className="text-end">
                {scheduling_tz}
                <br />
                (UTC{tzoffset_scheduling_tz})
              </DropdownMenuShortcut>
            )}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        {simulator_available && (
          <>
            <DropdownMenuSeparator />
            <Link href={`./simulator`} target="_blank">
              <DropdownMenuItem className="cursor-pointer">
                <CommitIcon className="inline align-middle me-2" />
                Open Simulator
              </DropdownMenuItem>
            </Link>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function s2Hmm(s: number) {
  const now = new Date();
  const startOfDayDate = startOfDay(now);
  const updatedDate = addSeconds(startOfDayDate, s);
  const formattedTime = format(updatedDate, "H:mm");

  return formattedTime;
}
