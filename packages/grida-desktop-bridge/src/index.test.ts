// GRIDA-SEC-004 / GRIDA-SEC-008 — renderer-safe bridge contract pins.
import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  MusicGenerateRequest,
  MusicGenerateResult,
  SoundEffectGenerateRequest,
  SoundEffectGenerateResult,
  TextToSpeechGenerateRequest,
  TextToSpeechGenerateResult,
  TextToSpeechListVoicesResult,
  ThreeDGenerateRequest,
  ThreeDGenerateResult,
} from "@grida/agent";
import type { MediaItem } from "@grida/daemon";
import type {
  ChatGptConnectResult,
  DesktopBridge,
  DesktopMediaReadResult,
} from "./index";

describe("DesktopBridge ChatGPT connect result", () => {
  it("preserves status on success and exposes cancellation as a closed outcome", () => {
    type Connect = NonNullable<DesktopBridge["chatgpt"]>["connect"];
    expectTypeOf<
      Awaited<ReturnType<Connect>>
    >().toEqualTypeOf<ChatGptConnectResult>();

    const connected = {
      configured: true,
      signed_in: true,
      ready: true,
      signing_in: false,
    } satisfies ChatGptConnectResult;
    const cancelled = {
      outcome: "cancelled",
    } satisfies ChatGptConnectResult;

    expect(classify(connected)).toBe("connected");
    expect(classify(cancelled)).toBe("cancelled");
    expect(connected).toEqual({
      configured: true,
      signed_in: true,
      ready: true,
      signing_in: false,
    });
  });
});

describe("DesktopBridge media generation", () => {
  it("keeps the optional 3D and nested audio namespaces aligned with the agent transport", () => {
    type ThreeDGenerate = NonNullable<DesktopBridge["threeD"]>["generate"];
    type Audio = NonNullable<DesktopBridge["audio"]>;
    type MusicGenerate = NonNullable<Audio["music"]>["generate"];
    type SoundEffectsGenerate = NonNullable<Audio["soundEffects"]>["generate"];
    type TextToSpeech = NonNullable<Audio["textToSpeech"]>;

    expectTypeOf<
      Parameters<ThreeDGenerate>[0]
    >().toEqualTypeOf<ThreeDGenerateRequest>();
    expectTypeOf<
      Awaited<ReturnType<ThreeDGenerate>>
    >().toEqualTypeOf<ThreeDGenerateResult>();
    expectTypeOf<
      Parameters<MusicGenerate>[0]
    >().toEqualTypeOf<MusicGenerateRequest>();
    expectTypeOf<
      Awaited<ReturnType<MusicGenerate>>
    >().toEqualTypeOf<MusicGenerateResult>();
    expectTypeOf<
      Parameters<SoundEffectsGenerate>[0]
    >().toEqualTypeOf<SoundEffectGenerateRequest>();
    expectTypeOf<
      Awaited<ReturnType<SoundEffectsGenerate>>
    >().toEqualTypeOf<SoundEffectGenerateResult>();
    expectTypeOf<
      Awaited<ReturnType<TextToSpeech["listVoices"]>>
    >().toEqualTypeOf<TextToSpeechListVoicesResult>();
    expectTypeOf<
      Parameters<TextToSpeech["generate"]>[0]
    >().toEqualTypeOf<TextToSpeechGenerateRequest>();
    expectTypeOf<
      Awaited<ReturnType<TextToSpeech["generate"]>>
    >().toEqualTypeOf<TextToSpeechGenerateResult>();
  });
});

describe("DesktopBridge durable media", () => {
  it("exposes only path-free item ids, descriptors, and bytes", () => {
    type Media = NonNullable<DesktopBridge["media"]>;

    expectTypeOf<Awaited<ReturnType<Media["list"]>>>().toEqualTypeOf<
      MediaItem[]
    >();
    expectTypeOf<Parameters<Media["read"]>>().toEqualTypeOf<[id: string]>();
    expectTypeOf<
      Awaited<ReturnType<Media["read"]>>
    >().toEqualTypeOf<DesktopMediaReadResult>();
    expectTypeOf<Parameters<Media["reveal"]>>().toEqualTypeOf<[id: string]>();

    const item = {
      id: "018f0170-8c80-4f2e-87db-346fbbdf7c56",
      file_name: "model.glb",
      media_type: "model/gltf-binary",
      byte_size: 3,
      created_at: 1,
    } satisfies MediaItem;
    const result = {
      item,
      bytes: Uint8Array.from([1, 2, 3]).buffer,
    } satisfies DesktopMediaReadResult;
    expect(result).not.toHaveProperty("path");
    expect(result.item).not.toHaveProperty("path");
  });
});

function classify(result: ChatGptConnectResult): "connected" | "cancelled" {
  if (result.outcome === "cancelled") return "cancelled";
  expectTypeOf(result.ready).toEqualTypeOf<boolean>();
  return "connected";
}
