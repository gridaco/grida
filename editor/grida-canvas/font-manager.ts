import type { Editor } from "./editor";
import { editor } from ".";

/**
 * Observes editor state and ensures required fonts are loaded
 * using the bound font loader.
 */
export class DocumentFontManager {
  constructor(private editor: Editor) {
    // watch for font registry changes
    this.editor.subscribeWithSelector(
      (state) => state.fontfaces,
      (_, v) => {
        this.sync(v);
      }
    );
  }

  private sync(keys: editor.state.FontFaceDescription[]) {
    const loaded = new Set(this.editor.listLoadedFonts());
    for (const { family } of keys) {
      if (loaded.has(family)) continue;
      void this.editor.loadFont({ family });
    }
  }

  /**
   * Selects a font style from a font family based on the provided description.
   *
   * This method implements a flexible font style selection system that supports both
   * static and variable fonts. It uses a priority-based matching system to find the
   * most appropriate font style based on the provided criteria.
   *
   * @param fontFamilySpec - the analyzed font family spec
   * @param description - The font style selection criteria
   * @param description.fontFamily - **Required.** The font family name to select from (e.g., "Inter", "Noto Sans")
   * @param description.fontStyleName - **Priority 1.** Non-standard font style name used internally by Grida. If provided, this takes highest priority and breaks matching if found.
   * @param description.fontWeight - **Priority 2.1.** The requested font weight (e.g., 400, 700). Used as secondary priority for matching.
   * @param description.fontStyleItalic - **Priority 2.2.** Whether the requested font style should be italic. Used as secondary priority for matching.
   * @param description.fontPostscriptName - The PostScript name of the typeface. Used for static font matching.
   * @param description.fontInstancePostscriptName - The PostScript name of the font instance. Used for variable font matching.
   * @param description.fontVariations - Font variation axis values (e.g., { "wght": 400, "wdth": 100 }). Used for variable font matching.
   *
   * @returns An object containing the matched font style information, or `null` if no match is found:
   * - `key`: The complete FontStyleKey with all font style properties
   * - `face`: The font face data containing axes, instances, and features
   * - `instance`: The matched font instance (for variable fonts) or `null` (for static fonts)
   *
   * @example
   * ```typescript
   * // Select by style name (highest priority)
   * const result = editor.selectFontStyle({
   *   fontFamily: "Inter",
   *   fontStyleName: "Bold Italic"
   * });
   *
   * // Select by weight and italic (secondary priority)
   * const result = editor.selectFontStyle({
   *   fontFamily: "Inter",
   *   fontWeight: 700,
   *   fontStyleItalic: true
   * });
   *
   * // Select variable font by variations
   * const result = editor.selectFontStyle({
   *   fontFamily: "Inter",
   *   fontVariations: { "wght": 500, "wdth": 110 }
   * });
   *
   * // Select static font by PostScript name
   * const result = editor.selectFontStyle({
   *   fontFamily: "Inter",
   *   fontPostscriptName: "Inter-Bold"
   * });
   * ```
   *
   * **Matching Priority:**
   * 1. **Style Name** (if provided) - Exact match by `fontStyleName`
   * 2. **Weight/Italic** (if provided) - Match by `fontWeight` and/or `fontStyleItalic`
   * 3. **Variable Font Instances** - Match by `fontInstancePostscriptName` or `fontVariations` using strict then loose matching
   * 4. **Static Font Faces** - Match by `fontPostscriptName`
   *
   * **Variable Font Matching:**
   * - First attempts strict matching (exact coordinate values)
   * - Falls back to loose matching (best similarity score)
   * - Uses `fontVariations` and `fontWeight` to build axis values
   *
   * **Static Font Matching:**
   * - Matches by PostScript name
   * - Creates FontStyleKey from corresponding style in the styles array
   *
   * @throws Logs warning if font family is not found in the font cache
   */
  public selectFontStyle(
    fontFamilySpec: editor.font_spec.UIFontFamily,
    description: Omit<editor.api.FontStyleSelectDescription, "fontFamily">
  ): {
    key: editor.font_spec.FontStyleKey;
    face: editor.font_spec.UIFontFaceData;
    instance: editor.font_spec.UIFontFaceInstance | null;
  } | null {
    // 0. match family

    const font = fontFamilySpec;
    const fontFamily = font.family;

    const instances = font.faces.flatMap((face) => face.instances);
    const is_vf = instances.length > 0;
    const styles = font.styles;

    const currAxesValues = Object.assign({}, description.fontVariations || {}, {
      wght: description.fontWeight,
    });

    // 1. match with style name (if specified)
    if (description.fontStyleName) {
      const matched_by_style = styles.find(
        (style) => style.fontStyleName === description.fontStyleName
      );
      if (matched_by_style) {
        // resolve the face where this style is originated from
        const face = font.faces.find(
          (face) => face.postscriptName === matched_by_style.fontPostscriptName
        );

        const instance = instances.find(
          (instance) => instance.name === matched_by_style.fontStyleName
        );

        if (face) {
          return {
            key: matched_by_style,
            face: face,
            instance: instance ?? null,
          };
        }
      }
    }

    // 2. match with fontWeight and/or fontStyleItalic
    const _weight_requested = typeof description.fontWeight === "number";
    const _italic_requested = typeof description.fontStyleItalic === "boolean";
    if (_weight_requested || _italic_requested) {
      const _only_weight_requested = _weight_requested && !_italic_requested;
      const _only_italic_requested = !_weight_requested && _italic_requested;
      const _weight_and_italic_requested =
        _weight_requested && _italic_requested;
      const style_candidates_by_weight_italic = styles.filter((style) => {
        if (_only_weight_requested) {
          return style.fontWeight === description.fontWeight;
        }
        if (_only_italic_requested) {
          return style.fontStyleItalic === description.fontStyleItalic;
        }
        if (_weight_and_italic_requested) {
          return (
            style.fontWeight === description.fontWeight &&
            style.fontStyleItalic === description.fontStyleItalic
          );
        }
        return false;
      });

      if (style_candidates_by_weight_italic.length === 1) {
        const style = style_candidates_by_weight_italic[0];
        const face = font.faces.find(
          (face) => face.postscriptName === style.fontPostscriptName
        );
        const instance = instances.find(
          (instance) => instance.name === style.fontStyleName
        );

        if (face) {
          return {
            key: style,
            face: face,
            instance: instance ?? null,
          };
        }
      } else {
        // this can happen for rich font, such as "Recursive" where it has more then 1 styles for weight+italic
        console.log(
          "fontWeight and fontStyleItalic is requested, but exact style not found",
          "found",
          style_candidates_by_weight_italic.length,
          "with weight",
          description.fontWeight,
          "and italic",
          description.fontStyleItalic
        );
        // continue
      }
    }

    if (is_vf) {
      // 3. match with fvar.instances (for variable fonts)
      const matched_by_instance_strict = this.matchFvarInstance(
        instances,
        {
          fontInstancePostscriptName: description.fontInstancePostscriptName,
          axesValues: currAxesValues,
        },
        "strict"
      );

      if (matched_by_instance_strict) {
        // locate the original face
        const face = font.faces.find((face) =>
          face.instances.some(
            (instance) =>
              instance.postscriptName ===
              matched_by_instance_strict.postscriptName
          )
        );
        if (face) {
          // Create a FontStyleKey for the matched instance
          const key: editor.font_spec.FontStyleKey = {
            fontFamily: fontFamily,
            fontStyleItalic: face.italic,
            fontWeight: matched_by_instance_strict.coordinates.wght ?? 400,
            fontStyleName: matched_by_instance_strict.name,
            fontPostscriptName: face.postscriptName,
            fontInstancePostscriptName:
              matched_by_instance_strict.postscriptName,
          };
          return { key, face, instance: matched_by_instance_strict };
        }
      }

      const matched_by_instance_loose = this.matchFvarInstance(
        instances,
        {
          fontInstancePostscriptName: description.fontInstancePostscriptName,
          axesValues: currAxesValues,
        },
        "loose"
      );
      if (matched_by_instance_loose) {
        const face = font.faces.find(
          (face) =>
            face.postscriptName === matched_by_instance_loose.postscriptName
        );
        if (face) {
          const key: editor.font_spec.FontStyleKey = {
            fontFamily: fontFamily,
            fontStyleItalic: face.italic,
            fontWeight: matched_by_instance_loose.coordinates.wght ?? 400,
            fontStyleName: matched_by_instance_loose.name,
            fontPostscriptName: face.postscriptName,
            fontInstancePostscriptName:
              matched_by_instance_loose.postscriptName,
          };
          return { key, face: face, instance: matched_by_instance_loose };
        }
      }
    } else {
      // 4. match with static postscriptName (for static fonts)
      if (description.fontPostscriptName) {
        const face = font.faces.find(
          (face) => face.postscriptName === description.fontPostscriptName
        );
        if (face) {
          // Create a FontStyleKey for the matched face
          // For static fonts, we need to find the corresponding style from the styles array
          const correspondingStyle = styles.find(
            (style) => style.fontPostscriptName === face.postscriptName
          );
          if (correspondingStyle) {
            const key: editor.font_spec.FontStyleKey = {
              fontFamily: fontFamily,
              fontStyleItalic: face.italic,
              fontWeight: correspondingStyle.fontWeight,
              fontStyleName: correspondingStyle.fontStyleName,
              fontPostscriptName: face.postscriptName,
              fontInstancePostscriptName: null,
            };
            return { key, face, instance: null };
          }
        }
      }
    }

    return null;
  }

