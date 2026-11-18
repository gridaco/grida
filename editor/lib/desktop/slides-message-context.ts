import type { NativeChatMessageContext } from "@grida/desktop-bridge";
import type { WelcomeTemplate } from "./welcome-message";

export const SLIDES_TEMPLATE_PART = {
  kind: "slides.template",
  version: 1,
} as const;

export function slidesTemplateMessageContext({
  title,
  slides,
  path,
}: WelcomeTemplate): NativeChatMessageContext {
  return {
    modelText: `Use the copied slides template ${JSON.stringify(title)} (${slides} slides) at ${JSON.stringify(path)}. Edit that deck and keep its visual system.`,
    displayParts: [{ ...SLIDES_TEMPLATE_PART, data: { title, slides } }],
  };
}
