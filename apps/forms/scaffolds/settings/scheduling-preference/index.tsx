"use client";

import React, { useCallback, useMemo, useEffect } from "react";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxFooter,
  PreferenceBoxHeader,
} from "@/components/preferences";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

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
import { useForm, Controller, useWatch } from "react-hook-form";
import { toZonedTime, format as tzFormat, fromZonedTime } from "date-fns-tz";
import { Spinner } from "@/components/spinner";
import { PrivateEditorApi } from "@/lib/private";
import { CalendarIcon, InfoCircledIcon } from "@radix-ui/react-icons";
import { DatePicker, TZPicker, TimePicker } from "./pickers";

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

  const {
    handleSubmit,
    control,
    formState: { isSubmitting, isDirty },
    reset,
    setValue,
  } = useForm({
    defaultValues: {
      is_scheduling_enabled: init.is_scheduling_enabled,
      scheduling_open_at: scheduling_open_at,
      scheduling_close_at: scheduling_close_at,
      scheduling_tz: initialTZ,
    },
  });

  const handleSave = async (data: { is_scheduling_enabled: boolean }) => {
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
    const updating = PrivateEditorApi.Settings.updateFormAccessScheduling({
      form_id: form_id,
      enabled: data.is_scheduling_enabled,
      open_at: scheduling_open_at
        ? fromZonedTime(scheduling_open_at, openTz).toISOString()
        : null,
      close_at: scheduling_close_at
        ? fromZonedTime(scheduling_close_at, closeTz).toISOString()
        : null,
      scheduling_tz: openTz, // Save the timezone used
    });

    try {
      await toast.promise(updating, {
        loading: "Saving...",
        success: "Saved!",
        error: "Failed to save",
      });

      reset(data); // Reset form state to the new values after successful submission
    } catch (error) {}
  };

  const is_scheduling_enabled = useWatch({
    control,
    name: "is_scheduling_enabled",
  });

  // Update form values and reset the form once initial values are fully loaded
  useEffect(() => {
    reset({
      is_scheduling_enabled: init.is_scheduling_enabled,
      scheduling_open_at: scheduling_open_at,
      scheduling_close_at: scheduling_close_at,
      scheduling_tz: initialTZ,
    });
  }, [
    init.is_scheduling_enabled,
    scheduling_open_at,
    scheduling_close_at,
    initialTZ,
    reset,
  ]);

  return (
    <PreferenceBox>
      <PreferenceBoxHeader heading={<>Scheduling</>} />
      <PreferenceBody>
        <form
          id="scheduling-preferences-form"
          onSubmit={handleSubmit(handleSave)}
        >
          <input type="hidden" name="form_id" value={form_id} />
          <div className="flex gap-2 items-center">
            <Controller
              name="is_scheduling_enabled"
              control={control}
              render={({ field }) => (
                <Switch
                  id="is_schedule_enabled"
                  name="is_schedule_enabled"
                  checked={field.value}
                  onCheckedChange={(value) => {
                    field.onChange(value);
                    setValue("is_scheduling_enabled", value, {
                      shouldDirty: true,
                    });
                  }}
                />
              )}
            />
            <Label htmlFor="is_schedule_enabled">
              Enable scheduling for this form
            </Label>
          </div>
          {is_scheduling_enabled && (
            <div className="py-4">
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
                        onValueChange={(date) => {
                          set_scheduling_open_at(date);
                          setValue("scheduling_open_at", date, {
                            shouldDirty: true,
                          });
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <TimePicker
                        value={openTime}
                        onValueChange={(time) => {
                          setOpenTime(time);
                          setValue("scheduling_open_at", scheduling_open_at, {
                            shouldDirty: true,
                          }); // Update related form field
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <TZPicker
                        value={openTz}
                        onValueChange={(tz) => {
                          synchronizeTimezones(tz);
                          setValue("scheduling_tz", tz, { shouldDirty: true });
                        }}
                      />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Close At</TableCell>
                    <TableCell>
                      <DatePicker
                        placeholder="Closing Date"
                        date={scheduling_close_at}
                        onValueChange={(date) => {
                          set_scheduling_close_at(date);
                          setValue("scheduling_close_at", date, {
                            shouldDirty: true,
                          });
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <TimePicker
                        value={closeTime}
                        onValueChange={(time) => {
                          setCloseTime(time);
                          setValue("scheduling_close_at", scheduling_close_at, {
                            shouldDirty: true,
                          }); // Update related form field
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <TZPicker
                        value={closeTz}
                        onValueChange={(tz) => {
                          synchronizeTimezones(tz);
                          setValue("scheduling_tz", tz, { shouldDirty: true });
                        }}
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
          )}
        </form>
      </PreferenceBody>
      <PreferenceBoxFooter>
        <Button
          form="scheduling-preferences-form"
          type="submit"
          disabled={isSubmitting || !isDirty}
        >
          {isSubmitting ? <Spinner /> : "Save"}
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
