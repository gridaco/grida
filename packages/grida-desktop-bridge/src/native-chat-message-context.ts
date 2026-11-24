import { NativeChatSkills } from "./native-chat-skills";

/** Passive data accepted with a chat message. All fields are data, including modelText. */
export type NativeChatMessageContext = Readonly<{
  modelText: string;
  displayParts: readonly NativeChatDisplayPart[];
}>;

export type NativeChatDisplayPart = Readonly<{
  kind: string;
  version: number;
  data: Readonly<Record<string, ContextValue>>;
}>;

type ContextValue =
  | null
  | boolean
  | number
  | string
  | readonly ContextValue[]
  | Readonly<{ [key: string]: ContextValue }>;

const MAX_BYTES = 16 * 1024;
const MAX_PARTS = 16;
const MAX_DEPTH = 8;
const KIND = /^[a-z][a-z0-9.-]{0,63}$/;
const utf8 = new TextEncoder();

/** Validate a context independently of any particular display part schema. */
export function parseNativeChatMessageContext(
  value: unknown
): NativeChatMessageContext | null {
  if (
    !record(value) ||
    Object.keys(value).length !== 2 ||
    typeof value.modelText !== "string" ||
    value.modelText.length > MAX_BYTES ||
    !value.modelText.trim()
  )
    return null;
  const displayParts = parseNativeChatDisplayParts(value.displayParts);
  if (!displayParts || displayParts.some(({ kind }) => kind === "skill"))
    return null;
  const context = { modelText: value.modelText, displayParts };
  return fits(context) ? context : null;
}

export function parseNativeChatDisplayParts(
  value: unknown
): readonly NativeChatDisplayPart[] | null {
  return parseParts(value, false);
}

/** Host-authored skill parts have a separate bound from caller-supplied display context. */
export function parseNativeChatHostDisplayParts(
  value: unknown
): readonly NativeChatDisplayPart[] | null {
  return parseParts(value, true);
}

function parseParts(
  value: unknown,
  host: boolean
): readonly NativeChatDisplayPart[] | null {
  const maxSkills = host ? NativeChatSkills.maxSelected : 0;
  if (!Array.isArray(value) || value.length > MAX_PARTS + maxSkills)
    return null;
  const remaining = { units: MAX_BYTES };
  const parts: NativeChatDisplayPart[] = [];
  const context: NativeChatDisplayPart[] = [];
  let skills = 0;
  for (const part of value) {
    if (host && record(part) && part.kind === "skill") {
      const skill = NativeChatSkills.displayPart(part);
      if (!skill || ++skills > maxSkills) return null;
      parts.push({ kind: "skill", version: 1, data: skill });
      continue;
    }
    if (
      !record(part) ||
      Object.keys(part).length !== 3 ||
      typeof part.kind !== "string" ||
      !KIND.test(part.kind) ||
      typeof part.version !== "number" ||
      !Number.isInteger(part.version) ||
      part.version < 1 ||
      part.version > 65535 ||
      !record(part.data) ||
      !json(part.data, 0, remaining)
    )
      return null;
    const entry = { kind: part.kind, version: part.version, data: part.data };
    parts.push(entry);
    context.push(entry);
  }
  return context.length <= MAX_PARTS && fits(context) ? parts : null;
}

function fits(value: unknown): boolean {
  return utf8.encode(JSON.stringify(value)).byteLength <= MAX_BYTES;
}

function record(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function json(
  value: unknown,
  depth: number,
  remaining: { units: number }
): value is ContextValue {
  // The traversal budget bounds the work before measuring the encoded form.
  remaining.units -= typeof value === "string" ? value.length + 1 : 1;
  if (depth > MAX_DEPTH || remaining.units < 0) return false;
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!json(entry, depth + 1, remaining)) return false;
    }
    return true;
  }
  if (!record(value)) return false;
  for (const key of Object.keys(value)) {
    remaining.units -= key.length;
    if (!json(value[key], depth + 1, remaining)) return false;
  }
  return true;
}