  /**
   * Get the matching instance from a list of instances based on current values
   * @param instances - Array of font variation instances
   * @param context - Context containing PostScript name and axis values
   * @param mode - The mode to use for matching
   *   - strict: only match if the postscript name or axes values are exactly the same
   *   - loose: find the instance with the highest matching score based on coordinate similarity
   * @returns The matching instance if found, undefined otherwise
   */
  private matchFvarInstance(
    instances: editor.font_spec.UIFontFaceInstance[],
    context: {
      fontInstancePostscriptName?: string | null;
      axesValues: Record<string, number>;
    },
    mode: "strict" | "loose" = "loose"
  ): editor.font_spec.UIFontFaceInstance | undefined {
    if (!instances || instances.length === 0) return undefined;

    const { fontInstancePostscriptName, axesValues } = context;

    // First, try to match by PostScript name if provided
    if (fontInstancePostscriptName) {
      const by_name = instances.find(
        (inst) => inst.postscriptName === fontInstancePostscriptName
      );
      if (by_name) return by_name;
    }

    if (mode === "strict") {
      // Strict mode: exact coordinate matching
      return instances.find((inst) => {
        const instanceCoords = inst.coordinates;

        // First, check if all instance coordinates are present in current values
        for (const [axis, value] of Object.entries(instanceCoords)) {
          if (axesValues[axis] !== value) {
            return false;
          }
        }

        // Then, check if all current values are present in instance coordinates
        // This ensures we don't match when current values have additional axes
        for (const [axis, value] of Object.entries(axesValues)) {
          if (instanceCoords[axis] !== value) {
            return false;
          }
        }

        return true;
      });
    } else {
      // Loose mode: find the best matching instance
      let bestMatch: editor.font_spec.UIFontFaceInstance | undefined;
      let bestScore = -1;

      for (const inst of instances) {
        const instanceCoords = inst.coordinates;
        let score = 0;
        let totalAxes = 0;

        // Calculate matching score based on how many axes match
        for (const [axis, value] of Object.entries(axesValues)) {
          totalAxes++;
          if (instanceCoords[axis] === value) {
            score++;
          }
        }

        // Also check for instance coordinates that don't exist in current values
        for (const [axis, value] of Object.entries(instanceCoords)) {
          if (!(axis in axesValues)) {
            totalAxes++;
            // Don't penalize for extra axes in the instance
          }
        }

        // Normalize score by total axes and prefer instances with higher match ratio
        const normalizedScore = totalAxes > 0 ? score / totalAxes : 0;

        if (normalizedScore > bestScore) {
          bestScore = normalizedScore;
          bestMatch = inst;
        }
      }

      return bestMatch;
    }
  }
}
