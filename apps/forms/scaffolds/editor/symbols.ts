export const LOCALTZ = Symbol("localtz");

export function tztostr(
  tz?: typeof LOCALTZ | string,
  replacelocaltzwith?: string
): string | undefined {
  return tz === LOCALTZ ? replacelocaltzwith || undefined : tz;
}
