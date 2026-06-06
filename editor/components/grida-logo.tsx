import { GridaLogo as GridaLogoIcon } from "@grida/react-icons/logos";

/**
 * Editor adapter for the theme-free package logo. The package icon fills with
 * `currentColor`; here we re-apply `fill-foreground` so existing call sites
 * render exactly as before. See @grida/react-icons.
 */
export const GridaLogo = ({
  className,
  size = 24,
}: {
  className?: string;
  size?: number;
}) => {
  return (
    <GridaLogoIcon
      size={size}
      className={["fill-foreground", className].filter(Boolean).join(" ")}
    />
  );
};
