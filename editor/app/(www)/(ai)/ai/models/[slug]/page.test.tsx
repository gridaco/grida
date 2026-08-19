import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { aiModelPages } from "@/www/data/ai-model-pages";
import { modelMetadata } from "./model-metadata";
import { ModelOverview } from "./model-overview";
import { dynamic, dynamicParams, generateStaticParams } from "./page";

const fixture = {
  slug: "gpt-image-2",
  successorLineage: "openai-gpt-image",
  model: { catalogue: "image", id: "openai/gpt-image-2" },
  publishReason: "Test fixture",
  retireWhen: "Test fixture",
  metadata: {
    title: "GPT Image 2 AI Image Generator — Grida",
    description: "Generate images with OpenAI GPT Image 2.",
    keywords: ["gpt image 2", "ai image generator"],
  },
  content: {
    overview: "A model-specific editorial overview.",
    capabilities: [
      {
        title: "Prompt-to-image generation",
        description: "Generate an image from a written prompt.",
      },
    ],
  },
  demo: {
    runner: "image-playground",
    placement: "routed",
    href: "/playground/image?model=openai%2Fgpt-image-2",
  },
} as const satisfies aiModelPages.Entry;

describe("AI model page route", () => {
  it("is static and refuses params outside the active inventory", () => {
    expect(dynamic).toBe("force-static");
    expect(dynamicParams).toBe(false);
  });

  it("derives static params from the editorial inventory", () => {
    expect(generateStaticParams()).toEqual(
      aiModelPages.active.map((page) => ({ slug: page.slug }))
    );
  });

  it("builds canonical metadata from one inventory entry", () => {
    expect(modelMetadata(fixture)).toMatchObject({
      title: fixture.metadata.title,
      description: fixture.metadata.description,
      keywords: [...fixture.metadata.keywords],
      alternates: { canonical: "https://grida.co/ai/models/gpt-image-2" },
      openGraph: { url: "https://grida.co/ai/models/gpt-image-2" },
    });
  });

  it("renders one semantic overview from referenced catalogue facts", () => {
    const markup = renderToStaticMarkup(<ModelOverview page={fixture} />);

    expect(markup).toContain("<h1");
    expect(markup).toContain("GPT Image 2 AI Image Generator");
    expect(markup).toContain("<h2");
    expect(markup).toContain("Model capabilities");
    expect(markup).toContain("<h3");
    expect(markup).toContain("A model-specific editorial overview");
    expect(markup).toContain("1024×1024");
    expect(markup).toContain("$0.005–$0.211 per image");
    expect(markup).toContain("0.655–8.29 MP");
    expect(markup).toContain("~1 minute");
    expect(markup).toContain("openai/gpt-image-2");
    expect(markup).toContain("Try GPT Image 2");
    expect(markup).toContain("/playground/image?model=openai%2Fgpt-image-2");
  });
});
