import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { ResolvedForgeConfig } from "@electron-forge/shared-types";
import config from "./forge.config";
import {
  buildNativeAgentArtifacts,
  stageNativeAgent,
  verifyNativeAgent,
  verifyNativeAgentRuntime,
} from "./scripts/native-agent-package.mjs";

const { fixtureBinary } = (await import(
  new URL("../scripts/cli-release/native-fixture.mjs", import.meta.url).href
)) as { fixtureBinary(platform: { os: string; cpu: string }): Buffer };

const ignore = config.packagerConfig?.ignore;
if (typeof ignore !== "function") {
  throw new Error("Desktop packaging must expose its file filter");
}

const manifest = JSON.parse(
  fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "package.json"),
    "utf8"
  )
) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

describe("Desktop package file filter", () => {
  it("excludes every linked workspace package before creating the archive", () => {
    const linked = Object.entries({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    }).filter(([, specifier]) => specifier.startsWith("link:../packages/"));

    expect(linked.map(([name]) => name)).toContain("@grida/ai");
    for (const [name] of linked) {
      expect(ignore(`/node_modules/${name}`)).toBe(true);
      expect(ignore(`/node_modules/${name}/dist/index.js`)).toBe(true);
    }
  });

  it("excludes only the exact bundled workspace scope", () => {
    expect(ignore("/node_modules/@grida")).toBe(true);
    for (const file of [
      "/node_modules/@app/vendor/index.js",
      "/node_modules/@gridaco/vendor/index.js",
      "/node_modules/@hono/node-server/index.js",
      "/node_modules/hono/index.js",
      "/.vite/build/main.js",
      "/package.json",
    ]) {
      expect(ignore(file)).toBe(false);
    }
  });
});

