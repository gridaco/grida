import { describe, expect, it } from "vitest";
import { WebPreviewProviders } from "./web-preview-providers";

const fixture = {
  match: { meta: "application-name", attributes: { "data-example": "1" } },
  productLabel: "Example",
};

describe("WebPreviewProviders", () => {
  it("loads the FX contribution by its sibling manifest", () => {
    expect(WebPreviewProviders.bundled()).toContainEqual({
      id: "desktop-fx",
      match: {
        meta: "application-name",
        attributes: { "data-grida-fx-viewer": "1" },
      },
      productLabel: "FX Viewer",
    });
  });

  it("discovers another extension's declaration and optional resolver together", () => {
    const resolve = async () => ({ title: "Resolved title" });
    const providers = WebPreviewProviders.fromModules(
      {
        "extensions/example/web-preview.json": fixture,
        "extensions/another/web-preview.json": {
          ...fixture,
          match: { meta: "generator", attributes: { content: "Another" } },
          productLabel: "Another",
        },
      },
      {
        "extensions/example/extension.json": { id: "example" },
        "extensions/another/extension.json": { id: "another" },
      },
      {
        "extensions/another/web-preview.ts": resolve,
        "extensions/orphan/web-preview.ts": resolve,
      }
    );
    expect(providers).toEqual([
      { id: "example", ...fixture },
      {
        id: "another",
        match: { meta: "generator", attributes: { content: "Another" } },
        productLabel: "Another",
        resolve,
      },
    ]);
  });

  it("rejects unowned, malformed, and duplicate contributions", () => {
    const providers = WebPreviewProviders.fromModules(
      {
        "extensions/orphan/web-preview.json": fixture,
        "extensions/malformed/web-preview.json": {
          ...fixture,
          match: { meta: "application-name", attributes: {} },
        },
        "extensions/example/web-preview.json": fixture,
        "extensions/duplicate/web-preview.json": fixture,
      },
      {
        "extensions/malformed/extension.json": { id: "malformed" },
        "extensions/example/extension.json": { id: "example" },
        "extensions/duplicate/extension.json": { id: "example" },
      }
    );
    expect(providers).toEqual([]);
  });
});
