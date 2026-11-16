/** One stable visual identity, shared by rows, lifecycle entries and child header. */
export function NativeSubagentIdentity({
  childId,
  className = "size-7",
}: {
  childId: string;
  className?: string;
}) {
  let hash = 2166136261;
  for (const character of childId)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  const hue = (hash >>> 0) % 360;
  return (
    <svg
      aria-hidden="true"
      data-child-identity={childId}
      viewBox="0 0 32 32"
      className={`shrink-0 ${className}`}
      style={{ color: `hsl(${hue} 65% 60%)` }}
    >
      {[0, 1, 2, 3, 4, 5, 6, 7].map((petal) => (
        <ellipse
          key={petal}
          cx="16"
          cy="8"
          rx={3 + ((hash >>> (petal + 1)) & 1)}
          ry="6"
          transform={`rotate(${petal * 45} 16 16)`}
          fill="currentColor"
          opacity=".45"
        />
      ))}
      <circle cx="16" cy="16" r="4" fill="currentColor" />
    </svg>
  );
}
