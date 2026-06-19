/**
 * Filename → CodeMirror language, lazily.
 *
 * `@codemirror/language-data` ships a `LanguageDescription` per language whose
 * grammar is dynamically imported only on first use — so the editor pays for a
 * language's parser exactly when it opens a file of that type, never up front.
 * `matchFilename` resolves by the description's own filename/extension globs,
 * which is broader and better-maintained than a hand-kept extension map.
 *
 * Returns `undefined` for unknown/extension-less files; the editor then runs
 * with no language (plain text), which is the right fallback.
 */
import { LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import type { Extension } from "@codemirror/state";

/** Extensions language-data has no grammar for, mapped to a close-enough one.
 * JSON's grammar highlights JSON-with-comments and JSON5 acceptably. */
const EXTENSION_ALIASES: Record<string, string> = {
  jsonc: "json",
  json5: "json",
};

export async function resolveLanguage(
  relPath: string
): Promise<Extension | undefined> {
  const name = relPath.split("/").pop() ?? relPath;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  // Resolve aliases by matching against a synthetic `file.<target>` name.
  const lookup = EXTENSION_ALIASES[ext]
    ? `file.${EXTENSION_ALIASES[ext]}`
    : name;
  const desc = LanguageDescription.matchFilename(languages, lookup);
  if (!desc) return undefined;
  return desc.load();
}

/** The full lazy language set, for markdown fenced-code-block highlighting. */
export { languages as codeLanguages };
