export const BlockFrameInteraction = {
  get: () => {
    if (typeof window !== "undefined") {
      return (
        window.localStorage.getItem("vanilla-interaction-block-preference") ===
        "true"
      );
    }
  },
  set: (interaction: boolean) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "vanilla-interaction-block-preference",
        String(interaction)
      );
    }
  },
};
