// Tiny structural-equality helpers used by the typed-read caches in
// `core/editor.ts` and `core/defs.ts`. Private to the package.

export function array_shallow_equal<T>(
  a: ReadonlyArray<T>,
  b: ReadonlyArray<T>
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
