import { CustomCSS } from "@/theme/customcss";
import { cn } from "@/utils";
import { useMemo } from "react";

export function CustomCSSProvider({
  scope,
  css,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  css?: string;
  /**
   * scoped wrapper class (without the dot)
   */
  scope?: string;
}) {
  const compiledcss = useMemo(
    () => (css ? CustomCSS.vanilla(css, scope) : undefined),
    [css, scope]
  );

  const iscustomized = !!compiledcss;

  const dataprops = {
    [CustomCSS.DATA_CUSTOM_CSS_KEY]: iscustomized,
  };

  return (
    <>
      {iscustomized && (
        <style
          key="customcss"
          id="customcss"
          dangerouslySetInnerHTML={{ __html: compiledcss }}
        />
      )}
      <div
        {...props}
        {...dataprops}
        className={cn("w-full h-full", className, scope)}
      >
        {children}
      </div>
    </>
  );
}
