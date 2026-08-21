import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { aiModelPages } from "@/www/data/ai-model-pages";
import { modelMetadata } from "./model-metadata";
import { ModelPage } from "./model-page";
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
      openGraph: {
        url: "https://grida.co/ai/models/gpt-image-2",
        images: undefined,
      },
      twitter: {
        card: "summary",
        images: undefined,
      },
    });
  });

  it("renders the dedicated GPT Image 2 scaffold and routed demo", () => {
    const markup = renderToStaticMarkup(<ModelPage page={fixture} />);

    expect(markup).toContain("<h1");
    expect(markup).toContain("GPT Image 2");
    expect(markup).toContain("<h2");
    expect(markup).toContain("GPT Image 2 output");
    expect(markup).toContain("Awaiting approved GPT Image 2 output.");
    expect(markup).toContain("1024×1024");
    expect(markup).toContain("openai/gpt-image-2");
    expect(markup).toContain("Open in image playground");
    expect(markup).toContain("/playground/image?model=openai%2Fgpt-image-2");
    expect(markup).not.toContain("Lyria");
    expect(markup).not.toContain("/ai/music");
  });

  it("refuses a registry entry that points the authored page at another model", () => {
    const mismatched = {
      ...fixture,
      model: { catalogue: "image", id: "openai/gpt-image-1.5" },
    } as const satisfies aiModelPages.Entry;

    expect(() => renderToStaticMarkup(<ModelPage page={mismatched} />)).toThrow(
      "GPT Image 2 page requires registry model openai/gpt-image-2"
    );
  });
});
