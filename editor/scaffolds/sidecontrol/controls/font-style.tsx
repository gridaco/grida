import React, { useMemo } from "react";
import { PropertyEnum, EnumItem } from "../ui";
import { useCurrentFontFamily } from "./context/font";

function placeholder(description?: {
  fontVariations?: Record<string, number>;
  fontWeight?: number;
}) {
  return Object.entries(description?.fontVariations || {})
    .map(([axis, value]) => `${axis}: ${value}`)
    .join(", ");
}

/**
 * Font Style (Variation Instance) Control Component
 *
 * This component is a font-pre-defined style picker designed specifically for usage with:
 * - OpenType STAT Axis names
 * - fvar.instances
 *
 * While this may look similar to font-weight.tsx, this component is explicitly designed
 * for handling font style variations through OpenType font features rather than generic
 * font weight controls.
 *
 * IMPORTANT: This component requires a proper font parser to function correctly.
 * The component itself does not provide font parsing functionality - it is purely
 * a UI wrapper around font parsing results. You must integrate this with a font
 * parser that can extract STAT axis information and fvar instances from OpenType fonts.
 *
 * Usage:
 * - Handle style selection changes through the provided callbacks
 * - Ensure your font parser provides the necessary data structure this component expects
 * - The component is purely driven by the font context and will automatically deselect
 *   when the current font variations don't match any instance exactly
 */
export function FontStyleControl({
  onValueChange,
}: {
  onValueChange?: (postscriptName: string) => void;
}) {
  const f = useCurrentFontFamily();

  const { styles, currentStyle, description } =
    f.type === "ready"
      ? f.state
      : {
          styles: [],
          currentStyle: { postscriptName: "" },
          description: { fontVariations: {}, fontWeight: 0 },
        };

  // Group styles by italic variants
  const options: EnumItem<string>[][] = useMemo(() => {
    const options: EnumItem<string>[][] = [];
    // Separate styles into italic and non-italic groups
    const g_romans = styles.filter((style) => !style.italic);
    const g_italics = styles.filter((style) => style.italic);

    // Add regular styles group if there are any
    if (g_romans.length > 0) {
      options.push(
        g_romans.map((v) => ({
          value: v.postscriptName,
          label: v.name,
        }))
      );
    }

    // Add italic styles group if there are any
    if (g_italics.length > 0) {
      options.push(
        g_italics.map((v) => ({
          value: v.postscriptName,
          label: v.name,
        }))
      );
    }
    return options;
  }, [styles]);

  const value = currentStyle.postscriptName || "";
  const disabled = styles.length === 0;

  return (
    <PropertyEnum
      value={value}
      placeholder={placeholder(description)}
      enum={options}
      disabled={disabled}
      onValueChange={onValueChange}
    />
  );
}
