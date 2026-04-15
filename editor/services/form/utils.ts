import { is_uuid_v4 } from "@/utils/is";
import { FieldSupports } from "@/k/supported_field_types";
import { unwrapFeildValue } from "@/grida-forms/lib/unwrap";
import { toDate } from "date-fns-tz";
import type { FormInputType } from "@/grida-forms-hosted/types";

type EnumOption = { id: string; value: string };

export namespace FormValue {
  export function parse(
    value_or_reference: unknown,
    extra: {
      // in minutes, where the givven value is the offset from UTC
      utc_offset?: number;
      enums?: EnumOption[];
      type: FormInputType | undefined;
      multiple?: boolean | null;
    }
  ): {
    value: unknown;
    enum_id?: string | null;
    enum_ids?: string[] | null;
  } {
    const { type, multiple, enums } = extra;
    if (!type) {
      return {
        value: value_or_reference,
      };
    }

    if (type === "datetime-local") {
      if (!value_or_reference) return { value: undefined };

      if (extra.utc_offset !== undefined) {
        const tz = offsetToEtcGMT(extra.utc_offset);
        const clientdate = toDate(
          new Date(value_or_reference as string | number),
          {
            timeZone: tz,
          }
        );
        return {
          value: clientdate.toISOString(),
        };
      } else {
        // If no client offset is provided, return the original date in ISO format
        return {
          value: new Date(value_or_reference as string | number).toISOString(),
        };
      }
    }

    if (FieldSupports.numeric(type)) {
      return {
        value: Number(value_or_reference),
      };
    }
    if (FieldSupports.boolean(type)) {
      return {
        value: unwrapFeildValue(value_or_reference, type),
      };
    }
    if (FieldSupports.jsonobject(type)) {
      switch (typeof value_or_reference) {
        case "string": {
          // Note: not sure this is the right way to handle empty string - (although empty stings are common in formdata.)
          if (value_or_reference === "") {
            return {
              value: undefined,
            };
          }
          return {
            value: JSON.parse(value_or_reference),
          };
        }
        case "object": {
          return {
            value: value_or_reference,
          };
        }
        default: {
          return {
            value: value_or_reference,
          };
        }
      }
    }
    if (FieldSupports.enums(type)) {
      if (FieldSupports.multiple(type) && multiple) {
        switch (typeof value_or_reference) {
          case "string": {
            const keys = value_or_reference.split(",");
            const found = keys
              .map((key) => getEnum(key, enums))
              .filter(Boolean) as EnumOption[];
            return {
              value: found.map((o) => o.value),
              enum_ids: found.map((o) => o.id),
            };
          }
          case "object": {
            if (Array.isArray(value_or_reference)) {
              const keys = value_or_reference;
              const found = keys
                .map((key) => getEnum(key, enums))
                .filter(Boolean) as EnumOption[];
              return {
                value: found.map((o) => o.value),
                enum_ids: found.map((o) => o.id),
              };
            }
            break;
          }
          default: {
            break;
          }
        }
      }

      const found = getEnum(value_or_reference as string, enums);

      // locate the value
      const value = found ? found.value : value_or_reference;

      return {
        value,
        enum_id: found ? found.id : null,
      };
    }

    return {
      value: unwrapFeildValue(value_or_reference, type),
    };
  }

  export function getEnum(
    value_or_reference: string,
    enums?: EnumOption[]
  ): EnumOption | null {
    if (!enums) return null;
    if (!is_uuid_v4(value_or_reference)) return null;
    return enums.find((o) => o.id === value_or_reference) || null;
  }

  export function safejson(data: unknown) {
    return JSON.parse(JSON.stringify(data));
  }
}

export namespace RichTextStagedFileUtils {
  export const TMP_PREFIX_SCHEMA = "grida-tmp://";
  export const TMP_SUFFIX_QUERY = "?grida-tmp=true";

  // Define the prefix and suffix regex patterns. The path capture must be
  // non-greedy (`.+?`) so that a doc containing multiple staged URLs does
  // not match across them (greedy `.+` backtracks to the last suffix).
  const _TMP_PREFIX_REGEXP = /grida-tmp:\/\//;
  const _TMP_SUFFIX_REGEXP = /\?grida-tmp=true/;
  const _PATH_REGEXP = /grida-tmp:\/\/(.+?)\?grida-tmp=true/g;

  export function encodeTmpUrl(path: string) {
    return TMP_PREFIX_SCHEMA + path + TMP_SUFFIX_QUERY;
  }

  export function decodeTmpUrl(url: string):
    | {
        type: "grida-tmp";
        path: string;
      }
    | {
        type: "url";
        url: string;
      } {
    if (url.startsWith(TMP_PREFIX_SCHEMA)) {
      url = url.replace(TMP_PREFIX_SCHEMA, "");
      url = url.replace(TMP_SUFFIX_QUERY, "");

      return {
        type: "grida-tmp",
        path: url,
      };
    }

    return {
      type: "url",
      url,
    };
  }

  export function parseDocument(doc: object | string) {
    const paths: string[] = [];

    if (typeof doc === "object") {
      doc = JSON.stringify(doc);
    }

    let match;
    while ((match = _PATH_REGEXP.exec(doc)) !== null) {
      paths.push(match[1]);
      _PATH_REGEXP.lastIndex = match.index + match[0].length; // Move to the next match
    }

    return {
      staged_file_paths: paths,
    };
  }

