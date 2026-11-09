// GRIDA-SEC-004 — configured native provider admission.
import { expect, it, vi } from "vitest";
import { NativeProviderSelection } from "./native-provider-selection";
import type { NativeProviderNetwork } from "./native-provider-egress";

const base = "http://127.0.0.1:11434/v1";
const target = `${base}/chat/completions`;
const config = {
  id: "local",
  base_url: base,
  models: [{ id: "alpha" }, { id: "beta" }],
  default_model_id: "beta",
};

function settings() {
  const dispatch = vi.fn<() => Promise<Response>>();
  const prepare = vi.fn<NativeProviderNetwork["prepare"]>(() => dispatch);
  return {
    list: vi.fn<() => Promise<(typeof config)[]>>(async () => [config]),
    hasKey: vi.fn<(id: string) => Promise<boolean>>(async () => false),
    network: vi.fn<
      (id: string, baseUrl: string) => Promise<NativeProviderNetwork>
    >(async () => ({ prepare })),
    prepare,
    dispatch,
  };
}

it("uses a registered model and binds the anonymous launch to the approved route", async () => {
  const owner = settings();
  const launch = await NativeProviderSelection.configuredEndpoint(
    "local",
    undefined,
    owner
  );
  expect(launch).toMatchObject({
    provider: "openai-compatible",
    endpoint: base,
    model: "beta",
  });
  expect(owner.network).toHaveBeenCalledExactlyOnceWith("local", base);
  expect(
    launch.providerNetwork.prepare(`${target}?other=1`, new Headers())
  ).toBeNull();
  expect(
    launch.providerNetwork.prepare(
      target,
      new Headers({ authorization: "Bearer fixture" })
    )
  ).toBeNull();
  expect(owner.prepare).not.toHaveBeenCalled();
  expect(launch.providerNetwork.prepare(target, new Headers())).toBe(
    owner.dispatch
  );
  owner.prepare.mockReturnValue(null);
  expect(launch.providerNetwork.prepare(target, new Headers())).toBeNull();
  const explicit = await NativeProviderSelection.configuredEndpoint(
    "local",
    "alpha",
    owner
  );
  expect(explicit.model).toBe("alpha");
});

it("refuses missing selections, key-backed configurations and missing approval", async () => {
  const owner = settings();
  const select = (provider: string, model?: string) =>
    NativeProviderSelection.configuredEndpoint(provider, model, owner);
  await expect(select("other")).rejects.toThrow(
    "native_provider_endpoint_unavailable"
  );
  await expect(select("local", "unknown")).rejects.toThrow(
    "native_provider_model_unavailable"
  );
  owner.hasKey.mockResolvedValueOnce(true);
  await expect(select("local")).rejects.toThrow(
    "native_provider_endpoint_credential_unavailable"
  );
  expect(owner.network).not.toHaveBeenCalled();
  owner.network.mockRejectedValueOnce(
    new Error("native_provider_endpoint_not_approved")
  );
  await expect(select("local")).rejects.toThrow(
    "native_provider_endpoint_not_approved"
  );
});
