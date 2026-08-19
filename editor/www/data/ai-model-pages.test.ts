import { describe, expect, it } from "vitest";
import models from "@grida/ai-models";
import { aiModelPages } from "./ai-model-pages";

function resolve(reference: aiModelPages.MediaModelReference) {
  switch (reference.catalogue) {
    case "image":
      return models.image.models[reference.id];
    case "video":
      return models.video.models[reference.id];
    case "music":
      return models.audio.music.models[reference.id];
    case "sound-effect":
      return models.audio.sound_effects.models[reference.id];
    case "3d":
      return models.three_d.models[reference.id];
  }
}

describe("AI model SEO page inventory", () => {
  it("keeps active slugs, model references, and lineages unique", () => {
    const slugs = aiModelPages.active.map((page) => page.slug);
    const lineages = aiModelPages.active.map(
      (page) => page.successorLineage
    );
    const references = aiModelPages.active.map(
      (page) => `${page.model.catalogue}/${page.model.id}`
    );

    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(lineages).size).toBe(lineages.length);
    expect(new Set(references).size).toBe(references.length);
  });

  it("uses stable slugs and unique, concise metadata", () => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();

    for (const page of aiModelPages.active) {
      expect(page.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(page.metadata.title).toMatch(/ — Grida$/);
      expect(page.metadata.description.length).toBeLessThanOrEqual(160);
      expect(page.metadata.keywords.length).toBeGreaterThan(0);
      expect(page.publishReason.trim()).not.toBe("");
      expect(page.retireWhen.trim()).not.toBe("");
      expect(page.content.overview.trim()).not.toBe("");
      expect(page.content.capabilities.length).toBeGreaterThan(0);
      for (const capability of page.content.capabilities) {
        expect(capability.title.trim()).not.toBe("");
        expect(capability.description.trim()).not.toBe("");
      }
      expect(titles.has(page.metadata.title)).toBe(false);
      expect(descriptions.has(page.metadata.description)).toBe(false);
      titles.add(page.metadata.title);
      descriptions.add(page.metadata.description);
    }
  });

  it("references only real, non-deprecated media catalogue records", () => {
    for (const page of aiModelPages.active) {
      const card = resolve(page.model);
      expect(card).toBeDefined();
      expect(card?.deprecated).toBe(false);
    }
  });

  it("resolves a published page from its model", () => {
    for (const page of aiModelPages.active) {
      expect(aiModelPages.byModel(page.model)).toBe(page);
    }
  });

  it("routes every page to the exact listed image model it references", () => {
    for (const page of aiModelPages.active) {
      expect(page.demo.runner).toBe("image-playground");
      const demo = new URL(page.demo.href, "https://grida.co");
      expect(demo.pathname).toBe("/playground/image");

      expect(page.model.catalogue).toBe("image");
      expect(demo.searchParams.get("model")).toBe(page.model.id);
      const card = resolve(page.model);
      expect(card && "listed" in card && card.listed).toBe(true);
    }
  });

  it("keeps retired slugs out of the active inventory", () => {
    const activeSlugs = new Set(
      aiModelPages.active.map((page) => page.slug)
    );

    expect(
      aiModelPages.retired.filter((page) => activeSlugs.has(page.slug))
    ).toEqual([]);
    expect(
      aiModelPages.retired.filter(
        (page) =>
          page.disposition.kind === "redirect" &&
          page.disposition.destination === aiModelPages.path(page.slug)
      )
    ).toEqual([]);
  });
});
