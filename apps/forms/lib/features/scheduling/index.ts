type TimestampTZ = string | Date;

type Schedule = {
  open: TimestampTZ;
  close: TimestampTZ;
};

export namespace Features {
  export function isopen(schedule: Schedule): boolean {
    const { open, close } = schedule;
    // Convert open_at and close_at to Date objects if they are strings
    const openDate = typeof open === "string" ? new Date(open) : open;
    const closeDate = typeof close === "string" ? new Date(close) : close;

    // Get the current date and time
    const now = new Date();

    // Check if the current time is within the range
    return now >= openDate && now <= closeDate;
  }
}
