import { Features } from "./";

type TimestampTZ = string | Date;

type Schedule = {
  open: TimestampTZ | null;
  close: TimestampTZ | null;
};

const ScheduleState = Features.ScheduleState;

// Helper function to create mock dates
const mockDate = (daysOffset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date;
};

describe("ScheduleState", () => {
  const openDate = mockDate(-1); // Yesterday
  const closeDate = mockDate(1); // Tomorrow
  const now = new Date();

  test("should return after_open_before_close when in range with both open_at and close_at set", () => {
    const schedule: Schedule = { open: openDate, close: closeDate };
    const state = new ScheduleState(schedule);

    expect(state.state(now)).toBe("after_open_before_close");
  });

  test("should return before_open when current date is before open_at", () => {
    const schedule: Schedule = { open: mockDate(1), close: mockDate(2) }; // opens tomorrow, closes the day after
    const state = new ScheduleState(schedule);

    expect(state.state(now)).toBe("before_open");
  });

  test("should return after_close when current date is after close_at", () => {
    const schedule: Schedule = { open: mockDate(-3), close: mockDate(-1) }; // opened 3 days ago, closed yesterday
    const state = new ScheduleState(schedule);

    expect(state.state(now)).toBe("after_close");
  });

  test("should return after_open_before_close when only open_at is set and in range", () => {
    const schedule: Schedule = { open: mockDate(-1), close: null }; // opened yesterday
    const state = new ScheduleState(schedule);

    expect(state.state(now)).toBe("after_open_before_close");
  });

  test("should return before_open when only open_at is set and current date is before", () => {
    const schedule: Schedule = { open: mockDate(1), close: null }; // opens tomorrow
    const state = new ScheduleState(schedule);

    expect(state.state(now)).toBe("before_open");
  });

  test("should return after_close when only close_at is set and current date is after", () => {
    const schedule: Schedule = { open: null, close: mockDate(-1) }; // closed yesterday
    const state = new ScheduleState(schedule);

    expect(state.state(now)).toBe("after_close");
  });

  test("should return after_open_before_close when only close_at is set and current date is before", () => {
    const schedule: Schedule = { open: null, close: mockDate(1) }; // closes tomorrow
    const state = new ScheduleState(schedule);

    expect(state.state(now)).toBe("after_open_before_close");
  });

  test("should throw an error if neither open_at nor close_at is set", () => {
    const schedule: Schedule = { open: null, close: null };

    expect(() => new ScheduleState(schedule)).toThrowError(
      "Either open or close must be set."
    );
  });
});
