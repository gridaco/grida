import React, { useEffect, useState } from "react";
import { parseISO } from "date-fns";
import { toZonedTime, format as tzFormat, fromZonedTime } from "date-fns-tz";

export function useTimestampTZ(
  initialDate?: Date | string,
  fallbackTimezone?: string
) {
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState<string>("");
  const [tz, setTz] = useState<string>(fallbackTimezone || "");

  useEffect(() => {
    if (initialDate) {
      const parsedDate =
        typeof initialDate === "string" ? parseISO(initialDate) : initialDate;
      const zonedDate = toZonedTime(parsedDate, tz);
      setDate(zonedDate);
      setTime(tzFormat(zonedDate, "HH:mm", { timeZone: tz }));
    } else if (fallbackTimezone && !initialDate) {
      setTz(fallbackTimezone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDate, tz]);

  const setDateWithTZ = (newDate?: Date) => {
    if (newDate) {
      const zonedDate = toZonedTime(newDate, tz);
      setDate(zonedDate);
      setTime(tzFormat(zonedDate, "HH:mm", { timeZone: tz }));
    } else {
      setDate(undefined);
      setTime("");
    }
  };

  const setTimeWithTZ = (newTime: string) => {
    if (date) {
      const [hours, minutes] = newTime.split(":").map(Number);
      const updatedDate = new Date(date);
      updatedDate.setHours(hours, minutes);
      const utcDate = fromZonedTime(updatedDate, tz);
      const zonedDate = toZonedTime(utcDate, tz);
      setDate(zonedDate);
    }
    setTime(newTime);
  };

  const setTimezone = (newTz: string) => {
    setTz(newTz);
    if (date) {
      const utcDate = fromZonedTime(date, tz);
      const zonedDate = toZonedTime(utcDate, newTz);
      setDate(zonedDate);
      setTime(tzFormat(zonedDate, "HH:mm", { timeZone: newTz }));
    }
  };

  return {
    date,
    time,
    tz,
    setDate: setDateWithTZ,
    setTime: setTimeWithTZ,
    setTimezone,
  };
}
