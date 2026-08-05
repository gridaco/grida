/**
 * Official Tencent compact symbol for small-space applications.
 * Extracted from the Tencent visual identity guide.
 * @see https://www.tencent.net.cn/newsroom/media-resources/
 */
const TencentLogo = ({ className, ...props }: React.ComponentProps<"svg">) => {
  return (
    <svg
      width="141.085938"
      height="119.9375"
      viewBox="327.253906 904.773438 141.085938 119.9375"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <path
        d="M 447.191406 1024.710938 L 327.253906 1024.710938 L 348.402344 904.773438 L 468.339844 904.773438 Z M 393.976562 941.046875 L 360.757812 941.046875 L 367.871094 951.246094 L 392.171875 951.246094 L 382.132812 1007.921875 L 398.1875 1007.921875 L 408.242188 951.246094 L 438.90625 951.246094 L 397.402344 921.558594 Z"
        fill="#0052D9"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </svg>
  );
};

export default TencentLogo;