describe("Desktop native agent package", () => {
  it("requires explicit artifacts before building for a different platform", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "grida-native-target-"));
    try {
      const foreign = process.platform === "linux" ? "darwin" : "linux";
      expect(() => buildNativeAgentArtifacts(root, foreign, "x64")).toThrow(
        "Cross-target packages require GRIDA_DESKTOP_NATIVE_ARTIFACTS"
      );
      expect(fs.readdirSync(root)).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function stage(osName: string, cpu: string, helper = true) {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "grida-native-package-")
    );
    const resources = path.join(root, "resources");
    const artifacts = path.join(root, "artifacts");
    const target = path.join(artifacts, `${osName}-${cpu}`);
    fs.mkdirSync(resources);
    fs.mkdirSync(target, { recursive: true });
    const bytes = fixtureBinary({ os: osName, cpu });
    fs.writeFileSync(
      path.join(target, osName === "win32" ? "grida-agent.exe" : "grida-agent"),
      bytes
    );
    if (helper && osName !== "win32") {
      fs.writeFileSync(path.join(target, "agent-kit-sandbox-helper"), bytes);
    }
    return {
      resources,
      artifacts,
      target,
      close: () => fs.rmSync(root, { recursive: true, force: true }),
    };
  }

  it("allows installers only after staging and verifying this package", async () => {
    const platform = "linux";
    const arch = process.arch === "x64" ? "arm64" : "x64";
    const fixture = stage(platform, arch);
    const { prePackage, packageAfterCopy, postPackage, preMake } =
      config.hooks ?? {};
    if (
      typeof prePackage !== "function" ||
      typeof packageAfterCopy !== "function" ||
      typeof postPackage !== "function" ||
      typeof preMake !== "function"
    ) {
      throw new Error("Desktop packaging hooks are required");
    }
    const forge = config as ResolvedForgeConfig;
    const root = path.dirname(fixture.resources);
    const outputPath = path.join(root, `Grida-${platform}-${arch}`);
    const resources = path.join(outputPath, "resources");
    const app = path.join(root, "app");
    const build = path.join(app, ".vite", "build");
    const { createPackage } = createRequire(import.meta.url)(
      "@electron/asar"
    ) as {
      createPackage(source: string, target: string): Promise<void>;
    };
    try {
      vi.stubEnv("GRIDA_DESKTOP_NATIVE_ARTIFACTS", undefined);
      await expect(prePackage(forge, platform, arch)).rejects.toThrow(
        "Desktop packaging requires an absolute native artifact root"
      );
      await expect(preMake(forge)).rejects.toThrow(
        "Desktop installers require a fresh verified package"
      );
      vi.stubEnv("GRIDA_DESKTOP_NATIVE_ARTIFACTS", fixture.artifacts);
      await prePackage(forge, platform, arch);
      fs.mkdirSync(resources, { recursive: true });
      fs.mkdirSync(build, { recursive: true });
      fs.writeFileSync(path.join(build, "main.js"), "void 0;");
      await createPackage(app, path.join(resources, "app.asar"));
      await packageAfterCopy(
        forge,
        path.join(resources, "app"),
        "",
        platform,
        arch
      );
      await expect(preMake(forge)).rejects.toThrow(
        "Desktop installers require a fresh verified package"
      );
      const packaged = { platform, arch, outputPaths: [outputPath] };
      await expect(postPackage(forge, packaged)).rejects.toThrow(
        /verify-packaged-bundle/
      );
      await expect(preMake(forge)).rejects.toThrow(
        "Desktop installers require a fresh verified package"
      );
      const applyPath = path.join(
        resources,
        "app.asar.unpacked/node_modules/@anthropic-ai/sandbox-runtime/vendor/seccomp",
        arch,
        "apply-seccomp"
      );
      fs.mkdirSync(path.dirname(applyPath), { recursive: true });
      fs.writeFileSync(applyPath, fixtureBinary({ os: platform, cpu: arch }), {
        mode: 0o755,
      });
      await postPackage(forge, packaged);
      await expect(preMake(forge)).resolves.toBeUndefined();
      await expect(preMake(forge)).rejects.toThrow(
        "Desktop installers require a fresh verified package"
      );
    } finally {
      vi.unstubAllEnvs();
      fixture.close();
    }
  });

  it("statically verifies foreign packages without executing their binary", async () => {
    const platform = process.platform === "linux" ? "darwin" : "linux";
    const arch = "x64";
    const fixture = stage(platform, arch);
    try {
      stageNativeAgent(fixture.resources, fixture.artifacts, platform, arch);
      await expect(
        verifyNativeAgentRuntime(fixture.resources, platform, arch)
      ).resolves.toBe(false);
      fs.unlinkSync(
        path.join(fixture.resources, "native-agent", "agent-kit-sandbox-helper")
      );
      await expect(
        verifyNativeAgentRuntime(fixture.resources, platform, arch)
      ).rejects.toThrow(
        "Native agent resource contents do not match the target"
      );
    } finally {
      fixture.close();
    }
  });

  it.each([
    ["darwin", "arm64"],
    ["linux", "x64"],
    ["win32", "x64"],
  ])(
    "stages the required %s %s executables outside the app archive",
    (platform, arch) => {
      const fixture = stage(platform, arch);
      try {
        stageNativeAgent(fixture.resources, fixture.artifacts, platform, arch);
        expect(() =>
          verifyNativeAgent(fixture.resources, platform, arch)
        ).not.toThrow();
        expect(() =>
          stageNativeAgent(fixture.resources, fixture.artifacts, platform, arch)
        ).toThrow("already exists");
        fs.writeFileSync(
          path.join(fixture.resources, "native-agent", "unexpected"),
          ""
        );
        expect(() =>
          verifyNativeAgent(fixture.resources, platform, arch)
        ).toThrow("resource contents do not match");
      } finally {
        fixture.close();
      }
    }
  );

  it("leaves no published directory when the helper is missing or has the wrong architecture", () => {
    const fixture = stage("darwin", "arm64", false);
    try {
      const install = () =>
        stageNativeAgent(
          fixture.resources,
          fixture.artifacts,
          "darwin",
          "arm64"
        );
      expect(install).toThrow("ENOENT");
      expect(fs.readdirSync(fixture.resources)).toEqual([]);
      fs.writeFileSync(
        path.join(fixture.target, "agent-kit-sandbox-helper"),
        fixtureBinary({ os: "darwin", cpu: "x64" })
      );
      expect(install).toThrow("architecture does not match");
      expect(fs.readdirSync(fixture.resources)).toEqual([]);
    } finally {
      fixture.close();
    }
  });

  it.skipIf(process.platform === "win32")(
    "refuses aliased artifacts and non-executable packaged files",
    () => {
      const fixture = stage("linux", "arm64");
      try {
        const helper = path.join(fixture.target, "agent-kit-sandbox-helper");
        fs.renameSync(helper, `${helper}.real`);
        fs.symlinkSync(`${helper}.real`, helper);
        const install = () =>
          stageNativeAgent(
            fixture.resources,
            fixture.artifacts,
            "linux",
            "arm64"
          );
        expect(install).toThrow("regular file");
        fs.unlinkSync(helper);
        fs.renameSync(`${helper}.real`, helper);
        install();
        fs.chmodSync(
          path.join(fixture.resources, "native-agent", "grida-agent"),
          0o644
        );
        expect(() =>
          verifyNativeAgent(fixture.resources, "linux", "arm64")
        ).toThrow("permissions");
      } finally {
        fixture.close();
      }
    }
  );
});
