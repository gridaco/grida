"use client";

import React, { useState } from "react";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
  PreferenceDescription,
} from "@/components/preferences";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { cn } from "@/utils";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon } from "@radix-ui/react-icons";
import timezones from "timezones-list";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function SchedulingPreferences({
  form_id,
  init,
}: {
  form_id: string;
  init: {
    is_scheduling_enabled: boolean;
    scheduling_open_at: string | null;
    scheduling_close_at: string | null;
  };
}) {
  const [is_scheduling_enabled, set_is_scheduling_enabled] = useState(
    init.is_scheduling_enabled
  );

  const [scheduling_open_at, set_scheduling_open_at] = React.useState<
    Date | undefined
  >(init.scheduling_open_at ? new Date(init.scheduling_open_at) : undefined);

  const [scheduling_close_at, set_scheduling_close_at] = React.useState<
    Date | undefined
  >(init.scheduling_close_at ? new Date(init.scheduling_close_at) : undefined);

  return (
    <PreferenceBox>
      <PreferenceBoxHeader heading={<>Scheduling</>} />
      <PreferenceBody>
        <form
          id="/private/editor/settings/..."
          action="/private/editor/settings/..."
          method="POST"
        >
          <input type="hidden" name="form_id" value={form_id} />
          <div className="flex gap-2 items-center">
            <Switch
              id="is_schedule_enabled"
              name="is_schedule_enabled"
              checked={is_scheduling_enabled}
              onCheckedChange={set_is_scheduling_enabled}
            />
            <Label htmlFor="is_schedule_enabled">
              Enable scheduling for this form
            </Label>
          </div>
          <div className="py-4" hidden={!is_scheduling_enabled}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead></TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Time Zone</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Open At</TableCell>
                  <TableCell>
                    <DatePicker
                      placeholder="Openning Date"
                      date={scheduling_open_at}
                      onValueChange={set_scheduling_open_at}
                    />
                  </TableCell>
                  <TableCell>
                    <TimePicker />
                  </TableCell>
                  <TableCell>
                    <TZPicker />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Close At</TableCell>
                  <TableCell>
                    <DatePicker
                      placeholder="Closing Date"
                      date={scheduling_close_at}
                      onValueChange={set_scheduling_close_at}
                    />
                  </TableCell>
                  <TableCell>
                    <TimePicker />
                  </TableCell>
                  <TableCell>
                    <TZPicker />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </form>
      </PreferenceBody>
      <PreferenceBoxFooter>
        <Button form="/private/editor/settings/..." type="submit">
          Save
        </Button>
      </PreferenceBoxFooter>
    </PreferenceBox>
  );
}

function TZPicker() {
  return (
    <Select defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone}>
      <SelectTrigger className="max-w-40 text-xs">
        <SelectValue placeholder="Choose Time Zone" />
      </SelectTrigger>
      <SelectContent>
        {timezones.map((timezone) => (
          <SelectItem key={timezone.tzCode} value={timezone.tzCode}>
            {timezone.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DatePicker({
  placeholder,
  date,
  onValueChange,
}: {
  placeholder?: string;
  date: Date | undefined;
  onValueChange?: (date: Date | undefined) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "w-full justify-start text-left font-normal",
            !date && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "PPP") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onValueChange}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

function TimePicker() {
  return <Input type="time" />;
}
