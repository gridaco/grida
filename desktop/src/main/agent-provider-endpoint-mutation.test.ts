import { describe, expect, it, vi } from "vitest";
import { AgentProviderEndpointMutation } from "./agent-provider-endpoint-mutation";

describe("AgentProviderEndpointMutation", () => {
  it("serializes complete mutations for the same endpoint id", async () => {
    const coordinator = new AgentProviderEndpointMutation.Coordinator();
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = coordinator.run("ollama", async () => {
      order.push("first:start");
      await firstGate;
      order.push("first:end");
    });
    await Promise.resolve();
    const second = coordinator.run("ollama", async () => {
      order.push("second");
    });
    await Promise.resolve();

    expect(order).toEqual(["first:start"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(["first:start", "first:end", "second"]);
  });

  it("does not let a failed mutation poison the same endpoint queue", async () => {
    const coordinator = new AgentProviderEndpointMutation.Coordinator();
    const first = coordinator.run("ollama", async () => {
      throw new Error("set failed");
    });
    const firstError = first.catch((error: unknown) => error);
    const second = coordinator.run("ollama", async () => "delete completed");

    expect(await firstError).toEqual(
      expect.objectContaining({ message: "set failed" })
    );
    await expect(second).resolves.toBe("delete completed");
  });

  it("runs independent endpoint ids concurrently", async () => {
    const coordinator = new AgentProviderEndpointMutation.Coordinator();
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = coordinator.run("ollama", async () => {
      await firstGate;
    });
    await Promise.resolve();

    await expect(
      coordinator.run("litellm", async () => "independent")
    ).resolves.toBe("independent");

    releaseFirst();
    await first;
  });

  it("revokes main authority before crossing into sidecar storage", async () => {
    const order: string[] = [];
    const revokeAuthority = vi.fn<() => Promise<void>>(async () => {
      order.push("revoke");
    });
    const deleteConfiguration = vi.fn<() => Promise<void>>(async () => {
      order.push("delete");
      throw new Error("disk full");
    });

    await expect(
      AgentProviderEndpointMutation.remove({
        revokeAuthority,
        deleteConfiguration,
      })
    ).rejects.toThrow("disk full");

    expect(order).toEqual(["revoke", "delete"]);
  });

  it("does not delete configuration when authority revocation fails", async () => {
    const deleteConfiguration = vi.fn<() => Promise<void>>(
      async () => undefined
    );

    await expect(
      AgentProviderEndpointMutation.remove({
        revokeAuthority: async () => {
          throw new Error("revocation failed");
        },
        deleteConfiguration,
      })
    ).rejects.toThrow("revocation failed");

    expect(deleteConfiguration).not.toHaveBeenCalled();
  });
});
