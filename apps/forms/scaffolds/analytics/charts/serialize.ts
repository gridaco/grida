export function serialize<T extends Record<string, any>>(
  data: Array<T>,
  {
    from,
    to,
    dateKey,
    intervalMs,
  }: {
    from: Date;
    to: Date;
    dateKey: keyof T;
    intervalMs: number;
  }
) {
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
