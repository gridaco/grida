import { models } from "@grida/ai-models";
import { ModelCatalogStore, type ModelCatalogView } from "./model-catalog";

/** Synthetic host policy for SDK tests. Deliberately not Grida's service catalog. */
export namespace CatalogFixture {
  export function data() {
    return {
      image: {
        models: Object.fromEntries(
          Object.entries(models.image.models).map(([id, card]) => [
            id,
            {
              ...structuredClone(card!),
              listed: true,
              ...(id === "openai/gpt-image-2" ? { deprecated: true } : {}),
            },
          ])
        ),
      },
      video: {
        models: Object.fromEntries(
          Object.entries(models.video.models).map(([id, card]) => [
            id,
            { ...structuredClone(card!), listed: true },
          ])
        ),
      },
    };
  }
  export function view(input = data()): ModelCatalogView {
    function media<
      Card extends { id: string; listed: boolean; providers: object },
      Provider extends string,
      Binding,
    >(
      cards: Record<string, Card>
    ): ModelCatalogView.Media<Card, Provider, Binding> {
      return {
        models: cards,
        listed: () => Object.values(cards).filter((card) => card.listed),
        cardById: (id) => cards[id],
        binding: (card, provider) =>
          (card.providers as Record<string, Binding>)[provider] ?? null,
      };
    }
    const lifecycle = (cards: object, status: "listed" | "staged") =>
      Object.fromEntries(Object.keys(cards).map((id) => [id, { status }]));
    return {
      image: media(input.image.models),
      video: media(input.video.models),
      lifecycle: {
        music: lifecycle(models.audio.music.models, "listed"),
        sound_effects: lifecycle(models.audio.sound_effects.models, "staged"),
        text_to_speech: lifecycle(models.audio.text_to_speech.models, "staged"),
        three_d: lifecycle(models.three_d.models, "staged"),
      },
    };
  }
  export function store(input = data()) {
    return new ModelCatalogStore({ seed: view(input) });
  }
}
