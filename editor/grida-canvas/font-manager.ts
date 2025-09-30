import type { Editor } from "./editor";
import { editor } from ".";

/**
 * Observes editor state and ensures required fonts are loaded
 * using the bound font loader.
 */
export class DocumentFontManager {
  private __font_details_cache = new Map<
    string,
    editor.font_spec.UIFontFamily
  >();

  constructor(private editor: Editor) {
    // watch for font registry changes
    this.editor.doc.subscribeWithSelector(
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
      void this.editor.loadFontSync({ family });
    }
  }

  /**
   * Loads all font faces for a given family and extracts details once every
   * face is available. This method fetches all font files first and then runs
   * analysis to avoid progressive parsing.
   */
  async parseFontFamily(
    fontFamily: string
  ): Promise<editor.font_spec.UIFontFamily | null> {
    if (this.__font_details_cache.has(fontFamily)) {
      return this.__font_details_cache.get(fontFamily)!;
    }

    const item = this.editor.getFontItem(fontFamily);
    if (!item) return null;

    const files = Object.entries(item.files);

    // Load all font buffers non-progressively
    const buffers = await Promise.all(
      files.map(([, url]) => fetch(url).then((r) => r.arrayBuffer()))
    );

    const familydata = await this.editor.fontParser?.parseFamily(
      fontFamily,
      buffers.map((buffer, index) => ({
        faceId: files[index][0],
        data: buffer,
        userFontStyleItalic: item.files[files[index][0]]
          .toLowerCase()
          .includes("italic"),
      }))
    );

    if (!familydata) return null;

    const final: editor.font_spec.UIFontFamily = {
      ...familydata,
      family: fontFamily,
      axes: item.axes?.map((axis) => ({
        ...axis,
        min: axis.start,
        max: axis.end,
      })),
    };

    this.__font_details_cache.set(fontFamily, final);
    return final;
  }

  /**
   * Selects a font style from a font family based on the provided description.
   *
   * This method implements a flexible font style selection system that supports both
   * static and variable fonts. It uses a priority-based matching system to find the
   * most appropriate font style based on the provided criteria.
   *
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
  public selectFontStyle(description: editor.api.FontStyleSelectDescription): {
    key: editor.font_spec.FontStyleKey;
    face: editor.font_spec.UIFontFaceData;
    instance: editor.font_spec.UIFontFaceInstance | null;
    isVariable: boolean;
  } | null {
    // 0. match family
    const font = this.__font_details_cache.get(description.fontFamily);
    if (!font) {
      return null;
    }

    const fontFamily = font.family;
    const styles = font.styles;
    const instances = font.faces.flatMap((face) => face.instances);
    const is_vf = instances.length > 0;

    if (styles.length === 0) {
      return null;
    }

    const currAxesValues = {
      ...(description.fontVariations || {}),
      ...(description.fontWeight !== undefined
        ? { wght: description.fontWeight }
        : {}),
    };

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
            isVariable: is_vf,
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
            isVariable: is_vf,
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

    // 2.5. match with fontInstancePostscriptName directly from styles
    if (description.fontInstancePostscriptName) {
      const style = styles.find(
        (s) =>
          s.fontInstancePostscriptName ===
          description.fontInstancePostscriptName
      );
      if (style) {
        const face = font.faces.find(
          (face) => face.postscriptName === style.fontPostscriptName
        );
        const instance = instances.find(
          (inst) => inst.postscriptName === style.fontInstancePostscriptName
        );
        if (face) {
          return {
            key: style,
            face,
            instance: instance ?? null,
            isVariable: is_vf,
          };
        }
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
          return {
            key,
            face,
            instance: matched_by_instance_strict,
            isVariable: true,
          };
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
          return {
            key,
            face: face,
            instance: matched_by_instance_loose,
            isVariable: true,
          };
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
            return { key, face, instance: null, isVariable: false };
          }
        }
      }
    }

    // final fallback - pick the first style
    const firstStyle = styles[0];
    const face = font.faces.find(
      (face) => face.postscriptName === firstStyle.fontPostscriptName
    )!;
    const instance = instances.find(
      (instance) => instance.name === firstStyle.fontStyleName
    );
    return {
      key: firstStyle,
      face,
      instance: instance ?? null,
      isVariable: is_vf,
    };
  }

  /**
   * Get the matching instance from a list of instances based on current values
   * @param instances - Array of font variation instances
   * @param context - Context containing PostScript name and axis values
   * @param mode - The mode to use for matching
   *   - strict: match instances whose axis values exactly match the provided ones
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

    const axesEntries = Object.entries(axesValues).filter(
      ([, v]) => typeof v === "number"
    );

    // First, try to match by PostScript name if provided
    if (fontInstancePostscriptName) {
      const by_name = instances.find(
        (inst) => inst.postscriptName === fontInstancePostscriptName
      );
      if (by_name) return by_name;
    }

    if (mode === "strict") {
      // Strict mode: match only on provided axes
      return instances.find((inst) => {
        const instanceCoords = inst.coordinates;
        for (const [axis, value] of axesEntries) {
          if (instanceCoords[axis] !== value) {
            return false;
          }
        }
        return true;
      });
    } else {
      // Loose mode: find the best matching instance based on provided axes only
      let bestMatch: editor.font_spec.UIFontFaceInstance | undefined;
      let bestScore = -1;

      for (const inst of instances) {
        const instanceCoords = inst.coordinates;
        let score = 0;
        const totalAxes = axesEntries.length;

        for (const [axis, value] of axesEntries) {
          if (instanceCoords[axis] === value) {
            score++;
          }
        }

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
