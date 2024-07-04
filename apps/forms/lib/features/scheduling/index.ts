import assert from "assert";

type TimestampTZ = string | Date;

type Schedule = {
  open: TimestampTZ | null;
  close: TimestampTZ | null;
};

export namespace Features {
  /**
   * both or one can be set. cannot have both null.
   * when both set, open must be before close
   * when one is set, it is considered truthy for null value
   *
   * @param schedule
   * @returns
   */
  export function schedule_in_range(schedule: Schedule): boolean {
    const { open, close } = schedule;

    assert(
      !(open === null && open === null),
      "Both open and close cannot be null."
    );

    // Convert open_at and close_at to Date objects if they are strings
    const openDate = typeof open === "string" ? new Date(open) : open;
    const closeDate = typeof close === "string" ? new Date(close) : close;

    if (openDate && closeDate) {
      assert(openDate < closeDate, "Open time must be before close time.");
    }

    // Get the current date and time
    const now = new Date();

    // Check if the current time is after openDate and before closeDate
    const is_after_open = openDate ? now >= openDate : true;
    const is_before_close = closeDate ? now <= closeDate : true;
    const is_open = is_after_open && is_before_close;

    // Return true if the current time is within the range
    return is_open;
  }
}
