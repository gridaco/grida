import { describe, expect, it } from "vitest";
import { WebPreviewProviderRegistry } from "./web-preview-provider";
import { WebPreviewProviders } from "./web-preview-providers";

const fixture = {
  match: { meta: "application-name", attributes: { "data-example": "1" } },
  productLabel: "Example",
};

describe("WebPreviewProviders", () => {
  it("recognizes one exact provider marker without any network or default providers", () => {
    const registry = new WebPreviewProviderRegistry();
    const matchingTag = [
      { name: "name", value: "application-name" },
      { name: "data-example", value: "1" },
    ];
    expect(registry.match([matchingTag])).toBeUndefined();
    const provider = { id: "example", ...fixture };
    const remove = registry.register(provider);
    expect(registry.match([matchingTag])).toBe(provider);
    expect(
      registry.match([matchingTag.slice(0, 1), matchingTag.slice(1)])
    ).toBeUndefined();
    expect(
      registry.match([[matchingTag[0]!, { name: "data-example", value: "2" }]])
    ).toBeUndefined();

    const removeAmbiguous = registry.register({ ...provider, id: "ambiguous" });
    expect(registry.match([matchingTag])).toBeUndefined();
    removeAmbiguous();
    expect(registry.match([matchingTag])).toBe(provider);
    remove();
    expect(registry.match([matchingTag])).toBeUndefined();
    registry.register(provider);
    expect(remove()).toBe(false);
    expect(registry.match([matchingTag])).toBe(provider);
  });

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
