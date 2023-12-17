import path from "path";

/**
 * @example
 * ["a", "/", "/a", "/b", "/", "/a/b", "/a/a"]
 * => {"a": ["a"], "/": ["/", "/a" ,"/b", "/"], "/a": ["/a/b", "/a/a"]}
 */
export function groupByPath<T extends object>(
  nodes: ReadonlyArray<T>,
  {
    key,
    base = "",
    transform = ({ path }) => path,
  }: {
    key: string;
    base?: string;
    transform?: (p: { node: T; path: string }) => string;
  }
) {
  const map = new Map<string, T[]>();
  for (const node of nodes) {
    const pathname: string = node[key];
    const basepath = path.resolve(
      base,
      transform({ node, path: path.dirname(pathname) })
    );

    if (!map.has(basepath)) {
      map.set(basepath, []);
    }

    map.get(basepath).push(node);
  }

  return map;
}

// transform file as directory index
