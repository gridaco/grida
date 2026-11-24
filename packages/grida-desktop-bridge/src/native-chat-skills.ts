/** Metadata for one native skill. Paths and instructions stay with the host. */
export type NativeChatSkill = Readonly<{
  name: string;
  description: string;
  source: "project_agents" | "project_claude" | "personal" | "bundled";
  extension?: string;
  revision: string;
  uri: string;
}>;

/** An exact catalog selection. The host validates the reference at admission. */
export type NativeChatSkillReference = Readonly<{
  name: string;
  uri: string;
  workspaceId?: string;
}>;

export namespace NativeChatSkills {
  export const maxSelected = 4;
  export const uriPrefix = "grida-skill:";
  // Accept the existing selector grammar, including qualified extension names.
  const URI =
    /^grida-skill:(?:([a-z0-9][a-z0-9-]{0,63})\/)?([a-z0-9][a-z0-9-]{0,63})@([0-9a-f]{64})$/;
  const SOURCES = new Set<unknown>([
    "project_agents",
    "project_claude",
    "personal",
    "bundled",
  ]);

  export function selector(uri: unknown) {
    if (typeof uri !== "string" || uri.length > 206) return null;
    const match = URI.exec(uri);
    if (!match || match[0] !== uri) return null;
    const [, extension, name, revision] = match;
    return { name, revision, ...(extension && { extension }) };
  }

  export function references(
    value: unknown
  ): readonly NativeChatSkillReference[] | null {
    if (!Array.isArray(value) || value.length > maxSelected) return null;
    const selected: NativeChatSkillReference[] = [];
    const seen = new Set<string>();
    for (const entry of value) {
      const row = record(entry);
      if (!row) return null;
      const { name, uri, workspaceId } = row;
      if (
        Object.keys(row).some(
          (key) => key !== "name" && key !== "uri" && key !== "workspaceId"
        ) ||
        !Object.hasOwn(row, "name") ||
        !Object.hasOwn(row, "uri") ||
        typeof uri !== "string" ||
        typeof name !== "string" ||
        selector(uri)?.name !== name ||
        (workspaceId !== undefined &&
          (typeof workspaceId !== "string" ||
            !/^[A-Za-z0-9_-]{1,128}$/.test(workspaceId))) ||
        seen.has(uri)
      )
        return null;
      seen.add(uri);
      selected.push({
        name,
        uri,
        ...(typeof workspaceId === "string" && { workspaceId }),
      });
    }
    return selected;
  }

  export function displayPart(
    value: unknown
  ): Pick<NativeChatSkill, "name" | "source" | "extension" | "uri"> | null {
    const part = record(value);
    const data = record(part?.data);
    if (!data || part?.kind !== "skill" || part.version !== 1) return null;
    const { name, uri, source, extension } = data;
    const identity = selector(uri);
    if (
      !identity ||
      typeof uri !== "string" ||
      identity.name !== name ||
      identity.extension !== extension ||
      (extension !== undefined && source !== "bundled") ||
      !SOURCES.has(source) ||
      Object.keys(data).length !== (extension === undefined ? 3 : 4)
    )
      return null;
    return {
      name: identity.name,
      uri,
      source: source as NativeChatSkill["source"],
      ...(identity.extension && { extension: identity.extension }),
    };
  }

  export function catalog(value: unknown): readonly NativeChatSkill[] | null {
    const result = record(value);
    if (!Array.isArray(result?.skills) || result.skills.length > 128)
      return null;
    const skills: NativeChatSkill[] = [];
    const seen = new Set<string>();
    for (const entry of result.skills) {
      const row = record(entry);
      if (!row) return null;
      const { name, description, source, extension, revision, uri } = row;
      const identity = selector(uri);
      if (
        !identity ||
        identity.name !== name ||
        identity.revision !== revision ||
        identity.extension !== extension ||
        typeof description !== "string" ||
        !description.trim() ||
        description.length > 2048 ||
        !SOURCES.has(source) ||
        (extension !== undefined && source !== "bundled") ||
        typeof uri !== "string" ||
        seen.has(uri)
      )
        return null;
      seen.add(uri);
      skills.push({
        ...identity,
        description,
        source: source as NativeChatSkill["source"],
        uri,
      });
    }
    return skills;
  }

  function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }
}
