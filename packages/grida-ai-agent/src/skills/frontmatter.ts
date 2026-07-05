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
 *
 * The strict {@link parseSkillManifest} below (used by discovery + the load
 * step) validates the FULL agentskills.io frontmatter with a real YAML parser
 * so nested fields like `metadata.also_in_load` are available.
 */

import { parse as parseYaml } from "yaml";

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

// ---------------------------------------------------------------------------
// Strict agentskills.io manifest (https://agentskills.io/specification).
//
// The loose reader above is enough to advertise a skill (name + description).
// The strict reader below validates the full frontmatter and preserves the
// optional `metadata` object verbatim, so a skill can carry extension fields
// (e.g. `also_in_load`) that the load step reads. Uses a real YAML parser
// because `metadata` is a nested mapping the scalar reader can't see.
// ---------------------------------------------------------------------------

/** Parsed manifest — the agentskills.io frontmatter contract. `name` +
 *  `description` are required; the rest are optional. Extension fields live
 *  under `metadata` and round-trip unchanged. */
export type SkillManifest = {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  /** Accepts the spec's `allowed-tools` or a camelCase `allowedTools`. */
  allowedTools?: string[];
  metadata?: Record<string, unknown>;
};

export type ParsedSkillManifest = {
  manifest: SkillManifest;
  /** Everything after the closing `---` delimiter. */
  body: string;
};

/** No opening/closing `---` frontmatter block. */
export class MissingFrontmatterError extends Error {
  constructor(message = "SKILL.md is missing required frontmatter") {
    super(message);
    this.name = "MissingFrontmatterError";
  }
}

/** Frontmatter parsed but failed the schema (missing `name`/`description`,
 *  malformed YAML, or an invalid value shape). */
export class InvalidFrontmatterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidFrontmatterError";
  }
}

const MANIFEST_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** agentskills.io name convention: lowercase letters, digits, hyphens; starts
 *  with a letter. Kept in sync with the discovery name check. */
export const SKILL_NAME_RE = /^[a-z][a-z0-9-]*$/;

/**
 * Parse a SKILL.md into `{ manifest, body }`, validating the required
 * agentskills.io fields and normalising `allowed-tools` → `allowedTools`.
 * `metadata` is preserved verbatim.
 *
 * @throws {MissingFrontmatterError} when there is no `---` block
 * @throws {InvalidFrontmatterError} when required fields are missing or the
 *   YAML is malformed
 */
export function parseSkillManifest(md: string): ParsedSkillManifest {
  const text = md.replace(/^﻿/, "");
  const match = MANIFEST_RE.exec(text);
  if (!match) throw new MissingFrontmatterError();
  const [, yamlSrc, body] = match;

  let fm: unknown;
  try {
    fm = parseYaml(yamlSrc);
  } catch (err) {
    throw new InvalidFrontmatterError(
      `Failed to parse YAML frontmatter: ${(err as Error).message}`
    );
  }
  if (fm === null || typeof fm !== "object" || Array.isArray(fm)) {
    throw new InvalidFrontmatterError("Frontmatter must be a YAML mapping");
  }
  const obj = fm as Record<string, unknown>;

  const name = obj.name;
  if (typeof name !== "string" || name.length === 0) {
    throw new InvalidFrontmatterError(
      "Frontmatter `name` is required and must be a string"
    );
  }
  if (!SKILL_NAME_RE.test(name)) {
    throw new InvalidFrontmatterError(
      `Frontmatter \`name\` must match ${SKILL_NAME_RE} (got "${name}")`
    );
  }

  const description = obj.description;
  if (typeof description !== "string" || description.trim().length === 0) {
    throw new InvalidFrontmatterError(
      "Frontmatter `description` is required and must be a non-empty string"
    );
  }

  const manifest: SkillManifest = { name, description: description.trim() };

  if (obj.license !== undefined) {
    if (typeof obj.license !== "string") {
      throw new InvalidFrontmatterError("`license` must be a string");
    }
    manifest.license = obj.license;
  }
  if (obj.compatibility !== undefined) {
    if (typeof obj.compatibility !== "string") {
      throw new InvalidFrontmatterError("`compatibility` must be a string");
    }
    manifest.compatibility = obj.compatibility;
  }
  const allowed = obj["allowed-tools"] ?? obj.allowedTools;
  if (allowed !== undefined) {
    if (
      !Array.isArray(allowed) ||
      !allowed.every((t) => typeof t === "string")
    ) {
      throw new InvalidFrontmatterError(
        "`allowed-tools` must be an array of strings"
      );
    }
    manifest.allowedTools = [...(allowed as string[])];
  }
  if (obj.metadata !== undefined) {
    if (
      obj.metadata === null ||
      typeof obj.metadata !== "object" ||
      Array.isArray(obj.metadata)
    ) {
      throw new InvalidFrontmatterError("`metadata` must be a mapping");
    }
    manifest.metadata = { ...(obj.metadata as Record<string, unknown>) };
  }

  return { manifest, body: body ?? "" };
}
