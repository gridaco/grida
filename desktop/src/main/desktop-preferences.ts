// GRIDA-SEC-005 — non-secret native onboarding authority for entry roles.
import fs from "node:fs/promises";
import path from "node:path";
import { atomicWrite } from "@grida/daemon/server";
import {
  isDesktopVoiceProvider,
  type DesktopVoiceProvider,
  type DesktopVoiceSettings,
} from "@grida/desktop-bridge";

type PersistedDesktopPreferences = Record<string, unknown> & {
  schema_version: number;
  onboarding: Record<string, unknown> & {
    completed_version: number;
  };
  migrations?: Record<string, unknown> & {
    renderer_onboarding_v1?: boolean;
  };
  voice?: unknown;
};

const SCHEMA_VERSION = 1;
const ONBOARDING_VERSION = 1;
const FILE_NAME = "preferences.json";
const LEGACY_ONBOARDING_FILE_NAME = "onboarding.json";

/**
 * Main-process owner for small desktop preferences. Voice credentials are
 * stored here only as safeStorage ciphertext.
 *
 * The file is read once at startup and all mutations are serialized, written
 * owner-only, and atomically published before the in-memory snapshot changes.
 * This store is deliberately not exposed as a generic renderer key/value API.
 */
export class DesktopPreferences {
  static readonly onboarding_version = ONBOARDING_VERSION;

  readonly #filePath: string;
  readonly #writable: boolean;
  #value: PersistedDesktopPreferences;
  #writeQueue: Promise<void> = Promise.resolve();

  private constructor({
    file_path,
    value,
    writable,
  }: {
    file_path: string;
    value: PersistedDesktopPreferences;
    writable: boolean;
  }) {
    this.#filePath = file_path;
    this.#value = value;
    this.#writable = writable;
  }

  static async open({
    user_data_path,
  }: {
    user_data_path: string;
  }): Promise<DesktopPreferences> {
    const filePath = path.join(user_data_path, FILE_NAME);
    const loaded = await readPreferences(filePath);
    const preferences = new DesktopPreferences({
      file_path: filePath,
      value: loaded.value,
      writable: loaded.writable,
    });

    // Migrate the former native file here. The entry controller separately
    // consumes the old renderer flag through one fixed hidden probe, then
    // records that migration in this same main-owned store.
    if (
      loaded.missing &&
      (await readLegacyOnboardingCompletion(user_data_path))
    ) {
      await preferences.completeOnboarding();
    }

    return preferences;
  }

  isOnboardingComplete(): boolean {
    return this.#value.onboarding.completed_version >= ONBOARDING_VERSION;
  }

  needsLegacyRendererOnboardingMigration(): boolean {
    return (
      this.#writable && this.#value.migrations?.renderer_onboarding_v1 !== true
    );
  }

  completeLegacyRendererOnboardingMigration(completed: boolean): Promise<void> {
    return this.#setOnboardingState({
      completed_version: completed ? ONBOARDING_VERSION : undefined,
      renderer_migration_complete: true,
    });
  }

  completeOnboarding(): Promise<void> {
    return this.#setOnboardingState({
      completed_version: ONBOARDING_VERSION,
      renderer_migration_complete: true,
    });
  }

  resetOnboarding(): Promise<void> {
    return this.#setOnboardingState({
      completed_version: 0,
      renderer_migration_complete: true,
    });
  }

  getVoice(): DesktopPreferences.Voice {
    const voice = isRecord(this.#value.voice) ? this.#value.voice : {};
    const dictionary = Array.isArray(voice.dictionary) ? voice.dictionary : [];
    return {
      credential: voiceCredential(voice),
      useApiKey: voice.useApiKey === undefined || voice.useApiKey === true,
      microphoneId:
        typeof voice.microphoneId === "string" ? voice.microphoneId : "default",
      language: typeof voice.language === "string" ? voice.language : "auto",
      dictionary: dictionary
        .slice(0, 200)
        .filter((entry): entry is string => typeof entry === "string"),
    };
  }

  updateVoice(
    update: (
      voice: DesktopPreferences.Voice
    ) => DesktopPreferences.Voice | Promise<DesktopPreferences.Voice>,
    { replaceCredential = false }: { replaceCredential?: boolean } = {}
  ): Promise<void> {
    return this.#update(async () => {
      const stored = isRecord(this.#value.voice) ? this.#value.voice : {};
      const { credential, ...settings } = await update(this.getVoice());
      return {
        ...this.#value,
        // A preferences edit does not migrate or reactivate legacy credentials.
        voice: replaceCredential
          ? { ...settings, credential }
          : { ...stored, ...settings },
      };
    });
  }

  #setOnboardingState({
    completed_version: completedVersion,
    renderer_migration_complete: rendererMigrationComplete,
  }: {
    completed_version?: number;
    renderer_migration_complete?: boolean;
  }): Promise<void> {
    return this.#update(
      (): PersistedDesktopPreferences => ({
        ...this.#value,
        schema_version: SCHEMA_VERSION,
        onboarding: {
          ...this.#value.onboarding,
          completed_version:
            completedVersion ?? this.#value.onboarding.completed_version,
        },
        ...(rendererMigrationComplete === undefined
          ? {}
          : {
              migrations: {
                ...this.#value.migrations,
                renderer_onboarding_v1: rendererMigrationComplete,
              },
            }),
      })
    );
  }

  #update(
    update: () =>
      | PersistedDesktopPreferences
      | Promise<PersistedDesktopPreferences>
  ): Promise<void> {
    const operation = this.#writeQueue.then(async () => {
      if (!this.#writable) {
        throw new Error(
          "Desktop preferences were written by a newer Grida version"
        );
      }
      const next = await update();
      await atomicWrite(this.#filePath, `${JSON.stringify(next, null, 2)}\n`);
      this.#value = next;
    });

    // A failed mutation must reject its caller without poisoning later writes.
    this.#writeQueue = operation.catch(() => undefined);
    return operation;
  }
}

