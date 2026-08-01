import { describe, expect, it } from "vitest";
import { pricing } from "./pricing";

const categories = Object.values(pricing);
const featureNames = categories.flatMap((category) =>
  category.features.map((feature) => feature.title)
);

describe("public pricing comparison", () => {
  it("expands the former 25-row product inventory", () => {
    expect(featureNames.length).toBeGreaterThan(25);
  });

  it("keeps the major shipped product surfaces visible", () => {
    expect(featureNames).toEqual(
      expect.arrayContaining([
        "AI agent that creates and edits project files",
        "Prompt-to-editable presentation decks",
        "AI-assisted, round-trip SVG editing",
        "Visual builder with themes and custom CSS",
        "Managed Database/CMS visual workspace",
        "Figma import from .fig, REST data, and clipboard",
        "Grida-hosted agent models",
      ])
    );
  });

  it("keeps historically shipped marketable capabilities explicit", () => {
    expect(featureNames).toEqual(
      expect.arrayContaining([
        "Custom domains for hosted sites and forms",
        "Custom branding and removable Powered by Grida badge",
        "Form response simulator",
      ])
    );
  });

  it("does not promote low-level editor mechanics as product features", () => {
    const implementationDetails = [
      "Infinite canvas with fast pan and zoom",
      "Shape, line, pencil, and pen tools",
      "Editable vector paths and compound shapes",
      "Frames, groups, and layer hierarchy",
      "Canvas-native rich text editing",
      "Images, video, Markdown, and HTML embeds",
      "Fills, strokes, effects, and layout controls",
      "Undo and redo with history preview",
    ];

    for (const implementationDetail of implementationDetails) {
      expect(featureNames).not.toContain(implementationDetail);
    }
  });

  it("does not reintroduce retired public offers", () => {
    expect(JSON.stringify(pricing)).not.toMatch(/team|annual|yearly/i);
  });
});
