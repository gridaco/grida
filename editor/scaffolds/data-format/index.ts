import { format, startOfDay, addSeconds } from "date-fns";
import { toZonedTime } from "date-fns-tz";

export namespace DataFormat {
  export type Format =
    | "text"
    // uuidv4
    | "uuid"
    // email format
    | "email"
    // E.164 phone number
    | "phone"
    // timestamptz
    | "timestamptz";

  export type DateFormat = "date" | "time" | "datetime";

  export const SYM_LOCALTZ = Symbol("localtz");

  export type DateTZLocal = typeof SYM_LOCALTZ;

  /**
   * Timezone string or local timezone symbol
   *
   * common timezone strings:
   * - UTC
   */
  export type DateTZ = string | DateTZLocal;

  export function tztostr(
    tz?: DataFormat.DateTZ,
    replacelocaltzwith?: string
  ): string | undefined {
    return tz === DataFormat.SYM_LOCALTZ ? replacelocaltzwith || undefined : tz;
  }

  export function s2Hmm(s: number) {
    const now = new Date();
    const startOfDayDate = startOfDay(now);
    const updatedDate = addSeconds(startOfDayDate, s);
    const formattedTime = format(updatedDate, "H:mm");

    return formattedTime;
  }

  export function fmtdate(
    date: Date | string,
    format: "date" | "time" | "datetime",
    tz?: DataFormat.DateTZ
  ) {
    tz = tztostr(tz);
    if (typeof date === "string") {
      date = new Date(date);
    }

    if (tz) {
      date = toZonedTime(date, tz);
    }

    switch (format) {
      case "date":
        return date.toLocaleDateString();
      case "time":
        return date.toLocaleTimeString();
      case "datetime":
        return date.toLocaleString();
    }
  }
}
