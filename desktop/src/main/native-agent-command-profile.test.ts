import { describe, expect, it } from "vitest";
import { NativeCommandProfiles } from "./native-agent-command-profile";

describe.skipIf(process.platform !== "darwin" && process.platform !== "linux")(
  "Native command profile",
  () => {
    it("starts programs from the person's shell environment without app variables", async () => {
      const environment = await NativeCommandProfiles.programEnvironment();
      expect(environment.PATH).toEqual(expect.any(String));
      expect(
        Object.keys(environment).filter(
          (name) => name.startsWith("GRIDA_") || name.startsWith("ELECTRON_")
        )
      ).toEqual([]);
      expect(
        Buffer.byteLength(JSON.stringify(environment))
      ).toBeLessThanOrEqual(24 * 1024);
    });
  }
);
