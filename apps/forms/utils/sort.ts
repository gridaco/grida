/**
 * Returns a comparator function for sorting strings based on a given priority order.
 *
 * @param {string[]} priorities - An array of strings representing the priority order.
 * @returns {(a: string, b: string) => number} - A comparator function that can be used with `Array.prototype.sort`.
 *
 * @example
 * const priorities = ["high", "medium", "low"];
 * const items = ["low", "medium", "high", "unknown"];
 * items.sort(priority_sorter(priorities));
 * // items will be ["high", "medium", "low", "unknown"]
 */
export const priority_sorter = (priorities: string[]) => {
  const sort_by_priorities = (a: string, b: string) => {
    const _a = priorities.indexOf(a);
    const _b = priorities.indexOf(b);
    if (_a === -1 && _b === -1) {
      return a.localeCompare(b);
    }

    if (_a === -1) {
      return 1;
    }

    if (_b === -1) {
      return -1;
    }

    return _a - _b;
  };

  return sort_by_priorities;
};
