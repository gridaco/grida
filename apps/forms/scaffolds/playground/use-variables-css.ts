import { useEffect, useRef } from "react";

function useVariablesCSS(css?: string | null) {
  const styleRef = useRef<HTMLStyleElement | null>(null);

  useEffect(() => {
    if (css) {
      // Create a style element
      const style = document.createElement("style");
      style.id = "dynamic-variables-style";
      style.innerHTML = css;

      // Append the style element to the head
      document.head.appendChild(style);
      styleRef.current = style;
    }

    return () => {
      // Remove the style element from the head on cleanup
      if (styleRef.current) {
        document.head.removeChild(styleRef.current);
        styleRef.current = null;
      }
    };
  }, [css]);

  return null;
}

export default useVariablesCSS;
