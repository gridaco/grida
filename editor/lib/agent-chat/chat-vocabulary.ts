/**
 * The tool and context-part names the chat kit renders. They are the names on
 * the parts the kit receives; `native_tool_parts` maps native tool calls onto
 * them, and `native_message_parts` builds the context parts.
 */
export namespace chat_vocabulary {
  export const TOOL_NAMES = {
    read_file: "read_file",
    edit_file: "edit_file",
    write_file: "write_file",
    list_files: "list_files",
    grep_files: "grep_files",
    exec_command: "exec_command",
    write_stdin: "write_stdin",
    todo_write: "todo_write",
    view_image: "view_image",
    design_search: "design_search",
    surface_open: "surface_open",
    surface_list_open: "surface_list_open",
  } as const;

  /** On-message context parts that render as chips instead of text. */
  export const CONTEXT_PARTS = {
    files: "data-user_file_attachments",
  } as const;

  /** Context part type → the marker name shown on its chip. */
  export const CONTEXT_MARKERS: Readonly<Record<string, string>> = {
    [CONTEXT_PARTS.files]: "user_file_attachments",
  };

  /** One Library reference a design search shows or picks. */
  export type DesignReference = {
    /** Library object id. */
    id: string;
    title: string;
    /** Public image URL. */
    url: string;
    width?: number;
    height?: number;
  };

  /**
   * The initial query of a design search call: `initial_search_query`.
   * Anything else reads as empty.
   */
  export function initialSearchQuery(input: unknown): string {
    return only(input, "initial_search_query");
  }

  function only(input: unknown, key: string): string {
    if (!input || typeof input !== "object" || Array.isArray(input)) return "";
    const keys = Object.keys(input);
    if (keys.length !== 1 || keys[0] !== key) return "";
    const value = (input as Record<string, unknown>)[key];
    return typeof value === "string" ? value.trim() : "";
  }
}
