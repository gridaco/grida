// GRIDA-SEC-004 / GRIDA-SEC-006 — deterministic host membership grants no transport or credential authority.
// GRIDA-GG: provider — synthetic host policy, never a Grida service default.
/** Independent proof-host membership over public facts, not Grida service policy. */
export function proofCatalog(models) {
  function media(facts, ids) {
    const cards = Object.freeze(
      Object.fromEntries(
        ids.map((id) => [
          id,
          Object.freeze({ ...facts.models[id], listed: true }),
        ])
      )
    );
    const listed = Object.freeze(Object.values(cards));
    return Object.freeze({
      models: cards,
      listed: () => listed,
      cardById: (id) => (Object.hasOwn(cards, id) ? cards[id] : undefined),
      binding: (card, provider) => facts.binding(card, provider),
    });
  }
  function lifecycle(ids, status) {
    return Object.freeze(
      Object.fromEntries(ids.map((id) => [id, Object.freeze({ status })]))
    );
  }
  return Object.freeze({
    image: media(models.image, ["openai/gpt-image-2"]),
    video: media(models.video, ["google/veo-3.1"]),
    lifecycle: Object.freeze({
      music: lifecycle(["google/lyria-3", "google/lyria-3-pro"], "listed"),
      sound_effects: lifecycle(["eleven_text_to_sound_v2"], "staged"),
      text_to_speech: lifecycle(["eleven_v3"], "staged"),
      three_d: lifecycle(
        [
          "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d",
          "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d",
          "fal-ai/trellis-2",
        ],
        "staged"
      ),
    }),
  });
}
