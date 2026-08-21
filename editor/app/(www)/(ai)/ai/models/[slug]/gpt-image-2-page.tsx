import Link from "next/link";
import models from "@grida/ai-models";
import { Badge } from "@app/ui/components/badge";
import { Button } from "@app/ui/components/button";
import { ArrowRightIcon, ImageIcon, SparklesIcon } from "lucide-react";
import { aiModelPages } from "@/www/data/ai-model-pages";

const MODEL_ID = "openai/gpt-image-2" as const;

const model = (() => {
  const card = models.image.models[MODEL_ID];
  if (!card) {
    throw new Error("GPT Image 2 is missing from the image model catalogue");
  }
  return card;
})();

const presetSizes =
  model.sizes?.map(([width, height]) => `${width}×${height}`).join(" · ") ??
  "Flexible";

export function GptImage2Page({ page }: { page: aiModelPages.Entry }) {
  if (page.model.catalogue !== "image" || page.model.id !== model.id) {
    throw new Error(
      `GPT Image 2 page requires registry model ${model.id}, received ${page.model.catalogue}/${page.model.id}`
    );
  }

  return (
    <article data-testid="ai-model-page-gpt-image-2">
      <section className="border-b bg-muted/20">
        <div className="container mx-auto px-4 pb-20 pt-32 md:pb-28 md:pt-40">
          <div className="mx-auto max-w-6xl">
            <Link
              href="/ai/models"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              AI models
            </Link>
            <div className="mt-8">
              <Badge variant="outline">
                <SparklesIcon className="mr-1.5 size-3" />
                OpenAI · GPT Image 2
              </Badge>
            </div>
            <h1 className="mt-8 text-5xl font-semibold tracking-tight sm:text-6xl lg:text-7xl">
              GPT Image 2
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-muted-foreground md:text-xl">
              OpenAI image generation and editing model. The linked Grida
              playground currently provides text-to-image generation.
            </p>
            <Button asChild size="lg" className="mt-9">
              <Link href={page.demo.href}>
                Open in image playground
                <ArrowRightIcon className="ml-2 size-4" />
              </Link>
            </Button>

            <dl className="mt-16 grid max-w-4xl border-y sm:grid-cols-3 sm:divide-x">
              <Fact label="Model ID" value={model.id} mono />
              <Fact label="Current demo" value="Text to image" />
              <Fact label="Preset sizes" value={presetSizes} />
            </dl>
          </div>
        </div>
      </section>

      <OutputExampleSlot />
    </article>
  );
}

/**
 * Reserved for page-specific, approved GPT Image 2 output artwork.
 * Do not source editorial assets from another model or modality page.
 */
function OutputExampleSlot() {
  return (
    <section className="container mx-auto px-4 py-24 md:py-32">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[0.72fr_1.28fr]">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Output example
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
            GPT Image 2 output
          </h2>
        </div>
        <div className="grid aspect-[3/2] place-items-center rounded-2xl border border-dashed bg-muted/20 text-center">
          <div className="px-6">
            <ImageIcon className="mx-auto size-7 text-muted-foreground" />
            <p className="mt-4 text-sm font-medium">
              Page-specific output artwork
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Awaiting approved GPT Image 2 output.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Fact({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 py-7 sm:px-7 sm:first:pl-0 sm:last:pr-0">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`mt-3 break-words text-sm leading-6 ${mono ? "font-mono text-xs" : "font-medium"}`}
      >
        {value}
      </dd>
    </div>
  );
}
