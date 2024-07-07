import type { DataGridFilterSettings } from "@/scaffolds/editor/state";
import Fuse from "fuse.js";

export namespace GridFilter {
  export function filter<T extends { [key: string]: any }>(
    rows: Array<T>,
    filter: DataGridFilterSettings,
    datakey?: keyof T,
    datasearchkeys?: string[]
  ): Array<T> {
    const { empty_data_hidden, localsearch } = filter;

    const filters = [];
    if (empty_data_hidden) {
      filters.push((rows: T[]) => filter_empty_data_hidden(rows, datakey));
    }

    if (localsearch) {
      filters.push((rows: T[]) =>
        filter_full_text_search(rows, localsearch, datakey, datasearchkeys)
      );
    }

    if (filters.length === 0) return rows;

    return filterWithMultipleFilters(rows, filters);
  }

  function filter_empty_data_hidden<T extends { [key: string]: any }>(
    rows: Array<T>,
    datakey?: keyof T
  ): number[] {
    return rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => {
        const v = datakey ? row[datakey] : row;
        return (
          v !== null &&
          v !== undefined &&
          v !== "" &&
          JSON.stringify(v) !== "{}" &&
          JSON.stringify(v) !== "[]"
        );
      })
      .map(({ index }) => index);
  }

  function filter_full_text_search<T extends { [key: string]: any }>(
    rows: Array<T>,
    localsearch: string,
    datakey?: keyof T,
    datasearchkeys?: string[]
  ): number[] {
    const fuse = new Fuse(rows, {
      keys: datasearchkeys?.map((k) =>
        datakey ? `${datakey?.toString()}.${k}` : k
      ),
      threshold: 0.3, // Adjust threshold to allow more matches
    });

    const result = fuse.search(localsearch);
    return result.map((r) => r.refIndex);
  }
  type FilterFunction<T> = (inputArray: T[]) => number[];

  /**
   * Filters an array using multiple filter functions that return indices.
   * @param {T[]} inputArray - The array to be filtered.
   * @param {FilterFunction<T>[]} filters - An array of filter functions. Each filter function takes the input array and returns an array of indices.
   * @returns {T[]} The filtered array.
   */
  function filterWithMultipleFilters<T>(
    inputArray: T[],
    filters: FilterFunction<T>[]
  ): T[] {
    if (filters.length === 0) return inputArray;

    // Initialize a set with indices from the first filter
    let filteredIndices = new Set<number>(filters[0](inputArray));

    // Apply each subsequent filter function and perform intersection
    for (let i = 1; i < filters.length; i++) {
      const currentIndices = new Set<number>(filters[i](inputArray));
      filteredIndices = new Set(
        [...Array.from(filteredIndices)].filter((index) =>
          currentIndices.has(index)
        )
      );

      // Early exit if no common indices
      if (filteredIndices.size === 0) {
        return [];
      }
    }

    // Filter the input array based on the final combined indices
    const filteredArray = inputArray.filter((_, index) =>
      filteredIndices.has(index)
    );

    return filteredArray;
  }
}
