export namespace fonts {
  export namespace types {
    // ====================================================================================================
    // #region: Core Type Definitions
    // ====================================================================================================

    /** Axis value pair for variable font recipes */
    export interface AxisValue {
      tag: string;
      value: number;
    }

    /** Family-level axis information (no default values as they vary per face) */
    export interface FontFamilyAxis {
      tag: string;
      name: string;
      min: number;
      max: number;
    }

    /** Face-specific axis information (includes default values) */
    export interface FontAxis {
      tag: string;
      name: string;
      min: number;
      default: number;
      max: number;
    }

    /** Variable font recipe */
    export interface VfRecipe {
      axis_values: Array<AxisValue>;
    }

    /** Italic recipe for UI consumption */
    export interface ItalicRecipe {
      name: string;
      description: string;
      is_italic: boolean;
      face_id: string;
      vf_recipe?: VfRecipe;
    }

    /** Italic capability analysis for UI consumption */
    export interface ItalicCapability {
      has_italic: boolean;
      has_upright: boolean;
      strategy: string;
      recipes: Array<ItalicRecipe>;
      scenario: string;
    }

    /** Variable font instance information */
    export interface FontInstance {
      name: string;
      postscript_name: string | null;
      coordinates: Record<string, number>;
    }

    /** Font feature information for UI consumption */
    export interface FontFeature {
      tag: string;
      name: string;
      tooltip: string | null;
      sample_text: string | null;
      glyphs: string[];
      script: string;
      language: string;
      source_table: string;
    }

    /** Face-level information for UI consumption */
    export interface FontFaceInfo {
      face_id: string;
      family_name: string;
      subfamily_name: string;
      postscript_name: string;
      weight_class: number;
      width_class: number;
      is_variable: boolean;
      is_strict_italic: boolean;
      axes: Array<FontAxis>;
      instances?: Array<FontInstance>;
      features: Array<FontFeature>;
    }

    /** Font style instance for UI consumption */
    export interface FontStyle {
      face_id: string;
      face_post_script_name: string;
      name: string;
      postscript_name: string | null;
      italic: boolean;
      weight: number;
    }

    /** Complete family-level analysis result for UI consumption */
    export interface FontFamilyAnalysisResult {
      family_name: string;
      axes: Array<FontFamilyAxis>;
      italic_capability: ItalicCapability;
      faces: Array<FontFaceInfo>;
      styles: Array<FontStyle>;
    }

    export type FontFamilyAnalysisResponse =
      | {
          success: true;
          data: FontFamilyAnalysisResult;
        }
      | FontError;

    /** Face record for single font parsing */
    export interface FaceRecord {
      face_id: string;
      ps_name: string;
      family_name: string;
      subfamily_name: string;
      is_variable: boolean;
      os2_italic_bit: boolean;
      weight_class: number;
      width_class: number;
      user_font_style_italic: boolean | null;
      axes_count: number;
    }

    /** Error response for failed operations */
    export interface FontError {
      success: false;
      error: {
        message: string;
      };
    }
  }

  // ====================================================================================================
  // #region: WASM Function Declarations
  // ====================================================================================================

  export interface FontsModule {
    // ====================================================================================================
    // #region: Core Font Analysis APIs
    // ====================================================================================================

    /**
     * Analyzes a font family and returns comprehensive family information as JSON.
     * This is the main API for working with multiple font files under the same family.
     *
     * @param family_name - Family name (can be null for auto-detection)
     * @param font_count - Number of font faces
     * @param face_ids - Array of face IDs (null-terminated strings)
     * @param font_data_ptrs - Array of pointers to font data
     * @param font_data_sizes - Array of font data sizes
     * @param user_italic_flags - Array of user italic declarations (-1 = null, 0 = false, 1 = true)
     * @returns JSON string containing {@link FontFamilyAnalysisResponse}
     */
    _grida_fonts_analyze_family(
      family_name: number | null,
      font_count: number,
      face_ids: number,
      font_data_ptrs: number,
      font_data_sizes: number,
      user_italic_flags: number | null
    ): number;

    /**
     * Parses a single font file and extracts basic metadata.
     * This is exposed for fast, single font analysis.
     *
     * @param font_data_ptr - Pointer to font data
     * @param font_data_size - Size of font data
     * @param face_id - Unique identifier for this font face
     * @param user_font_style_italic - User-declared italic style (can be null for auto-detection)
     * @returns JSON string containing FaceRecord
     */
    _grida_fonts_parse_font(
      font_data_ptr: number,
      font_data_size: number,
      face_id: number,
      user_font_style_italic: number | null
    ): number;

    // ====================================================================================================
    // #region: Utility Functions
    // ====================================================================================================

    /**
     * Frees memory allocated by WASM functions.
     *
     * @param ptr - Pointer to memory allocated by a WASM function
     */
    _grida_fonts_free(ptr: number): void;
  }
}
