/** Calendar date of retained turn activity, rather than archive or creation time. */
export function ChatActivityDate({ atMs }: { atMs?: number }) {
  if (
    atMs === undefined ||
    !Number.isSafeInteger(atMs) ||
    atMs < 0 ||
    atMs > 8_640_000_000_000_000
  )
    return null;
  const date = new Date(atMs);
  const label = `Last activity: ${date.toLocaleString(undefined, {
    dateStyle: "full",
    timeStyle: "short",
  })}`;
  return (
    <time
      dateTime={date.toISOString()}
      title={label}
      aria-label={label}
      className="shrink-0 whitespace-nowrap text-xs font-normal text-muted-foreground tabular-nums"
    >
      {date.toLocaleDateString(undefined, { dateStyle: "medium" })}
    </time>
  );
}
