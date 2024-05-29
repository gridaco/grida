"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
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
import { CalendarIcon, InfoCircledIcon } from "@radix-ui/react-icons";
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
import { useTimestampTZ } from "@/hooks/use-timestamptz";
import toast from "react-hot-toast";
import { createClientFormsClient } from "@/lib/supabase/client";
import { toZonedTime, format as tzFormat, fromZonedTime } from "date-fns-tz";

export function SchedulingPreferences({
  form_id,
  init,
}: {
  form_id: string;
  init: {
    is_scheduling_enabled: boolean;
    scheduling_open_at: string | null;
    scheduling_close_at: string | null;
    scheduling_tz: string | null;
  };
}) {
  const supabase = createClientFormsClient();

  const [is_scheduling_enabled, set_is_scheduling_enabled] = useState(
    init.is_scheduling_enabled
  );

  const initialTZ =
    init.scheduling_tz || Intl.DateTimeFormat().resolvedOptions().timeZone;

  const {
    date: scheduling_open_at,
    time: openTime,
    tz: openTz,
    setDate: set_scheduling_open_at,
    setTime: setOpenTime,
    setTimezone: setOpenTimezone,
  } = useTimestampTZ(init.scheduling_open_at || undefined, initialTZ);

  const {
    date: scheduling_close_at,
    time: closeTime,
    tz: closeTz,
    setDate: set_scheduling_close_at,
    setTime: setCloseTime,
    setTimezone: setCloseTimezone,
  } = useTimestampTZ(init.scheduling_close_at || undefined, initialTZ);

  // Function to synchronize timezones
  const synchronizeTimezones = (newTz: string) => {
    setOpenTimezone(newTz);
    setCloseTimezone(newTz);
  };

  const update = useCallback(
    async (data: {
      is_scheduling_enabled: boolean;
      scheduling_open_at?: string | null;
      scheduling_close_at?: string | null;
      scheduling_tz: string;
    }) => {
      const { error } = await supabase
        .from("form")
        .update({
          ...data,
        })
        .eq("id", form_id);
      if (error) {
        throw error;
      }
    },
    [form_id, supabase]
  );

  const handleSave = () => {
    // Check if closing time is after opening time
    if (
      scheduling_open_at &&
      scheduling_close_at &&
      scheduling_open_at >= scheduling_close_at
    ) {
      toast.error("Closing time must be after opening time");
      return;
    }

    // Check if either time is set (it's ok to have only one time set)
    if (!scheduling_open_at && !scheduling_close_at) {
      toast.error("You must either set the opening or closing time");
      return;
    }

    const updating = update({
      is_scheduling_enabled,
      scheduling_open_at: scheduling_open_at
        ? fromZonedTime(scheduling_open_at, openTz).toISOString()
        : null,
      scheduling_close_at: scheduling_close_at
        ? fromZonedTime(scheduling_close_at, closeTz).toISOString()
        : null,
      scheduling_tz: openTz, // Save the timezone used
    });

    toast.promise(updating, {
      loading: "Saving...",
      success: "Saved!",
      error: "Failed to save",
    });

    console.log({
      form_id,
      is_scheduling_enabled,
      scheduling_open_at: scheduling_open_at?.toISOString(),
      scheduling_close_at: scheduling_close_at?.toISOString(),
      scheduling_tz: openTz, // Save the timezone used
    });
  };

  return (
    <PreferenceBox>
      <PreferenceBoxHeader heading={<>Scheduling</>} />
      <PreferenceBody>
        <form
          id="/private/editor/settings/..."
          action="/private/editor/settings/..."
          method="POST"
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
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
                      placeholder="Opening Date"
                      date={scheduling_open_at}
                      onValueChange={set_scheduling_open_at}
                    />
                  </TableCell>
                  <TableCell>
                    <TimePicker value={openTime} onValueChange={setOpenTime} />
                  </TableCell>
                  <TableCell>
                    <TZPicker
                      value={openTz}
                      onValueChange={synchronizeTimezones}
                    />
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
                    <TimePicker
                      value={closeTime}
                      onValueChange={setCloseTime}
                    />
                  </TableCell>
                  <TableCell>
                    <TZPicker
                      value={closeTz}
                      onValueChange={synchronizeTimezones}
                    />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <OnYourLocalTime
              open_at={scheduling_open_at}
              close_at={scheduling_close_at}
              tz={openTz}
            />
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

function OnYourLocalTime({
  open_at,
  close_at,
  tz,
}: {
  open_at: Date | undefined;
  close_at: Date | undefined;
  tz: string;
}) {
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const openAtLocal = useMemo(
    () =>
      open_at ? toZonedTime(fromZonedTime(open_at, tz), browserTz) : undefined,
    [browserTz, open_at, tz]
  );

  const closeAtLocal = useMemo(
    () =>
      close_at
        ? toZonedTime(fromZonedTime(close_at, tz), browserTz)
        : undefined,
    [browserTz, close_at, tz]
  );

  return (
    <article className="prose prose-sm dark:prose-invert">
      {tz !== browserTz && (
        <div className="text-muted-foreground">
          <hr />
          <small>
            <InfoCircledIcon className="inline me-1 mb-1 align-middle" />
            The times are shown in <u>{tz}</u>. In your local time zone{" "}
            <u>{browserTz}</u>, they are:
          </small>
          <small>
            <ul>
              {openAtLocal && (
                <li>
                  Open At:{" "}
                  <span className="border rounded px-2 py-1">
                    <CalendarIcon className="inline me-2 align-middle" />
                    {tzFormat(openAtLocal, "PPP HH:mm:ss", {
                      timeZone: browserTz,
                    })}
                  </span>
                </li>
              )}
              {closeAtLocal && (
                <li>
                  Close At:{" "}
                  <span className="border rounded px-2 py-1">
                    <CalendarIcon className="inline me-2 align-middle" />
                    {tzFormat(closeAtLocal, "PPP HH:mm:ss", {
                      timeZone: browserTz,
                    })}
                  </span>
                </li>
              )}
            </ul>
          </small>
        </div>
      )}
    </article>
  );
}

function TZPicker({
  defaultValue,
  value,
  onValueChange,
}: {
  defaultValue?: string;
  value?: string;
  onValueChange?: (tzCode: string) => void;
}) {
  return (
    <Select
      defaultValue={defaultValue}
      value={value}
      onValueChange={onValueChange}
    >
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

function TimePicker({
  value,
  onValueChange,
}: {
  value?: string;
  onValueChange?: (time: string) => void;
}) {
  return (
    <Input
      type="time"
      value={value}
      onChange={(e) => {
        onValueChange?.(e.target.value);
      }}
    />
  );
}
