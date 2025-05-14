import type { Result } from "@designto/code";

type TResultCache = Result & { __image: boolean };

export const cache = {
  set: (key: string, value: TResultCache) => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // - TypeError: Converting circular structure to JSON
    }
  },
  get: (key: string): TResultCache => {
    const value = sessionStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  },
};

export const cachekey = (target: { filekey; id }) =>
  target ? `${target.filekey}-${target.id}-${new Date().getMinutes()}` : null;
