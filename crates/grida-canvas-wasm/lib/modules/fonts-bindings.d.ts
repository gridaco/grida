declare namespace fonts {
  // ====================================================================================================
  // #region: Type Definitions
  // ====================================================================================================

  export interface FontAnalysisResult {
    success: boolean;
    family_name: string;
    has_italic: boolean;
    has_upright: boolean;
    strategy: string;
    scenario: string;
    recipe_count: number;
    variable_font_info?: {
      axes: Array<{
        tag: string;
        name: string;
        min: number;
        default: number;
        max: number;
      }>;
      instances: Array<{
        name: string;
        coordinates: Record<string, number>;
      }>;
    };
    face_info: Array<{
      face_id: string;
      family_name: string;
      subfamily_name: string;
      postscript_name: string;
      weight_class: number;
      width_class: number;
      is_variable: boolean;
      features: FontFeature[];
    }>;
  }

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

  export interface FontFeature {
    tag: string;
    name: string;
    tooltip: string | null;
    sample_text: string | null;
  }

  export interface FontError {
    error: true;
    message: string;
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
     * @returns JSON string containing FontAnalysisResult or FontError
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
     * @returns JSON string containing FaceRecord or FontError
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

    /**
     * Returns the version of the font parsing library.
     * This is a ping function to verify the WASM module is working.
     *
     * @returns Version string
     */
    _grida_fonts_version(): number;
  }
}
