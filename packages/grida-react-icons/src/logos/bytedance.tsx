/**
 * Official ByteDance symbol, extracted from the wordmark embedded in the
 * ByteDance corporate homepage.
 * @see https://www.bytedance.com/en/
 */
const ByteDanceLogo = ({
  className,
  ...props
}: React.ComponentProps<"svg">) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="54"
      height="44"
      viewBox="0 0 54 44"
      fill="none"
      className={className}
      {...props}
    >
      <path
        d="M12.5576 34.7182L5 36.6582V2.02698L12.5576 3.9815V34.7182Z"
        fill="currentColor"
      />
      <path
        d="M49.0791 36.745L41.5071 38.6851V0L49.0791 1.95452V36.745Z"
        fill="currentColor"
      />
      <path
        d="M24.5491 35.7606L16.9915 37.7151V17.3157L24.5491 19.2702V35.7606Z"
        fill="currentColor"
      />
      <path
        d="M29.4868 14.3043L37.0589 12.3497V32.7492L29.4868 30.7946V14.3043Z"
        fill="currentColor"
      />
    </svg>
  );
};

export default ByteDanceLogo;
