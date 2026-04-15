// type KeyMatcherLike = (item, item) => boolean | null;

/**
 * from - https://stackoverflow.com/a/55241491/5463235
 * @param items
 * @param id
 * @param link
 * @returns
 */
export function nest(
  // oxlint-disable-next-line typescript/no-explicit-any
  items: any[],
  id = null,
  link = "parent",
  sort: (a, b) => number = (_a, _b) => 0,
  depth = 0
) {
  return items
    .filter((item) => item[link] === id)
    .map((item) => ({
      ...item,
      depth: depth,
      children: nest(items, item.id, link, sort, depth + 1),
    }))
    .sort(sort);
}
