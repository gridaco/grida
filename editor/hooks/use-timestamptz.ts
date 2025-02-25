import React, { useEffect, useState } from "react";
import { parseISO } from "date-fns";
import { toZonedTime, format as tzFormat, fromZonedTime } from "date-fns-tz";

/**
 * Custom hook to manage date, time, and timezone.
 *
 * @param {Date | string} [initialDate] - The initial date, either as a Date object or an ISO string.
 * @param {string} [fallbackTimezone] - The fallback timezone to use if no initial date is provided.
 * @returns {Object} The state and setter functions for date, time, and timezone.
 * @property {Date | undefined} date - The current date with timezone applied.
 * @property {string} time - The current time as a string in HH:mm format.
 * @property {string} tz - The current timezone.
 * @property {Function} setDate - Function to set a new date.
 * @property {Function} setTime - Function to set a new time.
 * @property {Function} setTimezone - Function to set a new timezone.
 */
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
  }, [initialDate]);

  /**
   * Set a new date with the current timezone.
   *
   * @param {Date | undefined} newDate - The new date to set.
   */
  const setDateWithTZ = (newDate?: Date) => {
    if (newDate) {
      setDate(newDate);
    } else {
      setDate(undefined);
      setTime("");
    }
  };

  /**
   * Set a new time with the current date and timezone.
   *
   * @param {string} newTime - The new time to set in HH:mm format.
   */
  const setTimeWithTZ = (newTime: string) => {
    if (date) {
      const [hours, minutes] = newTime.split(":").map(Number);
      const updatedDate = new Date(date);
      updatedDate.setHours(hours, minutes);
      setDate(updatedDate);
    }
    setTime(newTime);
  };

  /**
   * Set a new timezone and adjust the current date and time accordingly.
   *
   * @param {string} newTz - The new timezone to set.
   */
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
