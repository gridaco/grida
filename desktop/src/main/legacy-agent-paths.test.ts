import { expect, it } from "vitest";
import { LegacyAgentPaths } from "./legacy-agent-paths";

it("names the scratch base earlier agent hosts derived from their userData", () => {
  // Value produced by the released TypeScript agent for the same inputs.
  expect(
    LegacyAgentPaths.scratchBase("/Users/test/.grida/agent", "/var/tmp")
  ).toBe("/var/tmp/grida-agent-fa7107c4eeda465d");
});
