/**
 * from - https://stackoverflow.com/a/55241491/5463235
 * @param items
 * @param id
 * @param link
 * @returns
 */
export function nest(
  items: any[],
  id = null,
  link = "parent",
  sort: (a, b) => number = (a, b) => 0
) {
  return items
    .filter((item) => item[link] === id)
    .map((item) => ({ ...item, children: nest(items, item.id, link, sort) }))
    .sort(sort);
}
