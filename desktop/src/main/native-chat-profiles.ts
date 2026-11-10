// GRIDA-SEC-004 / GRIDA-SEC-014 — saved chat owners bind one approved model route.
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
  byokProvidersFor,
  isValidEndpointProviderId,
  type EndpointProviderConfig,
} from "@grida/agent";
import { catalog } from "@grida/ai/catalogue";
import type { NativeChatProfileChoice } from "@grida/desktop-bridge";
import { NativeProviderSelection } from "./native-provider-selection";

const FILENAME = "chat-profiles.json";
const PROFILE_ID = /^[a-f0-9]{64}$/;
const MAX_SAVED = 24;
const MAX_BYTES = 24 * 1024;
const MAX_CHOICES = 256;
const MAX_ENDPOINTS = 16;
type Launch = Awaited<
  ReturnType<typeof NativeProviderSelection.configuredEndpoint>
>;
type Resolve = (providerId: string, modelId?: string) => Promise<Launch>;

export namespace NativeChatProfiles {
  export type Saved = NativeChatProfileChoice &
    Readonly<{ providerId: string; modelId: string }>;

  export function validId(id: unknown): id is string {
    return typeof id === "string" && PROFILE_ID.test(id);
  }

  export function binding(providerId: string, launch: Launch): string {
    const base = new URL(launch.endpoint);
    base.pathname = base.pathname.replace(/\/$/, "");
    const builtIn = NativeProviderSelection.isBuiltInByok(providerId);
    return createHash("sha256")
      .update(
        JSON.stringify([
          builtIn
            ? "desktop-builtin-byok-chat-v1"
            : "desktop-compatible-chat-v1",
          providerId,
          launch.provider,
          base.href,
          builtIn || launch.configuredEndpointKey ? "stored" : "anonymous",
          launch.model,
        ])
      )
      .digest("hex");
  }

  export async function builtInChoices(
    resolve: (providerId: string, modelId: string) => Promise<Launch>
  ): Promise<Saved[]> {
    const models = catalog.text.listed_models();
    const sample = models[0];
    if (!sample) return [];
    const choices: Saved[] = [];
    for (const { id, label: connection } of byokProvidersFor("text")) {
      if (!NativeProviderSelection.isBuiltInByok(id)) continue;
      // All listed text choices use the same fixed route and credential owner.
      const eligible = await resolve(id, sample.id).catch(() => null);
      if (!eligible) continue;
      for (const model of models) {
        choices.push({
          id: binding(id, { ...eligible, model: model.id }),
          providerId: id,
          modelId: model.id,
          connection,
          model: label(catalog.text.displayLabel(model), model.id),
        });
      }
    }
    return choices;
  }

  /** Model settings supply choices; the existing native resolver decides eligibility. */
  export async function choices(
    endpoints: readonly EndpointProviderConfig[],
    resolve: Resolve
  ): Promise<Saved[]> {
    const choices: Saved[] = [];
    for (const endpoint of endpoints.slice(0, MAX_ENDPOINTS)) {
      if (!isValidEndpointProviderId(endpoint.id)) continue;
      const eligible = await resolve(endpoint.id).catch(() => null);
      if (!eligible || eligible.endpoint !== endpoint.base_url) continue;
      for (const model of endpoint.models) {
        if (choices.length >= MAX_CHOICES) return choices;
        if (!modelId(model.id)) continue;
        choices.push({
          id: binding(endpoint.id, { ...eligible, model: model.id }),
          providerId: endpoint.id,
          modelId: model.id,
          connection: label(endpoint.label, endpoint.id),
          model: label(model.label, model.id),
        });
      }
    }
    return choices;
  }

  export async function read(directory: string): Promise<Saved[]> {
    if (!(await privateDirectory(directory))) return [];
    const handle = await fs
      .open(
        path.join(directory, FILENAME),
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
      )
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    if (!handle) return [];
    try {
      const stat = await handle.stat();
      if (
        !stat.isFile() ||
        stat.uid !== process.geteuid?.() ||
        stat.nlink !== 1 ||
        (stat.mode & 0o7777) !== 0o600 ||
        stat.size > MAX_BYTES
      )
        throw invalid();
      const buffer = Buffer.alloc(MAX_BYTES + 1);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead !== stat.size) throw invalid();
      const entries: unknown = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          buffer.subarray(0, bytesRead)
        )
      );
      if (
        !Array.isArray(entries) ||
        entries.length > MAX_SAVED ||
        !entries.every(saved) ||
        new Set(entries.map(({ id }) => id)).size !== entries.length
      )
        throw invalid();
      return entries;
    } catch {
      throw invalid();
    } finally {
      await handle.close();
    }
  }

  /** Main serializes writes. No selected profile can change an existing receipt. */
  export async function remember(
    directory: string,
    profile: Saved,
    requireCurrent: () => void
  ) {
    const before = await privateDirectory(directory);
    if (!before) throw invalid();
    const entries = await read(directory);
    if (entries.some(({ id }) => id === profile.id)) return;
    if (entries.length >= MAX_SAVED)
      throw new Error("native_chat_profile_limit");
    const encoded = Buffer.from(JSON.stringify([...entries, profile]));
    if (encoded.length > MAX_BYTES) throw invalid();
    const target = path.join(directory, FILENAME);
    const stage = path.join(directory, `.chat-profiles-${randomUUID()}.tmp`);
    try {
      const handle = await fs.open(stage, "wx", 0o600);
      try {
        await handle.writeFile(encoded);
        await handle.sync();
      } finally {
        await handle.close();
      }
      const current = await privateDirectory(directory);
      if (current?.dev !== before.dev || current.ino !== before.ino)
        throw invalid();
      requireCurrent();
      await fs.rename(stage, target);
      const parent = await fs.open(
        directory,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
      );
      try {
        await parent.sync();
      } finally {
        await parent.close();
      }
    } finally {
      await fs.unlink(stage).catch(() => {});
    }
  }
}

async function privateDirectory(directory: string) {
  const stat = await fs
    .lstat(directory)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  if (!stat) return undefined;
  if (
    !stat.isDirectory() ||
    stat.uid !== process.geteuid?.() ||
    (stat.mode & 0o7777) !== 0o700 ||
    (await fs.realpath(directory)) !== directory
  )
    throw invalid();
  return stat;
}

function label(value: string | undefined, fallback: string): string {
  return (
    (value ?? fallback).replace(/\p{C}/gu, "").trim().slice(0, 128) || fallback
  );
}

function modelId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    !/\p{C}/u.test(value)
  );
}

function saved(value: unknown): value is NativeChatProfiles.Saved {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<NativeChatProfiles.Saved>;
  return (
    Object.keys(entry).length === 5 &&
    NativeChatProfiles.validId(entry.id) &&
    typeof entry.providerId === "string" &&
    (isValidEndpointProviderId(entry.providerId) ||
      NativeProviderSelection.isBuiltInByok(entry.providerId)) &&
    modelId(entry.modelId) &&
    modelId(entry.connection) &&
    modelId(entry.model)
  );
}

function invalid(): Error {
  return new Error("native_chat_profiles_invalid");
}
