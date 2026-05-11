/**
 * Unit tests for `AiCreditsController` — pure class, no React.
 *
 * Verifies the contract documented in `../README.md`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AiActionResult } from "@/lib/ai/server";
import type { AiErrorAction, AiErrorResponse } from "@/lib/ai/error";
import { AiCreditsController } from "../controller";

// Resolver stub: deterministic mapping per code, no DOM access.
const fakeRouter = vi.fn<(env: AiErrorResponse) => AiErrorAction>(
  (env: AiErrorResponse) => {
    switch (env.code) {
      case "unauthorized":
        return { kind: "redirect", href: "/sign-in", reason: env.code };
      case "no_organization":
        return {
          kind: "redirect",
          href: "/organizations/new",
          reason: env.code,
        };
      default:
        return { kind: "toast", message: env.message, tone: "error" };
    }
  }
);

beforeEach(() => {
  fakeRouter.mockClear();
});

describe("AiCreditsController.consume", () => {
  it("folds balanceCents on success and returns unwrapped data", () => {
    const ctrl = new AiCreditsController(
      { cents: 1000, allowed: true },
      {
        fetcher: vi.fn<() => Promise<AiActionResult<{}>>>(),
        router: fakeRouter,
        navigate: vi.fn<(href: string) => void>(),
      }
    );
    const env: AiActionResult<{ reply: string }> = {
      success: true,
      data: { reply: "hi", balanceCents: 990 },
    };
    const out = ctrl.consume(env);
    expect(out).toEqual({ reply: "hi", balanceCents: 990 });
    expect(ctrl.getSnapshot()).toEqual({ cents: 990, allowed: true });
  });

  it("notifies subscribers on success", () => {
    const ctrl = new AiCreditsController(
      { cents: 1000, allowed: true },
      {
        fetcher: vi.fn<() => Promise<AiActionResult<{}>>>(),
        router: fakeRouter,
        navigate: vi.fn<(href: string) => void>(),
      }
    );
    const listener = vi.fn<() => void>();
    ctrl.subscribe(listener);
    ctrl.consume({
      success: true,
      data: { reply: "x", balanceCents: 900 },
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("returns undefined and navigates on redirect failure", () => {
    const navigate = vi.fn<(href: string) => void>();
    const ctrl = new AiCreditsController(
      { cents: 1000, allowed: true },
      {
        fetcher: vi.fn<() => Promise<AiActionResult<{}>>>(),
        router: fakeRouter,
        navigate,
      }
    );
    const env: AiActionResult<{}> = {
      success: false,
      code: "unauthorized",
      message: "login required",
      status: 401,
    };
    const out = ctrl.consume(env, { next: "/ai" });
    expect(out).toBeUndefined();
    expect(fakeRouter).toHaveBeenCalledWith(env, { next: "/ai" });
    expect(navigate).toHaveBeenCalledWith("/sign-in");
    expect(ctrl.getSnapshot()).toEqual({ cents: 1000, allowed: true });
  });

  it("returns undefined and does NOT navigate on toast failure", () => {
    const navigate = vi.fn<(href: string) => void>();
    const ctrl = new AiCreditsController(
      { cents: 1000, allowed: true },
      {
        fetcher: vi.fn<() => Promise<AiActionResult<{}>>>(),
        router: fakeRouter,
        navigate,
      }
    );
    const env: AiActionResult<{}> = {
      success: false,
      code: "blocked",
      message: "below floor",
      status: 402,
    };
    const out = ctrl.consume(env);
    expect(out).toBeUndefined();
    expect(navigate).not.toHaveBeenCalled();
    expect(ctrl.getSnapshot()).toEqual({ cents: 1000, allowed: true });
  });
});

describe("AiCreditsController.refresh", () => {
  it("calls fetcher and updates state on success", async () => {
    const fetcher = vi.fn<() => Promise<AiActionResult<{}>>>(async () => ({
      success: true as const,
      data: { balanceCents: 5000 },
    }));
    const ctrl = new AiCreditsController(
      { cents: 1000, allowed: false },
      {
        fetcher,
        router: fakeRouter,
        navigate: vi.fn<(href: string) => void>(),
      }
    );
    await ctrl.refresh();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(ctrl.getSnapshot()).toEqual({ cents: 5000, allowed: true });
  });

  it("ignores result after dispose()", async () => {
    let resolveFetch: (v: AiActionResult<{}>) => void = () => {};
    const fetcher = vi.fn<() => Promise<AiActionResult<{}>>>(
      () =>
        new Promise<AiActionResult<{}>>((resolve) => {
          resolveFetch = resolve;
        })
    );
    const ctrl = new AiCreditsController(
      { cents: 1000, allowed: true },
      {
        fetcher,
        router: fakeRouter,
        navigate: vi.fn<(href: string) => void>(),
      }
    );
    const p = ctrl.refresh();
    ctrl.dispose();
    resolveFetch({ success: true, data: { balanceCents: 0 } });
    await p;
    expect(ctrl.getSnapshot()).toEqual({ cents: 1000, allowed: true });
  });
});

describe("AiCreditsController subscribe / getSnapshot", () => {
  it("subscribe returns an unsubscribe fn that removes the listener", () => {
    const ctrl = new AiCreditsController(
      { cents: 1000, allowed: true },
      {
        fetcher: vi.fn<() => Promise<AiActionResult<{}>>>(),
        router: fakeRouter,
        navigate: vi.fn<(href: string) => void>(),
      }
    );
    const listener = vi.fn<() => void>();
    const unsub = ctrl.subscribe(listener);
    ctrl.consume({ success: true, data: { balanceCents: 999 } });
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
    ctrl.consume({ success: true, data: { balanceCents: 998 } });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("getSnapshot returns the current state by reference identity for unchanged calls", () => {
    const ctrl = new AiCreditsController(
      { cents: 1000, allowed: true },
      {
        fetcher: vi.fn<() => Promise<AiActionResult<{}>>>(),
        router: fakeRouter,
        navigate: vi.fn<(href: string) => void>(),
      }
    );
    const a = ctrl.getSnapshot();
    const b = ctrl.getSnapshot();
    expect(a).toBe(b);
  });
});

describe("AiCreditsController.dispose", () => {
  it("clears listeners and is idempotent", () => {
    const ctrl = new AiCreditsController(
      { cents: 1000, allowed: true },
      {
        fetcher: vi.fn<() => Promise<AiActionResult<{}>>>(),
        router: fakeRouter,
        navigate: vi.fn<(href: string) => void>(),
      }
    );
    const listener = vi.fn<() => void>();
    ctrl.subscribe(listener);
    ctrl.dispose();
    ctrl.dispose();
    ctrl.consume({ success: true, data: { balanceCents: 500 } });
    expect(listener).not.toHaveBeenCalled();
  });

  it("freezes state — consume() after dispose() does not mutate snapshot", () => {
    const ctrl = new AiCreditsController(
      { cents: 1000, allowed: true },
      {
        fetcher: vi.fn<() => Promise<AiActionResult<{}>>>(),
        router: fakeRouter,
        navigate: vi.fn<(href: string) => void>(),
      }
    );
    const before = ctrl.getSnapshot();
    ctrl.dispose();
    const result = ctrl.consume({
      success: true,
      data: { balanceCents: 1 },
    });
    expect(result).toBeUndefined();
    expect(ctrl.getSnapshot()).toBe(before);
  });

  it("consume() after dispose() does not invoke router on failure envelopes", () => {
    const navigate = vi.fn<(href: string) => void>();
    const ctrl = new AiCreditsController(
      { cents: 1000, allowed: true },
      {
        fetcher: vi.fn<() => Promise<AiActionResult<{}>>>(),
        router: fakeRouter,
        navigate,
      }
    );
    ctrl.dispose();
    ctrl.consume({
      success: false,
      code: "unauthorized",
      message: "x",
      status: 401,
    });
    expect(fakeRouter).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
