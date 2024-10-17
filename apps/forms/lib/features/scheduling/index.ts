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
  export function schedule_in_range(schedule: Schedule, _now?: Date): boolean {
    const { open, close } = schedule;

    assert(
      !(open === null && close === null),
      "Either open or close must be set."
    );
    // Convert open_at and close_at to Date objects if they are strings
    const openDate = typeof open === "string" ? new Date(open) : open;
    const closeDate = typeof close === "string" ? new Date(close) : close;

    if (openDate && closeDate) {
      assert(openDate < closeDate, "Open time must be before close time.");
    }

    // Get the current date and time
    const now = _now ?? new Date();

    // Check if the current time is after openDate and before closeDate
    const is_after_open = openDate ? now >= openDate : true;
    const is_before_close = closeDate ? now <= closeDate : true;
    const is_open = is_after_open && is_before_close;

    // Return true if the current time is within the range
    return is_open;
  }

  /**
   * if scheduling is enabled, either open_at or close_at value must be set
   * if enabled and both open_at and close_at are set, the campaign is open during the open_at and close_at time
   * if enabled and only one of open_at or close_at is set, the campaign is open during the open_at or close_at time
   * if enabled and neither open_at nor close_at is set, the campaign is open during the open_at or close_at time
   */
  export class ScheduleState {
    constructor(private readonly schedule: Schedule) {
      // Assert that at least one of open_at or close_at must be set if scheduling is enabled
      assert(
        this.schedule.open || this.schedule.close,
        "Either open or close must be set."
      );
    }

    is_open(_now?: Date) {
      return schedule_in_range(this.schedule, _now);
    }

    state(
      _now?: Date
    ): "before_open" | "after_open_before_close" | "after_close" {
      const is_open = this.is_open(_now);
      const now = _now ?? new Date();

      // Case where both open and close are set
      if (this.schedule.open && this.schedule.close) {
        return is_open
          ? "after_open_before_close"
          : now < this.schedule.open
            ? "before_open"
            : "after_close";
      }

      // Case where only open is set
      if (this.schedule.open) {
        return is_open ? "after_open_before_close" : "before_open";
      }

      // Case where only close is set
      if (this.schedule.close) {
        // If we only have close_at, we consider it "open" until the close date
        return now < this.schedule.close
          ? "after_open_before_close"
          : "after_close";
      }

      // Default to after_close if neither is set
      return "after_close";
    }
  }
}
