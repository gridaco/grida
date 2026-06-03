/**
 * Minimal SKILL.md frontmatter reader.
 *
 * Skills carry YAML frontmatter, but the only fields this layer reads are
 * `name` and `description` (RFC `skills / manifest`). Real skills use
 * folded block scalars for the description (`description: >-` then an
 * indented block), so a naive `key: value` split won't do — but a full
 * YAML parser is overkill for two fields. This reads top-level scalars,
 * including `>`/`|` block scalars, and ignores everything else
 * (`keywords`, `metadata`, `tags`).
 */

export type Frontmatter = {
  /** Raw parsed top-level string fields (name, description, …). */
  fields: Record<string, string>;
  /** Document body after the closing `---`. */
  body: string;
};

/**
 * Split a Markdown document into its YAML frontmatter fields and body.
 * A document with no leading `---` block yields empty fields and the
 * whole input as body.
 */
export function parseFrontmatter(raw: string): Frontmatter {
  const text = raw.replace(/^﻿/, "");
  // Frontmatter MUST open on line 1 with `---`.
  const open = /^---[ \t]*\r?\n/.exec(text);
  if (!open) return { fields: {}, body: text };
  const rest = text.slice(open[0].length);
  const close = /\r?\n---[ \t]*(?:\r?\n|$)/.exec(rest);
  if (!close) return { fields: {}, body: text };
  const yaml = rest.slice(0, close.index);
  const body = rest.slice(close.index + close[0].length);
  return { fields: parseTopLevelScalars(yaml), body };
}

function parseTopLevelScalars(yaml: string): Record<string, string> {
  const lines = yaml.split(/\r?\n/);
  const out: Record<string, string> = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().length === 0) {
      i += 1;
      continue;
    }
    // Only column-0 lines are top-level keys; indented lines are nested
    // content (e.g. under `metadata:`) we don't track here.
    if (/^\s/.test(line)) {
      i += 1;
      continue;
    }
    const m = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(line);
    if (!m) {
      i += 1;
      continue;
    }
    const key = m[1];
    const inline = m[2];
    if (/^[|>][+-]?\s*$/.test(inline)) {
      // Block scalar: collect following blank/indented lines, fold to a
      // single line (we only ever render these as a one-line description).
      const collected: string[] = [];
      i += 1;
      while (i < lines.length) {
        const l = lines[i];
        if (l.trim().length === 0 || /^\s/.test(l)) {
          collected.push(l.trim());
          i += 1;
          continue;
        }
        break;
      }
      out[key] = collected
        .filter((l) => l.length > 0)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      continue;
    }
    out[key] = stripQuotes(inline.trim());
    i += 1;
  }
  return out;
}

function stripQuotes(v: string): string {
  if (v.length >= 2) {
    const a = v[0];
    const b = v[v.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) {
      return v.slice(1, -1);
    }
  }
  return v;
}
