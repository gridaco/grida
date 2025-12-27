import type cg from "@grida/cg";
import kolor from "@grida/color";

type BoxShadow = cg.BoxShadow;

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
      color: kolor.colorformats.newRGBA32F(0, 0, 0, 0),
      offset: [0, 0],
      blur: 0,
      spread: 0,
    },
  },
  "shadow-sm": {
    label: "Small",
    class: "shadow-sm",
    value: {
      color: kolor.colorformats.newRGBA32F(0, 0, 0, 0.05),
      offset: [0, 1],
      blur: 2,
      spread: 0,
    },
  },
  shadow: {
    label: "Default",
    class: "shadow",
    value: {
      color: kolor.colorformats.newRGBA32F(0, 0, 0, 0.1),
      offset: [0, 1],
      blur: 3,
      spread: -1,
    },
  },
  "shadow-md": {
    label: "Medium",
    class: "shadow-md",
    value: {
      color: kolor.colorformats.newRGBA32F(0, 0, 0, 0.1),
      offset: [0, 4],
      blur: 6,
      spread: -1,
    },
  },
  "shadow-lg": {
    label: "Large",
    class: "shadow-lg",
    value: {
      color: kolor.colorformats.newRGBA32F(0, 0, 0, 0.1),
      offset: [0, 10],
      blur: 15,
      spread: -3,
    },
  },
  "shadow-xl": {
    label: "Extra Large",
    class: "shadow-xl",
    value: {
      color: kolor.colorformats.newRGBA32F(0, 0, 0, 0.1),
      offset: [0, 20],
      blur: 25,
      spread: -5,
    },
  },
  "shadow-2xl": {
    label: "2 Extra Large",
    class: "shadow-2xl",
    value: {
      color: kolor.colorformats.newRGBA32F(0, 0, 0, 0.25),
      offset: [0, 25],
      blur: 50,
      spread: -12,
    },
  },
} as const;

type FeGaussianBlur = cg.FeGaussianBlur;

export const blur: Record<
  string,
  {
    label: string;
    class: string;
    value: FeGaussianBlur;
  }
> = {
  "blur-none": {
    label: "None",
    class: "blur-none",
    value: {
      type: "blur",
      radius: 0,
    },
  },
  "blur-sm": {
    label: "Small",
    class: "blur-sm",
    value: {
      type: "blur",
      radius: 4,
    },
  },
  blur: {
    label: "Default",
    class: "blur",
    value: {
      type: "blur",
      radius: 8,
    },
  },
  "blur-md": {
    label: "Medium",
    class: "blur-md",
    value: {
      type: "blur",
      radius: 12,
    },
  },
  "blur-lg": {
    label: "Large",
    class: "blur-lg",
    value: {
      type: "blur",
      radius: 16,
    },
  },
  "blur-xl": {
    label: "Extra Large",
    class: "blur-xl",
    value: {
      type: "blur",
      radius: 24,
    },
  },
  "blur-2xl": {
    label: "2 Extra Large",
    class: "blur-2xl",
    value: {
      type: "blur",
      radius: 40,
    },
  },
  "blur-3xl": {
    label: "3 Extra Large",
    class: "blur-3xl",
    value: {
      type: "blur",
      radius: 64,
    },
  },
} as const;
