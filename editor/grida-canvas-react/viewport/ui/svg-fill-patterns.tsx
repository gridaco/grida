/**
 * SVGPatternDiagonalStripe - Reusable diagonal stripe pattern component
 *
 * @see https://gist.github.com/softmarshmallow/16f4b0ff551cbe0fed3d888dc3781493
 *
 * @warning IMPORTANT: Always provide a unique `id` prop to avoid pattern ID collisions!
 * Each usage site should define its own pattern with a unique ID.
 *
 * @example
 * ```tsx
 * // In your component file (e.g., surface-padding-overlay.tsx)
 * const PATTERN_ID = "padding-diagonal-stripes";
 *
 * // Define the pattern once
 * <svg>
 *   <defs>
 *     <SVGPatternDiagonalStripe
 *       id={PATTERN_ID}
 *       color="var(--color-workbench-accent-sky)"
 *       patternWidth={1}
 *       patternSpacing={5}
 *     />
 *   </defs>
 * </svg>
 *
 * // Reference it
 * <rect fill={`url(#${PATTERN_ID})`} />
 * ```
 */
export const SVGPatternDiagonalStripe = ({
  id,
  patternSpacing = 8,
  patternWidth = 1,
  ...props
}: React.SVGProps<SVGPatternElement> & {
  id?: string;
  patternSpacing?: number;
  patternWidth?: number;
}) => {
  return (
    <pattern
      id={id}
      patternUnits="userSpaceOnUse"
      width={patternSpacing}
      height="4"
      patternTransform="rotate(45)"
      {...props}
    >
      <rect width={patternWidth} height="4" fill="currentColor" />
    </pattern>
  );
};
