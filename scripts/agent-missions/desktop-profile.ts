// Stage the launch permission profile Grida Desktop uses for a workspace, so
// missions can run headlessly under exactly the Desktop policy.
// Usage: tsx desktop-profile.ts <workspace> <state-directory> <resources>
import fs from "node:fs";
import { NativeCommandProfiles } from "../../desktop/src/main/native-agent-command-profile";
import { NativeAgentPermissions } from "../../desktop/src/main/native-agent-permissions";

const [workspace, stateDirectory, resources] = process.argv.slice(2);
if (!workspace || !stateDirectory || !resources) {
  console.error(
    "usage: desktop-profile.ts <workspace> <state-directory> <resources>"
  );
  process.exit(2);
}
async function main() {
  const primary = fs.realpathSync(workspace);
  const command = await NativeCommandProfiles.launch(resources, primary);
  const { profile } = await NativeAgentPermissions.stage(
    stateDirectory,
    {
      id: "mission",
      primary: { id: "project", name: "Project", path: primary },
      additionalReadRoots: [],
      protectedPaths: [],
    },
    undefined,
    command
  );
  console.log(profile);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
