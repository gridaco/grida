export type MaybeArray<T> = T | T[];

export function toArrayOf<T>(
  value: MaybeArray<T>,
  nofalsy = true
): NonNullable<T>[] {
  return (
    Array.isArray(value) ? value : nofalsy && value ? [value] : []
  ) as NonNullable<T>[];
}
