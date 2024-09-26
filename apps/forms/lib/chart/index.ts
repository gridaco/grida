import { rollups } from "d3-array";

export namespace Chart {
  type Row = { [key: string]: any };

  export type MainAxisAggregate =
    | "none"
    | "datetime-day"
    | "datetime-week"
    | "datetime-year";

  export interface MainAxisDataQuery {
    key: string;
    aggregate?: MainAxisAggregate;
    /**
     * @deprecated not supported yet
     * Need key type - by x (key . e.g. date) by y (value)
     */
    sort: "none" | { ascending?: boolean };
  }

  function main_axis_aggregate(value: any, aggregate: MainAxisAggregate) {
    switch (aggregate) {
      case "datetime-day": {
        const date = new Date(value);
        return date.toISOString().split("T")[0]; // Aggregate by day
      }
      case "datetime-week": {
        const date = new Date(value);
        const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
        const pastDaysOfYear = Math.ceil(
          (date.getTime() - firstDayOfYear.getTime()) / 86400000
        );
        const weekNumber = Math.ceil(pastDaysOfYear / 7);
        return `${date.getFullYear()}-W${weekNumber}`; // Aggregate by week
      }
      case "datetime-year": {
        const date = new Date(value);
        return date.getFullYear().toString(); // Aggregate by year
      }
      default:
        return value;
    }
  }

  /**
   * data transformer for charts
   */
  export function chart(rows: Row[], mainAxis: MainAxisDataQuery) {
    let data = rollups(
      rows,
      (v) => v.length, // Counts the number of occurrences
      (d) => {
        if (mainAxis.aggregate) {
          return main_axis_aggregate(d[mainAxis.key], mainAxis.aggregate);
        }
        return d[mainAxis.key]; // No aggregation
      }
    ).map(([key, count]) => ({ key: String(key), count }));

    // Sort data based on the 'sort' property, by 'count'
    if (mainAxis.sort !== "none") {
      const ascending = mainAxis.sort.ascending;
      data = data.sort((a, b) => {
        if (ascending) return a.count - b.count;
        return b.count - a.count;
      });
    }

    return data;
  }
}
