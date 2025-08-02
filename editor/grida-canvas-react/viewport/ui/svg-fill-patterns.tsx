/**
 * @see https://gist.github.com/softmarshmallow/16f4b0ff551cbe0fed3d888dc3781493
 * @returns
 */
export const DiagonalStripe = ({
  ...props
}: React.SVGProps<SVGPatternElement>) => {
  return (
    <pattern
      id="diagonalStripes"
      patternUnits="userSpaceOnUse"
      width="10"
      height="4"
      patternTransform="rotate(45)"
      {...props}
    >
      <rect width="2" height="4" fill="skyblue" />
    </pattern>
  );
};
