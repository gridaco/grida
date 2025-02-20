import { useMemo } from "react";
import Fuse from "fuse.js";

export function useLocalFuzzySearch<T>(
  search: string,
  { data, keys }: { data: T[]; keys: string[] }
) {
  const fuse = useMemo(() => {
    return new Fuse(data ?? [], {
      keys: keys,
    });
  }, [data, keys]);

  const result = useMemo(() => {
    if (!search) {
      return data.map((item, i) => ({
        item,
        refIndex: i,
        score: 0,
        matches: [],
      }));
    }
    return fuse.search(search);
  }, [fuse, search]);

  return result;
}
