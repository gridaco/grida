/**
 * Official Microsoft four-square symbol.
 * Source asset: ms-symbollockup_mssymbol_19.svg
 * @see https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-branding-in-apps
 */
const MicrosoftLogo = ({
  className,
  ...props
}: React.ComponentProps<"svg">) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="21"
      height="21"
      viewBox="0 0 21 21"
      className={className}
      {...props}
    >
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
};

export default MicrosoftLogo;
