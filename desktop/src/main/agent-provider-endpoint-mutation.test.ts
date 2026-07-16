import { describe, expect, it, vi } from "vitest";
import { AgentProviderEndpointMutation } from "./agent-provider-endpoint-mutation";

describe("AgentProviderEndpointMutation", () => {
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
