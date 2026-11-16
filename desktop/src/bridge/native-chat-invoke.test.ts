// GRIDA-SEC-004 — exact channel envelopes cannot authorize a guessed retry.
import { describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "./contract";
import { NativeChatInvoke } from "./native-chat-invoke";

const channel = IPC_CHANNELS.NATIVE_CHAT_INPUT_RECEIPT;
const envelope = (code: string, target: string = channel) =>
  `Error invoking remote method '${target}': Error: ${code}`;

describe("native chat invoke error identity", () => {
  it("preserves returned values, the exact channel and all argument slots", async () => {
    const result = { inputId: "stable", disposition: "completed" };
    const invoke = vi.fn<
      (channel: string, ...args: unknown[]) => Promise<typeof result>
    >(async () => result);
    await expect(
      NativeChatInvoke.invoke(
        invoke,
        channel,
        "attachment",
        "stable",
        undefined,
        null
      )
    ).resolves.toBe(result);
    expect(invoke).toHaveBeenCalledExactlyOnceWith(
      channel,
      "attachment",
      "stable",
      undefined,
      null
    );
  });

  it.each([
    "input_unavailable",
    "native_agent_request_timeout",
    "native_chat_selection_revision_changed",
    `a_${"b".repeat(126)}`,
  ])(
    "preserves a bounded whole canonical code without exposing its diagnostics (%s)",
    async (code) => {
      const remote = new Error(envelope(code), {
        cause: "private provider body",
      });
      remote.stack = "private remote path";
      const invoke = vi.fn<
        (channel: string, ...args: unknown[]) => Promise<never>
      >(async () => {
        throw remote;
      });
      const caught = await NativeChatInvoke.invoke(invoke, channel).catch(
        (error: unknown) => error
      );
      expect(caught).toBeInstanceOf(Error);
      expect(caught).not.toBe(remote);
      expect((caught as Error).message).toBe(code);
      expect((caught as Error).stack).toBeUndefined();
      expect((caught as Error).cause).toBeUndefined();
    }
  );

  it.each([
    "input_unavailable",
    "unrelated native prose with input_unavailable in it",
    envelope("input_unavailable", IPC_CHANNELS.NATIVE_CHAT_SUBMIT),
    `Prefix ${envelope("input_unavailable")}`,
    `${envelope("input_unavailable")} trailing prose`,
    `${envelope("input_unavailable")}\n`,
    `Error invoking remote method "${channel}": Error: input_unavailable`,
    `Error invoking remote method '${channel}': input_unavailable`,
    envelope("Error: input_unavailable"),
    envelope("INPUT_UNAVAILABLE"),
    envelope("_input_unavailable"),
    envelope("input__unavailable"),
    envelope("input_unavailable_"),
    envelope("input-unavailable"),
    envelope("input_unavailable: private details"),
    envelope(""),
    envelope("x".repeat(129)),
    envelope("input_unavailable" + " ".repeat(10_000)),
  ])(
    "preserves unknown or malformed messages unchanged (%s)",
    async (message) => {
      const remote = new Error(message);
      const invoke = vi.fn<
        (channel: string, ...args: unknown[]) => Promise<never>
      >(async () => {
        throw remote;
      });
      await expect(NativeChatInvoke.invoke(invoke, channel)).rejects.toBe(
        remote
      );
    }
  );

  it.each([
    undefined,
    null,
    "input_unavailable",
    { message: envelope("input_unavailable") },
  ])("does not interpret non-Error rejection values (%s)", async (remote) => {
    const invoke = vi.fn<
      (channel: string, ...args: unknown[]) => Promise<never>
    >(async () => {
      throw remote;
    });
    await expect(NativeChatInvoke.invoke(invoke, channel)).rejects.toBe(remote);
  });

  it.each([
    IPC_CHANNELS.WINDOW_CLOSE,
    "grida:native-chat:unknown",
    "grida:native-chat:input-receipt:extra",
  ])(
    "does not unwrap unknown or non-native-chat channels (%s)",
    async (target) => {
      const remote = new Error(envelope("input_unavailable", target));
      const invoke = vi.fn<
        (channel: string, ...args: unknown[]) => Promise<never>
      >(async () => {
        throw remote;
      });
      await expect(NativeChatInvoke.invoke(invoke, target)).rejects.toBe(
        remote
      );
    }
  );
});
