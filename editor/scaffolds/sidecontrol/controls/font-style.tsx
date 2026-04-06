import React, { useMemo } from "react";
import { PropertyEnumV2, EnumItem } from "../ui";
import { useCurrentFontFamily } from "./context/font";
import { editor } from "@/grida-canvas";
import { usePropertyPreview } from "@/grida-canvas-react/hooks/use-property-change";

function placeholderText(description?: {
  fontVariations?: Record<string, number>;
  fontWeight?: number;
}) {
  const weight = description?.fontWeight ? `${description.fontWeight} ` : "";
  const more = Object.entries(description?.fontVariations || {})
    .map(([axis, value]) => `${axis}: ${value}`)
    .join(", ");

  return `${weight}${more}`;
}

function useFontStyleOptions() {
  const f = useCurrentFontFamily();

  const { styles, currentStyleKey, description } =
    f.type === "ready"
      ? f.state
      : {
          styles: [],
          currentStyleKey: null,
          description: { fontVariations: {}, fontWeight: 400 },
        };

  const options: EnumItem<string>[][] = useMemo(() => {
    const result: EnumItem<string>[][] = [];
    const g_romans = styles.filter((style) => !style.fontStyleItalic);
    const g_italics = styles.filter((style) => style.fontStyleItalic);

    const sortByWeight = (a: (typeof styles)[0], b: (typeof styles)[0]) =>
      a.fontWeight - b.fontWeight;

    if (g_romans.length > 0) {
      result.push(
        g_romans.sort(sortByWeight).map((v) => ({
          value: editor.font_spec.fontStyleKey.key2str(v),
          label: v.fontStyleName,
        }))
      );
    }

    if (g_italics.length > 0) {
      result.push(
        g_italics.sort(sortByWeight).map((v) => ({
          value: editor.font_spec.fontStyleKey.key2str(v),
          label: v.fontStyleName,
        }))
      );
    }
    return result;
  }, [styles]);

  const value = currentStyleKey
    ? editor.font_spec.fontStyleKey.key2str(currentStyleKey)
    : "";

  return { options, value, description };
}

/**
 * Font Style Control with history preview.
 *
 * Uses PropertyEnumV2 with onValueSeeked → usePropertyPreview.
 * The checkmark stays on the committed value while hovering.
 * Canvas previews the hovered style live. Reverts on mouse-leave.
 */
export function FontStyleControl({
  onValueChange,
}: {
  onValueChange?: (key: editor.font_spec.FontStyleKey) => void;
}) {
  const { options, value, description } = useFontStyleOptions();

  const preview = usePropertyPreview<string>("font-style", (v) => {
    const key = editor.font_spec.fontStyleKey.str2key(v);
    if (key) onValueChange?.(key);
  });

  return (
    <PropertyEnumV2
      value={(preview.committedValue ?? value) as any}
      placeholder={placeholderText(description)}
      enum={options}
      onOpenChange={(open) => {
        if (open) preview.onOpen(value);
        else preview.onClose();
      }}
      onValueSeeked={preview.onSeek}
      onValueChange={preview.onCommit}
    />
  );
}
