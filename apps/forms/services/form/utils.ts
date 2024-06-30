import { is_uuid_v4 } from "@/utils/is";
import type { FormInputType, Option } from "@/types";
import { FieldSupports } from "@/k/supported_field_types";
import { unwrapFeildValue } from "@/lib/forms/unwrap";

export namespace FormValue {
  export function parse(
    value_or_reference: any,
    extra: {
      enums?: { id: string; value: string }[];
      type?: FormInputType;
    }
  ) {
    const { type, enums } = extra;
    if (!type) {
      return {
        value: value_or_reference,
      };
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
      // check if the value is a reference to form_field_option
      const is_value_fkey_and_found =
        is_uuid_v4(value_or_reference as string) &&
        enums?.find((o: any) => o.id === value_or_reference);

      // locate the value
      const value = is_value_fkey_and_found
        ? is_value_fkey_and_found.value
        : value_or_reference;

      return {
        value,
        enum_id: is_value_fkey_and_found ? is_value_fkey_and_found.id : null,
      };
    }

    return {
      value: unwrapFeildValue(value_or_reference, type),
    };
  }

  export function safejson(data: any) {
    return JSON.parse(JSON.stringify(data));
  }
}

export namespace RichTextStagedFileUtils {
  export const TMP_PREFIX_SCHEMA = "grida-tmp://";
  export const TMP_SUFFIX_QUERY = "?grida-tmp=true";

  // Define the prefix and suffix regex patterns
  const _TMP_PREFIX_REGEXP = /grida-tmp:\/\//;
  const _TMP_SUFFIX_REGEXP = /\?grida-tmp=true/;
  const _PATH_REGEXP = /grida-tmp:\/\/(.+)\?grida-tmp=true/g;

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

    // Define the formatter function
    const formatter = (
      match: string,
      ps: { prefix: string; suffix: string }
    ) => {
      return files[match].publicUrl || `${ps.prefix}${match}${ps.suffix}`;
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
