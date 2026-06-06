import { codeToHtml } from "shiki";

/**
 * Server-side Shiki highlight with dual light/dark themes. The default color
 * is the light theme (applied inline); dark is emitted as the `--shiki-dark`
 * CSS variable and switched on via `.dark .shiki` in `shiki.css`.
 */
export function highlightCode(code: string, lang: string): Promise<string> {
  return codeToHtml(code, {
    lang,
    themes: { light: "github-light", dark: "github-dark" },
  });
}