  export function renderDocument(
    doc: object | string,
    context: {
      files: Record<
        string,
        {
          path: string;
          publicUrl: string;
        }
      >;
    }
  ): object {
    const { files } = context;

    // Ensure the document is a string
    let docString = typeof doc === "string" ? doc : JSON.stringify(doc);

    // Return the resolved publicUrl, or preserve the original tmp URL if the
    // caller didn't provide a mapping for this path (or the mapping has an
    // empty publicUrl). Must rebuild from the literal prefix/suffix constants
    // rather than `ps.prefix`/`ps.suffix`, which are raw regex sources with
    // escaped slashes that produce invalid JSON when spliced back in.
    const formatter = (match: string) => {
      return files[match]?.publicUrl || encodeTmpUrl(match);
    };

    // Replace the placeholders in the document string
    docString = replacePVSTemplate(
      docString,
      _TMP_PREFIX_REGEXP,
      _TMP_SUFFIX_REGEXP,
      formatter
    );

    return JSON.parse(docString);
  }

  /**
   * Inverse of {@link renderDocument} used by the richtext form field on
   * serialize. Given a map of `displayUrl → stagedPath` collected from the
   * session's successful uploads, walks a tiptap doc and rewrites any image
   * node whose `src` is a known display URL back to
   * `grida-tmp://{stagedPath}?grida-tmp=true` form, so the server's submit
   * pipeline (parseDocument → commitStagedFile → renderDocument) can find
   * and commit the staged files.
   *
   * URLs not present in the map (external images the user pasted, URLs from
   * previous sessions) are left untouched.
   */
  export function restageDocument<T extends object | string>(
    doc: T,
    pathByUrl: ReadonlyMap<string, string>
  ): T {
    if (pathByUrl.size === 0) return doc;

    const walk = (node: unknown): unknown => {
      if (Array.isArray(node)) return node.map(walk);
      if (node && typeof node === "object") {
        const obj = node as Record<string, unknown>;
        if (
          obj.type === "image" &&
          obj.attrs &&
          typeof obj.attrs === "object"
        ) {
          const attrs = obj.attrs as Record<string, unknown>;
          if (typeof attrs.src === "string") {
            const path = pathByUrl.get(attrs.src);
            if (path) {
              return {
                ...obj,
                attrs: { ...attrs, src: encodeTmpUrl(path) },
              };
            }
          }
        }
        const copy: Record<string, unknown> = {};
        for (const key of Object.keys(obj)) {
          copy[key] = walk(obj[key]);
        }
        return copy;
      }
      return node;
    };

    const parsed = typeof doc === "string" ? JSON.parse(doc as string) : doc;
    const rewritten = walk(parsed);
    return (
      typeof doc === "string" ? JSON.stringify(rewritten) : rewritten
    ) as T;
  }

  /**
   * Client-side async variant of {@link renderDocument} that resolves
   * `grida-tmp://…?grida-tmp=true` paths on demand via a resolver callback.
   *
   * Used by the richtext form field to rewrite staged URLs back to public URLs
   * when loading `initialContent` into the editor, so previously-uploaded
   * images render correctly on form re-open before the server has a chance
   * to rewrite them via {@link renderDocument}.
   *
   * Each unique path is resolved at most once. Unresolved paths are left in
   * place (the editor will render them as broken images, matching native
   * browser behavior) so callers can decide how to surface the failure.
   */
  export async function resolveDocument<T extends object | string>(
    doc: T,
    resolver: (file: {
      path: string;
    }) => Promise<{ publicUrl: string } | null> | { publicUrl: string }
  ): Promise<T> {
    const { staged_file_paths } = parseDocument(doc);
    if (staged_file_paths.length === 0) return doc;

    const uniquePaths = Array.from(new Set(staged_file_paths));
    const entries = await Promise.all(
      uniquePaths.map(async (path) => {
        try {
          const resolved = await resolver({ path });
          return [path, resolved?.publicUrl] as const;
        } catch {
          return [path, undefined] as const;
        }
      })
    );

    // renderDocument crashes if files[path] is missing, so provide an entry
    // for every staged path. Unresolved paths get an empty publicUrl so the
    // formatter's `|| fallback` branch preserves the original grida-tmp URL.
    const files: Record<string, { path: string; publicUrl: string }> = {};
    for (const [path, publicUrl] of entries) {
      files[path] = { path, publicUrl: publicUrl ?? "" };
    }

    const rendered = renderDocument(doc, { files });
    return (typeof doc === "string" ? JSON.stringify(rendered) : rendered) as T;
  }
}

/**
 * Replace template matches in the text based on the provided prefix, suffix, and formatter function.
 * P(prefix) + V(match) + S(suffix) => formatter(V, { P, S })
 * @param text - The text to be processed.
 * @param prefix - The regular expression for the prefix of the template to be matched.
 * @param suffix - The regular expression for the suffix of the template to be matched.
 * @param formatter - A function that takes prefix, suffix, and match, and returns a formatted string.
 * @returns The text with the templates replaced.
 */
function replacePVSTemplate(
  text: string,
  prefix: RegExp,
  suffix: RegExp,
  formatter: (matche: string, ps: { prefix: string; suffix: string }) => string
): string {
  // Convert prefix and suffix regex to strings
  const prefixStr = prefix.source;
  const suffixStr = suffix.source;

  // Construct the regex pattern
  const regex = new RegExp(`${prefixStr}(.+?)${suffixStr}`, "g");

  return text.replace(regex, (_, group) => {
    return formatter(group, {
      prefix: prefixStr,
      suffix: suffixStr,
    });
  });
}

/**
 * @param offset offset in minutes
 * @returns Etc/GMT formatted tz string
 */
function offsetToEtcGMT(offset: number): string {
  const hours = Math.floor(Math.abs(offset) / 60);
  const minutes = Math.abs(offset) % 60;
  const sign = offset > 0 ? "-" : "+";
  return `Etc/GMT${sign}${String(hours).padStart(2, "0")}${String(minutes).padStart(2, "0")}`;
}
