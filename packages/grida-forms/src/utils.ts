export type MaybeArray<T> = T | T[];

export function toArrayOf<T>(
  value: MaybeArray<T>,
  nofalsy = true
): NonNullable<T>[] {
  return (
    Array.isArray(value) ? value : nofalsy && value ? [value] : []
  ) as NonNullable<T>[];
}

import { validate, version } from "uuid";

export function is_uuid_v4(value: string): boolean {
  try {
    return validate(value) && version(value) === 4;
  } catch {
    return false;
  }
}
