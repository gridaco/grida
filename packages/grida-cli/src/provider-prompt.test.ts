// GRIDA-SEC-014 — synthetic terminal input only; secrets never echo.
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderPrompt } from "./provider-prompt";

function terminal() {
  const emitter = new EventEmitter();
  const input = Object.assign(emitter, {
    isTTY: true as const,
    isRaw: false,
    setRawMode: vi.fn<
      (this: { isRaw: boolean }, value: boolean) => { isRaw: boolean }
    >(function (this: { isRaw: boolean }, value: boolean) {
      this.isRaw = value;
      return this;
    }),
    resume: vi.fn<() => void>(),
    pause: vi.fn<() => void>(),
  }) as unknown as ProviderPrompt.Input;
  const writes: string[] = [];
  const output = {
    isTTY: true as const,
    write: (text: string) => {
      writes.push(text);
      return true;
    },
  } as ProviderPrompt.Output;
  return { input, output, writes, emitter };
}

afterEach(() => vi.useRealTimers());

describe("provider hidden input", () => {
  it("supports backspace without echoing keys and restores the terminal", async () => {
    const t = terminal();
    const pending = ProviderPrompt.read(
      t.input,
      t.output,
      new AbortController().signal
    );
    expect(t.input.isRaw).toBe(true);
    t.emitter.emit("data", Buffer.from("synthetic-x\u007fkey\r"));
    expect(Buffer.from(await pending).toString()).toBe("synthetic-key");
    expect(t.writes.join("")).not.toContain("synthetic");
    expect(t.input.isRaw).toBe(false);
    expect(t.input.pause).toHaveBeenCalledOnce();
    expect(t.emitter.eventNames()).toEqual([]);
  });

  it.each(["\u0003", "\u0004", "\u001b[A", "a".repeat(4097)])(
    "restores the terminal on cancellation or invalid input",
    async (value) => {
      const t = terminal();
      const pending = ProviderPrompt.read(
        t.input,
        t.output,
        new AbortController().signal
      );
      t.emitter.emit("data", Buffer.from(value));
      await expect(pending).rejects.toHaveProperty("code");
      expect(t.input.isRaw).toBe(false);
      expect(t.emitter.eventNames()).toEqual([]);
      expect(t.writes.join("")).not.toContain(value);
    }
  );

  it("cleans up on external cancellation and on a stalled prompt", async () => {
    vi.useFakeTimers();
    for (const mode of ["signal", "timeout"]) {
      const t = terminal();
      const abort = new AbortController();
      const pending = ProviderPrompt.read(
        t.input,
        t.output,
        abort.signal
      ).catch((e) => e);
      if (mode === "signal") abort.abort();
      else await vi.advanceTimersByTimeAsync(30_000);
      expect(await pending).toHaveProperty(
        "code",
        mode === "signal" ? "cancelled" : "credentials_unavailable"
      );
      expect(t.input.isRaw).toBe(false);
      expect(t.emitter.eventNames()).toEqual([]);
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it("refuses non-interactive input before reading or changing terminal mode", () => {
    const t = terminal();
    Object.assign(t.input, { isTTY: false });
    expect(() =>
      ProviderPrompt.read(t.input, t.output, new AbortController().signal)
    ).toThrow(expect.objectContaining({ code: "interaction_required" }));
    expect(t.input.setRawMode).not.toHaveBeenCalled();
    expect(t.writes).toEqual([]);
  });

  it("still restores raw mode if pausing fails, without exposing host errors", async () => {
    const t = terminal();
    vi.mocked(t.input.pause).mockImplementation(() => {
      throw new Error("synthetic-secret");
    });
    const pending = ProviderPrompt.read(
      t.input,
      t.output,
      new AbortController().signal
    );
    t.emitter.emit("data", Buffer.from("synthetic-key\r"));
    await expect(pending).rejects.toMatchObject({
      code: "credentials_unavailable",
    });
    expect(t.input.isRaw).toBe(false);
    expect(t.emitter.eventNames()).toEqual([]);
  });
});
