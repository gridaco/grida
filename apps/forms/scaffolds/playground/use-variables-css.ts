"use client";

import { useEffect, useRef } from "react";

function useVariablesCSS(css?: string | null) {
  const styleRef = useRef<HTMLStyleElement | null>(null);

  useEffect(() => {
    if (css) {
      // Check if the style element already exists
      let style = styleRef.current;

      if (!style) {
        // Create a new style element if it doesn't exist
        style = document.createElement("style");
        style.id = "dynamic-variables-style";
        document.head.appendChild(style);
        styleRef.current = style;
      }

      // Update the style element's content
      style.innerHTML = css;
    } else {
      // Remove the style element if css is null or undefined
      if (styleRef.current) {
        document.head.removeChild(styleRef.current);
        styleRef.current = null;
      }
    }

    return () => {
      // Cleanup the style element on component unmount
      if (styleRef.current) {
        document.head.removeChild(styleRef.current);
        styleRef.current = null;
      }
    };
  }, [css]);

  return null;
}

export default useVariablesCSS;
