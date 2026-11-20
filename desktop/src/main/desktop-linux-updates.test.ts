import { expect, it, vi } from "vitest";
import { DesktopLinuxUpdates } from "./desktop-linux-updates";

type FetchRelease = Parameters<typeof DesktopLinuxUpdates.latestVersion>[1];

const assets = [
  "grida_0.8.0_amd64.deb",
  "Grida-0.8.0-1.x86_64.rpm",
  "grida_0.8.0_arm64.deb",
  "Grida-0.8.0-1.arm64.rpm",
].map((name) => ({ name, state: "uploaded", size: 1000 }));

const release = {
  tag_name: "v0.8.0",
  draft: false,
  prerelease: false,
  assets,
};

it.each(["x64", "arm64"])(
  "looks up the stable release and verifies its Linux packages for %s",
  async (arch) => {
    const fetchRelease = vi.fn<FetchRelease>(async () =>
      Response.json(release)
    );

    await expect(
      DesktopLinuxUpdates.latestVersion(arch, fetchRelease)
    ).resolves.toBe("0.8.0");
    expect(fetchRelease).toHaveBeenCalledExactlyOnceWith(
      "https://api.github.com/repos/gridaco/grida/releases/latest",
      expect.objectContaining({
        credentials: "omit",
        redirect: "error",
        signal: expect.any(AbortSignal),
      })
    );
  }
);

it.each([
  { draft: true },
  { prerelease: true },
  { tag_name: "v0.8.0-rc.1" },
  { tag_name: "0.8.0" },
  { assets: assets.slice(2) },
  { assets: [assets[0], { ...assets[1], state: "starter" }] },
  { assets: [assets[0], { ...assets[1], size: 0 }] },
])("refuses an ineligible release (%j)", async (override) => {
  await expect(
    DesktopLinuxUpdates.latestVersion("x64", async () =>
      Response.json({ ...release, ...override })
    )
  ).resolves.toBeNull();
});

it("skips the request on an unsupported architecture", async () => {
  const fetchRelease = vi.fn<FetchRelease>(async () => Response.json(release));

  await expect(
    DesktopLinuxUpdates.latestVersion("riscv64", fetchRelease)
  ).resolves.toBeNull();
  expect(fetchRelease).not.toHaveBeenCalled();
});

it("treats unavailable and oversized responses as failed checks", async () => {
  await expect(
    DesktopLinuxUpdates.latestVersion("x64", async () =>
      Response.json({ message: "API rate limit exceeded" }, { status: 403 })
    )
  ).resolves.toBeNull();
  await expect(
    DesktopLinuxUpdates.latestVersion("x64", async () =>
      Response.json({ ...release, body: "x".repeat(256 * 1024) })
    )
  ).resolves.toBeNull();
});
