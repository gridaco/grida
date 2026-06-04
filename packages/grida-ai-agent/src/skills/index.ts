/**
 * Skills layer (RFC `skills`): lazy, advertise-then-load knowledge, plus
 * eager project instructions. The `skill` tool + discovery + the prompt
 * index blocks live here; the run path wires them per session.
 */

export {
  discoverSkills,
  readSkillBody,
  nodeSkillBodyLoader,
  type DiscoverSkillsOptions,
} from "./discovery";
export type {
  DiscoveredSkill,
  SkillBodyCache,
  SkillBodyLoader,
  SkillIndex,
  SkillSource,
} from "./types";
export {
  discoverProjectInstructions,
  INSTRUCTION_FILENAMES,
  type DiscoverProjectInstructionsOptions,
  type ProjectInstructions,
  type ProjectInstructionFile,
} from "./project-instructions";
export {
  createSkillTool,
  renderSkillIndex,
  wrapSkillContent,
  SKILL_TOOL_NAME,
  type CreateSkillToolOptions,
  type SkillToolName,
} from "./skill-tool";
export { parseFrontmatter, type Frontmatter } from "./frontmatter";
