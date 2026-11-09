import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import config from "./forge.config";
import {
  buildNativeAgentArtifacts,
  stageNativeAgent,
  verifyNativeAgent,
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
