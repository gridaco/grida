import { describe, expect, it, vi } from "vitest";
import { StreamAttachOwner } from "./stream-attach-owner";

function makeOwner() {
  const lines: string[] = [];
  const owner = new StreamAttachOwner({ log: (l) => lines.push(l) });
  return { owner, lines };
}

/** An executor whose settlement the test controls. */
function gatedExec() {
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const calls = { count: 0 };
  const exec = () => {
    calls.count += 1;
    return gate;
  };
  return { exec, release, calls };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

/** The observable "nothing live" probe: a drain grant means the slot is free. */
function slotFree(owner: StreamAttachOwner): boolean {
  return owner.decide("resume-drain").granted;
}

describe("StreamAttachOwner / the H1 incident class", () => {
  it("a Chat rebuild mid-attach (same session+epoch) can NOT mint a second stream — resume degrades to claim-only", async () => {
    // The old design keyed the resume claim on Chat INSTANCE identity and
    // read `isStreaming` from the NEW instance: a rehydrate mid-send minted
    // an unclaimed idle-looking instance whose mount-resume opened a second
    // stream over the live send (→ dropped assistant → "No tool invocation
    // found" → torn stream → "network error"). Ownership is keyed on
    // (session, epoch), so the rebuild changes nothing.
    const { owner } = makeOwner();
    owner.bind({ session_id: "ses_1", epoch: 1 });

    // The approval-resume send is live.
    const send = gatedExec();
    expect(owner.request("approval-resume", send.exec)).toEqual({
      granted: true,
      mode: "exec",
    });
    expect(slotFree(owner)).toBe(false);

    // Rehydrate → Chat rebuild → the wire re-fires bind + resume-mount with
    // the SAME identity (epoch did not bump — hydration is not a rebind).
    owner.bind({ session_id: "ses_1", epoch: 1 }); // no-op
    const resume = gatedExec();
    const decision = owner.request("resume-mount", resume.exec);
    expect(decision).toEqual({ granted: true, mode: "claim-only" });
    expect(resume.calls.count).toBe(0); // no second stream. The fix.

    // And after the send settles, the claim still holds — no late reconnect
    // over a finished turn either.
    send.release();
    await flush();
    expect(slotFree(owner)).toBe(true);
    expect(owner.request("resume-mount", resume.exec)).toEqual({
      granted: false,
      reason: "already-claimed",
    });
    expect(resume.calls.count).toBe(0);
  });
});

describe("StreamAttachOwner / resume-mount claim (I2)", () => {
  it("executes once per (session, epoch); re-request is already-claimed; a REAL rebind resets", async () => {
    const { owner } = makeOwner();
    owner.bind({ session_id: "ses_1", epoch: 1 });

    const first = gatedExec();
    expect(owner.request("resume-mount", first.exec).granted).toBe(true);
    expect(first.calls.count).toBe(1);
    first.release();
    await flush();

    // StrictMode double-effect / any re-render: same binding → claimed.
    expect(owner.request("resume-mount", first.exec)).toEqual({
      granted: false,
      reason: "already-claimed",
    });

    // Re-open of the same session (new epoch) → resumes again by design.
    owner.bind({ session_id: "ses_1", epoch: 2 });
    const second = gatedExec();
    expect(owner.request("resume-mount", second.exec)).toEqual({
      granted: true,
      mode: "exec",
    });
    expect(second.calls.count).toBe(1);
  });

  it("requires a binding", () => {
    const { owner } = makeOwner();
    expect(owner.request("resume-mount", () => {})).toEqual({
      granted: false,
      reason: "no-session",
    });
    owner.bind(null);
    expect(owner.request("resume-mount", () => {})).toEqual({
      granted: false,
      reason: "no-session",
    });
  });
});

describe("StreamAttachOwner / serialization (I1)", () => {
  it("denies approval-resume/resume-drain while an exec is unsettled", async () => {
    const { owner } = makeOwner();
    owner.bind({ session_id: "ses_1", epoch: 1 });
    const live = gatedExec();
    owner.request("approval-resume", live.exec);

    expect(owner.request("approval-resume", () => {})).toEqual({
      granted: false,
      reason: "attach-in-flight",
    });
    expect(owner.request("resume-drain", () => {})).toEqual({
      granted: false,
      reason: "attach-in-flight",
    });

    live.release();
    await flush();
    expect(owner.request("approval-resume", () => {}).granted).toBe(true);
  });

  it("adopts a transport-reported stream (a plain send / the SDK auto-resubmit) and serializes behind it", () => {
    const { owner } = makeOwner();
    owner.bind({ session_id: "ses_1", epoch: 1 });

    owner.noteTransportOpen(); // adopted — never request()ed
    expect(owner.request("resume-drain", () => {})).toEqual({
      granted: false,
      reason: "attach-in-flight",
    });

    owner.noteTransportSettle();
    expect(owner.request("resume-drain", () => {}).granted).toBe(true);
  });

  it("a fresh chat's approval can arrive before any binding (the server mints the session)", () => {
    const { owner } = makeOwner();
    expect(owner.request("approval-resume", () => {})).toEqual({
      granted: true,
      mode: "exec",
    });
  });

  it("decisions are synchronous — two same-tick requests cannot both win", () => {
    const { owner } = makeOwner();
    owner.bind({ session_id: "ses_1", epoch: 1 });
    const a = owner.request("approval-resume", () => new Promise(() => {}));
    const b = owner.request("approval-resume", () => new Promise(() => {}));
    expect(a.granted).toBe(true);
    expect(b).toEqual({ granted: false, reason: "attach-in-flight" });
  });
});

describe("StreamAttachOwner / settlement + robustness", () => {
  it("a throwing executor still settles the slot (and never propagates)", async () => {
    const { owner, lines } = makeOwner();
    owner.bind({ session_id: "ses_1", epoch: 1 });
    owner.request("approval-resume", () => Promise.reject(new Error("boom")));
    await flush();
    expect(slotFree(owner)).toBe(true);
    expect(
      lines.some((l) => l.includes("exec-error") && l.includes("boom"))
    ).toBe(true);
  });

  it("a stale transport settle never underflows into fake capacity", () => {
    const { owner } = makeOwner();
    owner.bind({ session_id: "ses_1", epoch: 1 });
    owner.noteTransportSettle(); // settle with no open — floored
    owner.noteTransportSettle();
    expect(slotFree(owner)).toBe(true);
    owner.noteTransportOpen();
    expect(slotFree(owner)).toBe(false);
    owner.noteTransportSettle();
    expect(slotFree(owner)).toBe(true);
  });

  it("rebinding over a live exec logs `superseded` and never cancels (I3)", async () => {
    const { owner, lines } = makeOwner();
    owner.bind({ session_id: "ses_1", epoch: 1 });
    const live = gatedExec();
    owner.request("approval-resume", live.exec);

    owner.bind({ session_id: "ses_2", epoch: 2 });
    expect(lines.some((l) => l.includes("superseded"))).toBe(true);
    // the zombie settles on its own; nothing aborted it
    expect(live.calls.count).toBe(1);
    live.release();
    await flush();
    expect(slotFree(owner)).toBe(true);
  });

  it("logs every grant, deny, claim, and adopt with the stable prefix (I4)", () => {
    const { owner, lines } = makeOwner();
    owner.bind({ session_id: "ses_1", epoch: 1 });
    owner.request("approval-resume", () => new Promise(() => {})); // grant
    owner.request("approval-resume", () => {}); // deny
    owner.request("resume-mount", () => {}); // claim-only
    owner.noteTransportOpen(); // adopt

    const events = lines
      .filter((l) => l.startsWith("[agent-chat:attach]"))
      .map((l) => l.split(" ")[1]);
    expect(events).toContain("grant");
    expect(events).toContain("deny");
    expect(events).toContain("claim");
    expect(events).toContain("adopt");
  });

  it("a broken logger never breaks decisions", () => {
    const owner = new StreamAttachOwner({
      log: () => {
        throw new Error("logger down");
      },
    });
    owner.bind({ session_id: "ses_1", epoch: 1 });
    expect(owner.request("approval-resume", () => {}).granted).toBe(true);
  });

  it("default logger writes to console.info", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const owner = new StreamAttachOwner();
      owner.bind({ session_id: "ses_1", epoch: 1 });
      expect(
        spy.mock.calls.some((c) =>
          String(c[0]).startsWith("[agent-chat:attach]")
        )
      ).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("StreamAttachOwner / self-heal recovery", () => {
  it("runs exactly ONE recovery per binding; a rebind resets the budget", async () => {
    const { owner } = makeOwner();
    owner.bind({ session_id: "ses_1", epoch: 1 });

    const first = gatedExec();
    expect(owner.requestRecovery("disconnect", first.exec)).toBe(true);
    expect(first.calls.count).toBe(1);
    first.release();
    await flush();
    // The one attempt is spent — even for a different recoverable kind.
    expect(owner.requestRecovery("disconnect", () => {})).toBe(false);
    expect(owner.requestRecovery("stream-state", () => {})).toBe(false);

    // A real re-open restores the budget.
    owner.bind({ session_id: "ses_1", epoch: 2 });
    expect(owner.requestRecovery("stream-state", () => {})).toBe(true);
  });

  it("ignores stream errors while unbound or while an attach is live", () => {
    const { owner } = makeOwner();
    expect(owner.requestRecovery("disconnect", () => {})).toBe(false);

    owner.bind({ session_id: "ses_1", epoch: 1 });
    owner.noteTransportOpen();
    expect(owner.requestRecovery("disconnect", () => {})).toBe(false);
    owner.noteTransportSettle();
    expect(owner.requestRecovery("disconnect", () => {})).toBe(true);
  });

  it("other intents serialize behind a live recovery, and the budget stays spent after it settles", async () => {
    const { owner } = makeOwner();
    owner.bind({ session_id: "ses_1", epoch: 1 });

    const recovery = gatedExec();
    expect(owner.requestRecovery("stream-state", recovery.exec)).toBe(true);
    expect(owner.request("approval-resume", () => {})).toEqual({
      granted: false,
      reason: "attach-in-flight",
    });

    recovery.release();
    await flush();
    expect(slotFree(owner)).toBe(true);
    // No ping-pong: the budget stays spent after the attempt.
    expect(owner.requestRecovery("stream-state", () => {})).toBe(false);
  });

  it("the recovery slot survives the transport-open of its own reconnect", async () => {
    const { owner } = makeOwner();
    owner.bind({ session_id: "ses_1", epoch: 1 });
    const recovery = gatedExec();
    expect(owner.requestRecovery("disconnect", recovery.exec)).toBe(true);
    // The recovery's own reconnect stream opens — still one live attach.
    owner.noteTransportOpen();
    expect(slotFree(owner)).toBe(false);
    owner.noteTransportSettle();
    recovery.release();
    await flush();
    expect(slotFree(owner)).toBe(true);
  });
});
