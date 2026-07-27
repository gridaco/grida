import fs from "node:fs/promises";
import path from "node:path";

const FILE_NAME = "onboarding.json";
const VERSION = 1;

type PersistedOnboardingState = {
  version: typeof VERSION;
  completed: true;
};

/**
 * Native first-run state.
 *
 * Electron must choose the canonical entry window's compact onboarding role
 * before an authenticated renderer is presented. The renderer keeps its
 * legacy localStorage flag as a one-launch migration path, while this
 * host-owned file is authoritative for subsequent launches.
 */
export namespace onboarding_state {
  export async function isComplete(userDataPath: string): Promise<boolean> {
    try {
      const raw = await fs.readFile(filePath(userDataPath), "utf8");
      const state = JSON.parse(raw) as Partial<PersistedOnboardingState>;
      return state.version === VERSION && state.completed === true;
    } catch {
      return false;
    }
  }

  export async function markComplete(userDataPath: string): Promise<void> {
    await fs.mkdir(userDataPath, { recursive: true });
    const state: PersistedOnboardingState = {
      version: VERSION,
      completed: true,
    };
    await fs.writeFile(filePath(userDataPath), JSON.stringify(state), {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  function filePath(userDataPath: string): string {
    return path.join(userDataPath, FILE_NAME);
  }
}
