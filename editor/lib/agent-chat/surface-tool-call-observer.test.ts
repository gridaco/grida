import { describe, expect, it, vi } from "vitest";
import type { AgentSurface } from "@grida/agent/surface";
import { SurfaceToolCallObserver } from "./surface-tool-call-observer";

function createHost() {
  const open = vi.fn<AgentSurface.Host["open"]>();
  const host: AgentSurface.Host = {
    open,
    listOpen: () => ({ active: null, open: [] }),
  };
  return { host, open };
}

describe("SurfaceToolCallObserver", () => {
  it("applies a replayed surface_open tool call only once", () => {
    const observer = new SurfaceToolCallObserver();
    const { host, open } = createHost();
    const toolCall = {
      tool_name: "surface_open",
      tool_call_id: "call_open_1",
      input: { path: "/campaign.canvas" },
    };

    expect(observer.observe(host, toolCall)).toBe(true);
    expect(observer.observe(host, toolCall)).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith("/campaign.canvas");
  });

  it("keeps distinct surface_open calls distinct", () => {
    const observer = new SurfaceToolCallObserver();
    const { host, open } = createHost();

    observer.observe(host, {
      tool_name: "surface_open",
      tool_call_id: "call_open_1",
      input: { path: "/first.svg" },
    });
    observer.observe(host, {
      tool_name: "surface_open",
      tool_call_id: "call_open_2",
      input: { path: "/second.svg" },
    });

    expect(open).toHaveBeenNthCalledWith(1, "/first.svg");
    expect(open).toHaveBeenNthCalledWith(2, "/second.svg");
  });

  it("does not reserve an invalid or incomplete call", () => {
    const observer = new SurfaceToolCallObserver();
    const { host, open } = createHost();

    expect(
      observer.observe(host, {
        tool_name: "surface_open",
        tool_call_id: "call_open_1",
        input: { path: "relative.svg" },
      })
    ).toBe(false);
    expect(
      observer.observe(host, {
        tool_name: "surface_open",
        tool_call_id: "call_open_1",
        input: { path: "/complete.svg" },
      })
    ).toBe(true);
    expect(open).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith("/complete.svg");
  });
});
