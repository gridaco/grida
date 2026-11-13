import { describe, expect, it, vi } from "vitest";
import { AgentSurface } from ".";

describe("AgentSurface.observeToolCall", () => {
  it("fire-and-forgets surface_open without producing model output", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const open = vi.fn<AgentSurface.Host["open"]>(() => pending);
    const host: AgentSurface.Host = {
      open,
      listOpen: () => ({ active: null, open: [] }),
    };

    expect(
      AgentSurface.observeToolCall(host, {
        tool_name: "surface_open",
        input: { path: "/campaign.canvas" },
      })
    ).toBe(true);
    expect(open).toHaveBeenCalledWith("/campaign.canvas");
    release();
    await pending;
  });

  it("recognizes list calls without reading mutable host state", () => {
    const listOpen = vi.fn<AgentSurface.Host["listOpen"]>(() => ({
      active: "/campaign.canvas",
      open: ["/campaign.canvas"],
    }));
    const host: AgentSurface.Host = {
      open: () => undefined,
      listOpen,
    };

    expect(
      AgentSurface.observeToolCall(host, {
        tool_name: "surface_list_open",
        input: {},
      })
    ).toBe(true);
    expect(listOpen).not.toHaveBeenCalled();
  });

  it("contains synchronous throws and asynchronous rejections", async () => {
    const syncHost: AgentSurface.Host = {
      open: () => {
        throw new Error("detached");
      },
      listOpen: () => ({ active: null, open: [] }),
    };
    const asyncHost: AgentSurface.Host = {
      open: async () => {
        throw new Error("detached");
      },
      listOpen: () => ({ active: null, open: [] }),
    };

    expect(
      AgentSurface.observeToolCall(syncHost, {
        tool_name: "surface_open",
        input: { path: "/campaign.canvas" },
      })
    ).toBe(true);
    expect(
      AgentSurface.observeToolCall(asyncHost, {
        tool_name: "surface_open",
        input: { path: "/campaign.canvas" },
      })
    ).toBe(true);
    await Promise.resolve();
  });

  it("does not claim unrelated, dynamic, or malformed calls", () => {
    const host: AgentSurface.Host = {
      open: () => undefined,
      listOpen: () => ({ active: null, open: [] }),
    };

    expect(
      AgentSurface.observeToolCall(host, {
        tool_name: "read_file",
        input: { path: "/x" },
      })
    ).toBe(false);
    expect(
      AgentSurface.observeToolCall(host, {
        tool_name: "surface_open",
        input: { path: "relative.canvas" },
      })
    ).toBe(false);
    expect(
      AgentSurface.observeToolCall(host, {
        tool_name: "surface_open",
        input: { path: "/x" },
        dynamic: true,
      })
    ).toBe(false);
  });
});
