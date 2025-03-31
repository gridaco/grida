import ms from "ms";
export namespace Analytics {
  export type EventStream<T = any> = {
    name: string;
    description: string;
    data: AnyEvent<T>[];
    showonmap: boolean;
  };

  export type AnyEvent<T = any> = {
    id: string;
    at: Date;
    raw: T;
    geo: {
      latitude: number;
      longitude: number;
    } | null;
  };

  export type GeoEvent = {
    id: string;
    at: Date;
    geo: {
      latitude: number;
      longitude: number;
    };
  };

  export type EventStreamSerialChart = {
    name: string;
    description: string;
    data: { count: number; date: Date }[];
  };

  /**
   * Fills missing time intervals in event data for chart display.
   *
   * @template T - Type of the input data items.
   * @param data - Array of event data items.
   * @param options - Configuration for serialization.
   * @param options.from - Start date of the range.
   * @param options.to - End date of the range.
   * @param options.dateKey - Key in each data item representing the date.
   * @param options.intervalMs - Interval in milliseconds to group data.
   * @returns Array of objects with `date` and `count`, including zero-count intervals.
   */
  export function serialize<T extends Record<string, any>>(
    data: Array<T>,
    {
      from,
      to,
      dateKey,
      interval,
    }: {
      from: Date;
      to: Date;
      dateKey: keyof T;
      interval: ms.StringValue | number;
    }
  ) {
    const intervalMs = typeof interval === "string" ? ms(interval) : interval;
    if (!intervalMs) throw new Error("Invalid interval value");

    // Step 1: Create a map for the new data with the provided dates range
    const dateMap: Record<string, number> = {};
    let currentDate = new Date(from);
    while (currentDate <= to) {
      const dateString = new Date(
        Math.floor(currentDate.getTime() / intervalMs) * intervalMs
      ).toISOString();
      dateMap[dateString] = 0;
      currentDate = new Date(currentDate.getTime() + intervalMs); // Move to the next interval
    }

    // Step 2: Populate the map with actual data
    data.forEach((item) => {
      const dateValue = item[dateKey];
      if (typeof dateValue === "string" || (dateValue as any) instanceof Date) {
        const date = new Date(dateValue).toISOString();
        const roundedDate = new Date(
          Math.floor(new Date(date).getTime() / intervalMs) * intervalMs
        ).toISOString();
        if (dateMap[roundedDate] !== undefined) {
          dateMap[roundedDate]++;
        }
      }
    });

    // Step 3: Format the data for output
    const formattedData = Object.entries(dateMap).map(([date, count]) => ({
      date: new Date(date),
      count,
    }));

    return formattedData;
  }
}
