/**
 * Client-safe skill types (no `node:*`). The discovery + body-read logic
 * lives in `./discovery` (server-only); the `skill` tool and prompt
 * rendering import only these types so the client-safe package root
 * (`index.ts` → `createAgent`) never pulls `node:fs` into its graph.
 * Mirrors the `@grida/agent/fs` split: env-restricted backends stay off
 * the neutral surface.
 */

export type SkillSource = "project" | "user" | "config" | "bundled" | "remote";

export type DiscoveredSkill = {
  /** kebab-case id; the handle the model passes to the `skill` tool. */
  name: string;
  /** One-line "when to use this" — the only thing injected up front. */
  description: string;
  /** Absolute path to the SKILL.md file. */
  path: string;
  source: SkillSource;
};

export type SkillIndex = {
  /** Discovered skills in precedence order (first-wins already applied). */
  skills: DiscoveredSkill[];
  /** name → skill, for the `skill` tool's lookup. */
  by_name: Map<string, DiscoveredSkill>;
};

/** Per-session cache of already-loaded skill bodies (name → wrapped body). */
export type SkillBodyCache = Map<string, string>;

/** Reads a skill's instructional body. Injected so the `skill` tool stays
 *  client-safe (the node-fs implementation lives in `./discovery`). */
export type SkillBodyLoader = (skill: DiscoveredSkill) => Promise<string>;
