import type { grida } from "@/grida";

type BoxShadow = grida.program.cg.BoxShadow;

export const boxshadow: Record<
  string,
  {
    label: string;
    class: string;
    value: BoxShadow;
  }
> = {
  "shadow-none": {
    label: "None",
    class: "shadow-none",
    value: {
      color: { r: 0, g: 0, b: 0, a: 0 },
      offset: [0, 0],
      blur: 0,
      spread: 0,
    },
  },
  "shadow-sm": {
    label: "Small",
    class: "shadow-sm",
    value: {
      color: { r: 0, g: 0, b: 0, a: 0.05 },
      offset: [0, 1],
      blur: 2,
      spread: 0,
    },
  },
  shadow: {
    label: "Default",
    class: "shadow",
    value: {
      color: { r: 0, g: 0, b: 0, a: 0.1 },
      offset: [0, 1],
      blur: 3,
      spread: -1,
    },
  },
  "shadow-md": {
    label: "Medium",
    class: "shadow-md",
    value: {
      color: { r: 0, g: 0, b: 0, a: 0.1 },
      offset: [0, 4],
      blur: 6,
      spread: -1,
    },
  },
  "shadow-lg": {
    label: "Large",
    class: "shadow-lg",
    value: {
      color: { r: 0, g: 0, b: 0, a: 0.1 },
      offset: [0, 10],
      blur: 15,
      spread: -3,
    },
  },
  "shadow-xl": {
    label: "Extra Large",
    class: "shadow-xl",
    value: {
      color: { r: 0, g: 0, b: 0, a: 0.1 },
      offset: [0, 20],
      blur: 25,
      spread: -5,
    },
  },
  "shadow-2xl": {
    label: "2 Extra Large",
    class: "shadow-2xl",
    value: {
      color: { r: 0, g: 0, b: 0, a: 0.25 },
      offset: [0, 25],
      blur: 50,
      spread: -12,
    },
  },
} as const;
