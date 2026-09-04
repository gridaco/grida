import { describe, expect, it, vi } from "vitest";
import type { TextToSpeechListVoicesResult } from "@/lib/desktop/bridge";
import type { ElevenLabsConnection } from "./elevenlabs-connection-state";
import { TextToSpeechVoiceCatalogue } from "./text-to-speech-voice-catalogue";

type ListVoices = () => Promise<TextToSpeechListVoicesResult>;
type RefreshConnection = () => Promise<ElevenLabsConnection.State>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("TextToSpeechVoiceCatalogue", () => {
  it("publishes a successful voice catalogue", async () => {
    const catalogue = new TextToSpeechVoiceCatalogue({
      listVoices: vi.fn<ListVoices>(async () => ({
        provider_id: "elevenlabs" as const,
        voices: [{ voice_id: "voice-a", name: "Alice" }],
      })),
      refreshConnection: vi.fn<RefreshConnection>(),
    });

    await catalogue.load();

    expect(catalogue.getSnapshot()).toEqual({
      kind: "ready",
      voices: [{ voice_id: "voice-a", name: "Alice" }],
      selectedVoiceId: null,
    });
  });

  it("retains a valid selection and clears one missing from a reload", async () => {
    const pages = [
      [
        { voice_id: "voice-a", name: "Alice" },
        { voice_id: "voice-b", name: "Bob" },
      ],
      [
        { voice_id: "voice-b", name: "Bob" },
        { voice_id: "voice-c", name: "Charlie" },
      ],
      [{ voice_id: "voice-c", name: "Charlie" }],
    ];
    const catalogue = new TextToSpeechVoiceCatalogue({
      listVoices: vi.fn<ListVoices>(async () => ({
        provider_id: "elevenlabs" as const,
        voices: pages.shift() ?? [],
      })),
      refreshConnection: vi.fn<RefreshConnection>(),
    });

    await catalogue.load();
    catalogue.select("voice-b");
    await catalogue.load();
    expect(catalogue.getSnapshot().selectedVoiceId).toBe("voice-b");

    await catalogue.load();
    expect(catalogue.getSnapshot().selectedVoiceId).toBeNull();
  });

  it("ignores a stale completion from an older request", async () => {
    const first = deferred<{
      provider_id: "elevenlabs";
      voices: { voice_id: string; name: string }[];
    }>();
    const second = deferred<{
      provider_id: "elevenlabs";
      voices: { voice_id: string; name: string }[];
    }>();
    const listVoices = vi.fn<ListVoices>();
    listVoices
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const catalogue = new TextToSpeechVoiceCatalogue({
      listVoices,
      refreshConnection: vi.fn<RefreshConnection>(),
    });

    const olderLoad = catalogue.load();
    const newerLoad = catalogue.load();
    second.resolve({
      provider_id: "elevenlabs",
      voices: [{ voice_id: "voice-new", name: "New" }],
    });
    await newerLoad;
    first.resolve({
      provider_id: "elevenlabs",
      voices: [{ voice_id: "voice-old", name: "Old" }],
    });
    await olderLoad;

    expect(catalogue.getSnapshot()).toMatchObject({
      kind: "ready",
      voices: [{ voice_id: "voice-new", name: "New" }],
    });
  });

  it.each([
    ["missing", { kind: "missing" }, "missing"],
    ["provider", { kind: "connected" }, "error"],
  ] as const)(
    "classifies a %s failure as %s",
    async (_failure, connection, expectedKind) => {
      const refreshConnection = vi.fn<RefreshConnection>(
        async () => connection
      );
      const catalogue = new TextToSpeechVoiceCatalogue({
        listVoices: vi.fn<ListVoices>(async () => {
          throw new Error("voice listing failed");
        }),
        refreshConnection,
      });

      await catalogue.load();

      expect(catalogue.getSnapshot()).toMatchObject({ kind: expectedKind });
      expect(refreshConnection).toHaveBeenCalledOnce();
    }
  );
});
