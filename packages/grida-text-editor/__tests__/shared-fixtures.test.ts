/**
 * Shared text-editor fixtures harness.
 *
 * Loads `fixtures/text-editor/v1.json` (relative to the repo root) and runs
 * each case against this package's `TextEditSession` + `apply_command`. The
 * same fixture file is consumed by the Rust crate at
 * `crates/grida/src/text_edit/`, so any drift between the two implementations
 * shows up here.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { apply_command, type EditingCommand } from "../src/edit-command";
import { TextEditSession } from "../src/session";

interface InitialState {
  text: string;
  caret: number;
  anchor: number | null;
}

interface FinalState {
  text: string;
  caret: number;
  anchor: number | null;
}

interface FixtureCase {
  id: string;
  initial: InitialState;
  commands: EditingCommand[];
  final: FinalState;
}

interface Fixture {
  version: string;
  description: string;
  tests: FixtureCase[];
}

// Resolve from this file's location so the test runs regardless of pwd.
const FIXTURE_PATH = resolve(
  __dirname,
  "../../../fixtures/text-editor/v1.json"
);

const fixture: Fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));

function buildSession(initial: InitialState): TextEditSession {
  const session = new TextEditSession(initial.text);
  if (initial.anchor !== null && initial.anchor !== initial.caret) {
    // setSelection drops any composition and clamps to bounds.
    session.setSelection(initial.anchor, initial.caret);
  } else {
    session.moveCaret(initial.caret, false);
  }
  return session;
}

function actualAnchor(session: TextEditSession): number | null {
  const sel = session.selection;
  if (!sel) return null;
  // The session never exposes raw anchor; reconstruct it from the selection
  // and caret. Selection is [start, end] and caret sits at one of those
  // endpoints, so the anchor is the other.
  return session.caret === sel.start ? sel.end : sel.start;
}

describe(`shared fixtures (${fixture.version})`, () => {
  it.each(fixture.tests.map((tc) => [tc.id, tc] as const))("%s", (_id, tc) => {
    const session = buildSession(tc.initial);
    for (const cmd of tc.commands) {
      apply_command(session, cmd);
    }
    expect(session.text).toBe(tc.final.text);
    expect(session.caret).toBe(tc.final.caret);
    expect(actualAnchor(session)).toBe(tc.final.anchor);
  });
});