export namespace DesktopPreferences {
  export type Voice = Omit<DesktopVoiceSettings, "provider"> & {
    useApiKey: boolean;
    credential?: VoiceCredential;
  };
  export type VoiceCredential =
    | { version: 0; provider: "openai"; ciphertext: string }
    | { version: 1; provider: DesktopVoiceProvider; ciphertext: string };
}

function voiceCredential(
  voice: Record<string, unknown>
): DesktopPreferences.VoiceCredential | undefined {
  if (isRecord(voice.credential)) {
    const { provider, version, ciphertext } = voice.credential;
    if (
      version === 1 &&
      isDesktopVoiceProvider(provider) &&
      isVoiceCiphertext(ciphertext)
    ) {
      return { version, provider, ciphertext };
    }
  }
  if (
    voice.credential === undefined &&
    voice.useKey === true &&
    isVoiceCiphertext(voice.keyCiphertext)
  ) {
    return { version: 0, provider: "openai", ciphertext: voice.keyCiphertext };
  }
}

function isVoiceCiphertext(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 16_384 &&
    value.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(value)
  );
}

type LoadedPreferences = {
  value: PersistedDesktopPreferences;
  writable: boolean;
  missing: boolean;
};

async function readPreferences(filePath: string): Promise<LoadedPreferences> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {
        value: defaults(),
        writable: true,
        missing: true,
      };
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      value: defaults(),
      writable: true,
      missing: false,
    };
  }

  const futureSchemaVersion = readFutureSchemaVersion(parsed);
  const value = validatedPreferences(parsed);
  if (futureSchemaVersion !== null) {
    const futureValue = value ?? {
      schema_version: futureSchemaVersion,
      onboarding: {},
    };
    return {
      // Onboarding is optional UX. A downgraded build skips every unknown
      // future onboarding state instead of stranding the user, while the
      // read-only store guarantees that it cannot destroy the future file.
      value: {
        ...futureValue,
        onboarding: {
          ...futureValue.onboarding,
          completed_version: ONBOARDING_VERSION,
        },
      },
      writable: false,
      missing: false,
    };
  }
  if (!value) {
    return {
      value: defaults(),
      writable: true,
      missing: false,
    };
  }
  return {
    value,
    // A downgraded binary may read the known fields but must never overwrite
    // a document whose newer schema it cannot fully understand.
    writable: value.schema_version === SCHEMA_VERSION,
    missing: false,
  };
}

function readFutureSchemaVersion(value: unknown): number | null {
  if (
    !isRecord(value) ||
    typeof value.schema_version !== "number" ||
    !Number.isInteger(value.schema_version) ||
    value.schema_version <= SCHEMA_VERSION
  ) {
    return null;
  }
  return value.schema_version;
}

function validatedPreferences(
  value: unknown
): PersistedDesktopPreferences | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.schema_version !== "number" ||
    !Number.isInteger(value.schema_version) ||
    value.schema_version < SCHEMA_VERSION
  ) {
    return null;
  }
  if (!isRecord(value.onboarding)) return null;
  if (
    typeof value.onboarding.completed_version !== "number" ||
    !Number.isInteger(value.onboarding.completed_version) ||
    value.onboarding.completed_version < 0
  ) {
    return null;
  }
  if (
    value.migrations !== undefined &&
    (!isRecord(value.migrations) ||
      (value.migrations.renderer_onboarding_v1 !== undefined &&
        typeof value.migrations.renderer_onboarding_v1 !== "boolean"))
  ) {
    return null;
  }
  return value as PersistedDesktopPreferences;
}

function defaults(): PersistedDesktopPreferences {
  return {
    schema_version: SCHEMA_VERSION,
    onboarding: {
      completed_version: 0,
    },
  };
}

async function readLegacyOnboardingCompletion(
  userDataPath: string
): Promise<boolean> {
  try {
    const raw = await fs.readFile(
      path.join(userDataPath, LEGACY_ONBOARDING_FILE_NAME),
      "utf8"
    );
    const value: unknown = JSON.parse(raw);
    return isRecord(value) && value.version === 1 && value.completed === true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
