/**
 * Unit tests for the session titler.
 *
 * Strategy:
 *   - `titler.sanitize` is pure and exhaustively tested directly.
 *   - `titler.maybeGenerate` is tested against an opened SessionsStore
 *     (real SQLite tempdir) with a stub `modelFactory` so we don't
 *     hit a real model. The fake model returns a fixed string via
 *     the AI SDK's `mockResolvedValue`-equivalent (we mock the `ai`
 *     module's `generateText` export).
 *   - Race-safe write is verified by toggling the title between read
 *     and write.
 *
 * The live BYOK smoke (`smoke.live.ts`) covers the end-to-end model
 * call.
 */

/* eslint-disable vitest/require-mock-type-parameters */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { openSessionsDb, type OpenedSessionsDb } from "./db";
import { SessionsStore } from "./store";
import { session_title } from "./title";
import { titler } from "./titler";

// Mock `ai.generateText`. Each test overrides the return value with
// vi.mocked(generateText).mockResolvedValueOnce(...).
vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

import { generateText } from "ai";
const generateTextMock = vi.mocked(generateText);

let tempDir: string;
let opened: OpenedSessionsDb;
let store: SessionsStore;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-titler-test-"));
  opened = openSessionsDb({ user_data_path: tempDir });
  store = new SessionsStore(opened);
  generateTextMock.mockReset();
});

afterEach(async () => {
  store.close();
  await fs.rm(tempDir, { recursive: true, force: true });
});

// A stub modelFactory — we don't care what it returns because
// `generateText` itself is mocked, but the titler still invokes it.
const fakeModelFactory = (_tier: unknown) => ({}) as never;

describe("titler.sanitize", () => {
  it("returns null on empty input", () => {
    expect(titler.sanitize("")).toBeNull();
    expect(titler.sanitize("   ")).toBeNull();
    expect(titler.sanitize("\n\n")).toBeNull();
  });

  it("takes the first non-empty line", () => {
    expect(titler.sanitize("\n\nFix login bug\n\nextra noise")).toBe(
      "Fix login bug"
    );
  });

  it("strips wrapping straight + curly quotes", () => {
    expect(titler.sanitize('"Refactor auth flow"')).toBe("Refactor auth flow");
    expect(titler.sanitize("'Refactor auth flow'")).toBe("Refactor auth flow");
    expect(titler.sanitize("“Refactor auth flow”")).toBe("Refactor auth flow");
    expect(titler.sanitize("`Refactor auth flow`")).toBe("Refactor auth flow");
  });

  it("strips trailing sentence punctuation but keeps mid-string", () => {
    expect(titler.sanitize("Fix login bug.")).toBe("Fix login bug");
    expect(titler.sanitize("What broke?")).toBe("What broke");
    expect(titler.sanitize("Help with item 3.5")).toBe("Help with item 3.5");
  });

  it("removes <think> reasoning blocks", () => {
    expect(
      titler.sanitize("<think>The user wants…</think>\nFix login bug")
    ).toBe("Fix login bug");
  });

  it("caps at 60 chars with an ellipsis", () => {
    const long =
      "A very very very very very very very very very very very long title goes here";
    const out = titler.sanitize(long);
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThanOrEqual(60);
    expect(out!.endsWith("…")).toBe(true);
  });

  it("preserves non-latin scripts (Korean / Japanese)", () => {
    expect(titler.sanitize("로그인 버그 수정")).toBe("로그인 버그 수정");
    expect(titler.sanitize("「ログインのバグを修正」")).toBe(
      // The Japanese corner brackets aren't in our quote list — kept as-is.
      "「ログインのバグを修正」"
    );
  });

  it("returns null if everything strips away", () => {
    expect(titler.sanitize("<think>only reasoning</think>")).toBeNull();
    expect(titler.sanitize("...")).toBeNull();
  });
});

describe("titler.maybeGenerate", () => {
  it("writes the generated title when the session is still default", async () => {
    const session = await store.create({ agent: "grida" });
    expect(session.title).toBe(session_title.DEFAULT);
    generateTextMock.mockResolvedValueOnce({
      text: "Refactor auth flow",
    } as never);

    const out = await titler.maybeGenerate({
      store,
      session_id: session.id,
      model_factory: fakeModelFactory as never,
      user_text: "Please refactor my auth flow to use sessions",
    });

    expect(out).toBe("Refactor auth flow");
    const after = await store.get(session.id);
    expect(after?.title).toBe("Refactor auth flow");
  });

  it("skips when the session already has a non-default title", async () => {
    const session = await store.create({ agent: "grida" });
    await store.rename(session.id, "User-chosen name");
    generateTextMock.mockResolvedValueOnce({
      text: "Would-be auto title",
    } as never);

    const out = await titler.maybeGenerate({
      store,
      session_id: session.id,
      model_factory: fakeModelFactory as never,
      user_text: "Something",
    });

    expect(out).toBeNull();
    expect(generateTextMock).not.toHaveBeenCalled();
    const after = await store.get(session.id);
    expect(after?.title).toBe("User-chosen name");
  });

  it("returns null for empty user text without calling the model", async () => {
    const session = await store.create({ agent: "grida" });

    const out = await titler.maybeGenerate({
      store,
      session_id: session.id,
      model_factory: fakeModelFactory as never,
      user_text: "   ",
    });

    expect(out).toBeNull();
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("returns null and skips write when the model errors", async () => {
    const session = await store.create({ agent: "grida" });
    generateTextMock.mockRejectedValueOnce(new Error("upstream 503"));

    const out = await titler.maybeGenerate({
      store,
      session_id: session.id,
      model_factory: fakeModelFactory as never,
      user_text: "Hello",
    });

    expect(out).toBeNull();
    const after = await store.get(session.id);
    expect(after?.title).toBe(session_title.DEFAULT);
  });

  it("returns null when the generated title sanitizes to empty", async () => {
    const session = await store.create({ agent: "grida" });
    generateTextMock.mockResolvedValueOnce({
      text: "<think>only reasoning</think>",
    } as never);

    const out = await titler.maybeGenerate({
      store,
      session_id: session.id,
      model_factory: fakeModelFactory as never,
      user_text: "Help",
    });

    expect(out).toBeNull();
    const after = await store.get(session.id);
    expect(after?.title).toBe(session_title.DEFAULT);
  });

  it("returns null for an unknown session id", async () => {
    const out = await titler.maybeGenerate({
      store,
      session_id: "ses_does_not_exist",
      model_factory: fakeModelFactory as never,
      user_text: "Hello",
    });

    expect(out).toBeNull();
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("yields to a user rename that races between read and write", async () => {
    const session = await store.create({ agent: "grida" });
    // The mock resolves only after we've sneaked in a manual rename,
    // simulating the user typing in the picker mid-flight.
    generateTextMock.mockImplementationOnce(async () => {
      await store.rename(session.id, "User wins");
      return { text: "Auto would lose" } as never;
    });

    const out = await titler.maybeGenerate({
      store,
      session_id: session.id,
      model_factory: fakeModelFactory as never,
      user_text: "Hello",
    });

    // Title gen succeeded, but the race guard refused to overwrite.
    expect(out).toBeNull();
    const after = await store.get(session.id);
    expect(after?.title).toBe("User wins");
  });
});
