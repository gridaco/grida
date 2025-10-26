/**
 * @see https://gist.github.com/softmarshmallow/16f4b0ff551cbe0fed3d888dc3781493
 * @returns
 */
export const SVGPatternDiagonalStripe = ({
  patternSpacing = 8,
  patternWidth = 1,
  ...props
}: React.SVGProps<SVGPatternElement> & {
  patternSpacing?: number;
  patternWidth?: number;
}) => {
  return (
    <pattern
      id="diagonalStripes"
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

/**
 * @example `url(#${SVGPatternDiagonalStripe.id})`
 */
SVGPatternDiagonalStripe.id = "diagonalStripes";
