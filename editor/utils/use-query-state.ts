"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Synchronizes a state value with a URL query parameter.
 *
 * It accepts a default value and optionally an array of accepted values.
 * If `accepted` is provided, the hook uses the default value when the query
 * parameter is not in the accepted list. Otherwise, any present value is used.
 *
 * @param key - The query parameter key.
 * @param defaultValue - The fallback value if the current query value is absent or invalid.
 * @param config - Optional configuration.
 * @param config.accepted - Optional array of accepted values.
 * @returns A tuple with the current value and a setter function.
 *
 * @example
 * ```tsx
 * const [view, setView] = useQueryState("view", "list", { accepted: ["grid", "list"] });
 * ```
 */
export function useQueryState<T extends string>(
  key: string,
  defaultValue?: T,
  config?: {
    accepted?: T[];
  }
) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initial = searchParams.get(key);
  const validInitial: T | undefined = config?.accepted
    ? config.accepted.includes(initial as T)
      ? (initial as T)
      : defaultValue
    : initial !== null
      ? (initial as T)
      : defaultValue;

  const [value, setValue] = useState<T | undefined>(validInitial);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (value !== undefined) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.replace(`${pathname}?${params.toString()}`);
  }, [value, key, pathname, router, searchParams]);

  return [value, setValue] as const;
}
