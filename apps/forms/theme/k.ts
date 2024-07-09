const HOST_NAME = process.env.NEXT_PUBLIC_HOST_NAME || "http://localhost:3000";

export const backgrounds = [
  { name: "None", value: "" },
  { name: "Aurora", value: `${HOST_NAME}/theme/embed/backgrounds/aurora` },
  { name: "Dots", value: `${HOST_NAME}/theme/embed/backgrounds/dots` },
  { name: "Grid", value: `${HOST_NAME}/theme/embed/backgrounds/grid` },
  {
    name: "Grid (small)",
    value: `${HOST_NAME}/theme/embed/backgrounds/grid?variant=sm`,
  },
  { name: "Globe", value: `${HOST_NAME}/theme/embed/backgrounds/globe` },
  {
    name: "Shader Gradient 00 Halo",
    value: `${HOST_NAME}/theme/embed/backgrounds/shadergradient/01`,
  },
  {
    name: "Shader Gradient 01 Pensive",
    value: `${HOST_NAME}/theme/embed/backgrounds/shadergradient/01`,
  },
  {
    name: "Shader Gradient 02 Mint",
    value: `${HOST_NAME}/theme/embed/backgrounds/shadergradient/02`,
  },
  {
    name: "Shader Gradient 03 Interstella",
    value: `${HOST_NAME}/theme/embed/backgrounds/shadergradient/03`,
  },
  {
    name: "Shader Gradient 04 Nightly night",
    value: `${HOST_NAME}/theme/embed/backgrounds/shadergradient/04`,
  },
  {
    name: "Shader Gradient 05 Viola orientalis",
    value: `${HOST_NAME}/theme/embed/backgrounds/shadergradient/05`,
  },
  {
    name: "Shader Gradient 06 Universe",
    value: `${HOST_NAME}/theme/embed/backgrounds/shadergradient/06`,
  },
  {
    name: "Shader Gradient 07 Sunset",
    value: `${HOST_NAME}/theme/embed/backgrounds/shadergradient/07`,
  },
  {
    name: "Shader Gradient 08 Madarin",
    value: `${HOST_NAME}/theme/embed/backgrounds/shadergradient/08`,
  },
  {
    name: "Shader Gradient 09 Cotton candy",
    value: `${HOST_NAME}/theme/embed/backgrounds/shadergradient/09`,
  },
  {
    name: "Shader Gradient 93 Twilight blue",
    value: `${HOST_NAME}/theme/embed/backgrounds/shadergradient/93`,
  },
  {
    name: "Shader Gradient 94 Abyss blue",
    value: `${HOST_NAME}/theme/embed/backgrounds/shadergradient/94`,
  },
  {
    name: "Shader Gradient 95 Lavender mist",
    value: `${HOST_NAME}/theme/embed/backgrounds/shadergradient/95`,
  },
  {
    name: "Shader Gradient 96 Aqua noir",
    value: `${HOST_NAME}/theme/embed/backgrounds/shadergradient/96`,
  },
  {
    name: "Shader Gradient 97 Electric violet ",
    value: `${HOST_NAME}/theme/embed/backgrounds/shadergradient/97`,
  },
  {
    name: "Shader Gradient 98 Pastel dream",
    value: `${HOST_NAME}/theme/embed/backgrounds/shadergradient/98`,
  },
  {
    name: "Shader Gradient 99 Skyline gradient",
    value: `${HOST_NAME}/theme/embed/backgrounds/shadergradient/99`,
  },
] as const;
