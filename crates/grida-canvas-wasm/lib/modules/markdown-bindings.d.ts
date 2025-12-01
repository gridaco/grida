export namespace markdown {
  export type MarkdownToHtmlResponse = CAPIMethodResult<{
    /** Converted HTML string */
    html: string;
  }>;

  // ====================================================================================================
  // #region: WASM Function Declarations
  // ====================================================================================================

  export interface MarkdownModule {
    // ====================================================================================================
    // #region: High-Level Markdown APIs
    // ====================================================================================================

    /**
     * Converts markdown text to HTML.
     * Parses markdown content and converts it to HTML using the pulldown-cmark library.
     *
     * @param markdown - Pointer to input markdown string (null-terminated C string)
     * @returns Pointer to JSON string containing {@link MarkdownToHtmlResponse}
     */
    _grida_markdown_to_html(markdown: CPtr): CPtr;
  }
}

