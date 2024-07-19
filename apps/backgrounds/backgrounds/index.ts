interface Background {
  name: string;
  title: string;
  description: string;
  embed: string;
  url: string;
  preview: [string] | [string, string];
}

const data: ReadonlyArray<Background> = [
  {
    name: "aurora",
    title: "Aurora",
    description: "Aurora background",
    embed: "/embed/aurora",
    url: "/embed/aurora",
    preview: ["/preview/aurora.png", "/preview/aurora.mp4"],
  },
  {
    name: "dot",
    title: "Dot",
    description: "Dot background",
    embed: "/embed/dot",
    url: "/embed/dot",
    preview: ["/preview/dot.png"],
  },
  {
    name: "globe",
    title: "Globe",
    description: "Globe background",
    embed: "/embed/globe",
    url: "/embed/globe",
    preview: ["/preview/globe.png", "/preview/globe.mp4"],
  },
  {
    name: "grid",
    title: "Grid",
    description: "Grid background",
    embed: "/embed/grid",
    url: "/embed/grid",
    preview: ["/preview/grid.png"],
  },
  {
    name: "grid-sm",
    title: "Grid (small)",
    description: "Smaller Grid background",
    embed: "/embed/grid?variant=sm",
    url: "/embed/grid?variant=sm",
    preview: ["/preview/grid-sm.png"],
  },
  {
    name: "shadergradient-00",
    title: "Halo",
    description: "Shader Gradient 00 Halo",
    embed: "/embed/shadergradient/00",
    url: "/embed/shadergradient/00",
    preview: [
      "/preview/shadergradient-00.png",
      "/preview/shadergradient-00.mp4",
    ],
  },
  {
    name: "shadergradient-01",
    title: "Pensive",
    description: "Shader Gradient 01 Pensive",
    embed: "/embed/shadergradient/01",
    url: "/embed/shadergradient/01",
    preview: [
      "/preview/shadergradient-01.png",
      "/preview/shadergradient-01.mp4",
    ],
  },
  {
    name: "shadergradient-02",
    title: "Mint",
    description: "Shader Gradient 02 Mint",
    embed: "/embed/shadergradient/02",
    url: "/embed/shadergradient/02",
    preview: [
      "/preview/shadergradient-02.png",
      "/preview/shadergradient-02.mp4",
    ],
  },
  {
    name: "shadergradient-03",
    title: "Interstella",
    description: "Shader Gradient 03 Interstella",
    embed: "/embed/shadergradient/03",
    url: "/embed/shadergradient/03",
    preview: [
      "/preview/shadergradient-03.png",
      "/preview/shadergradient-03.mp4",
    ],
  },
  {
    name: "shadergradient-04",
    title: "Nightly night",
    description: "Shader Gradient 04 Nightly night",
    embed: "/embed/shadergradient/04",
    url: "/embed/shadergradient/04",
    preview: [
      "/preview/shadergradient-04.png",
      "/preview/shadergradient-04.mp4",
    ],
  },
  {
    name: "shadergradient-05",
    title: "Viola orientalis",
    description: "Shader Gradient 05 Viola orientalis",
    embed: "/embed/shadergradient/05",
    url: "/embed/shadergradient/05",
    preview: [
      "/preview/shadergradient-05.png",
      "/preview/shadergradient-05.mp4",
    ],
  },
  {
    name: "shadergradient-06",
    title: "Universe",
    description: "Shader Gradient 06 Universe",
    embed: "/embed/shadergradient/06",
    url: "/embed/shadergradient/06",
    preview: [
      "/preview/shadergradient-06.png",
      "/preview/shadergradient-06.mp4",
    ],
  },
  {
    name: "shadergradient-07",
    title: "Sunset",
    description: "Shader Gradient 07 Sunset",
    embed: "/embed/shadergradient/07",
    url: "/embed/shadergradient/07",
    preview: [
      "/preview/shadergradient-07.png",
      "/preview/shadergradient-07.mp4",
    ],
  },
  {
    name: "shadergradient-08",
    title: "Madarin",
    description: "Shader Gradient 08 Madarin",
    embed: "/embed/shadergradient/08",
    url: "/embed/shadergradient/08",
    preview: [
      "/preview/shadergradient-08.png",
      "/preview/shadergradient-08.mp4",
    ],
  },
  {
    name: "shadergradient-09",
    title: "Cotton candy",
    description: "Shader Gradient 09 Cotton candy",
    embed: "/embed/shadergradient/09",
    url: "/embed/shadergradient/09",
    preview: [
      "/preview/shadergradient-09.png",
      "/preview/shadergradient-09.mp4",
    ],
  },
  {
    name: "shadergradient-91",
    title: "Lunar wave",
    description: "Shader Gradient 91 Lunar wave",
    embed: "/embed/shadergradient/91",
    url: "/embed/shadergradient/91",
    preview: [
      "/preview/shadergradient-91.png",
      "/preview/shadergradient-91.mp4",
    ],
  },
  {
    name: "shadergradient-92",
    title: "Lemon glow",
    description: "Shader Gradient 92 Lemon glow",
    embed: "/embed/shadergradient/92",
    url: "/embed/shadergradient/92",
    preview: [
      "/preview/shadergradient-92.png",
      "/preview/shadergradient-92.mp4",
    ],
  },
  {
    name: "shadergradient-93",
    title: "Twilight blue",
    description: "Shader Gradient 93 Twilight blue",
    embed: "/embed/shadergradient/93",
    url: "/embed/shadergradient/93",
    preview: [
      "/preview/shadergradient-93.png",
      "/preview/shadergradient-93.mp4",
    ],
  },
  {
    name: "shadergradient-94",
    title: "Abyss blue",
    description: "Shader Gradient 94 Abyss blue",
    embed: "/embed/shadergradient/94",
    url: "/embed/shadergradient/94",
    preview: [
      "/preview/shadergradient-94.png",
      "/preview/shadergradient-94.mp4",
    ],
  },
  {
    name: "shadergradient-95",
    title: "Lavender mist",
    description: "Shader Gradient 95 Lavender mist",
    embed: "/embed/shadergradient/95",
    url: "/embed/shadergradient/95",
    preview: [
      "/preview/shadergradient-95.png",
      "/preview/shadergradient-95.mp4",
    ],
  },
  {
    name: "shadergradient-96",
    title: "Aqua noir",
    description: "Shader Gradient 96 Aqua noir",
    embed: "/embed/shadergradient/96",
    url: "/embed/shadergradient/96",
    preview: [
      "/preview/shadergradient-96.png",
      "/preview/shadergradient-96.mp4",
    ],
  },
  {
    name: "shadergradient-97",
    title: "Electric violet",
    description: "Shader Gradient 97 Electric violet",
    embed: "/embed/shadergradient/97",
    url: "/embed/shadergradient/97",
    preview: [
      "/preview/shadergradient-97.png",
      "/preview/shadergradient-97.mp4",
    ],
  },
  {
    name: "shadergradient-98",
    title: "Pastel dream",
    description: "Shader Gradient 98 Pastel dream",
    embed: "/embed/shadergradient/98",
    url: "/embed/shadergradient/98",
    preview: [
      "/preview/shadergradient-98.png",
      "/preview/shadergradient-98.mp4",
    ],
  },
  {
    name: "shadergradient-99",
    title: "Skyline gradient",
    description: "Shader Gradient 99 Skyline gradient",
    embed: "/embed/shadergradient/99",
    url: "/embed/shadergradient/99",
    preview: [
      "/preview/shadergradient-99.png",
      "/preview/shadergradient-99.mp4",
    ],
  },
];

export default data;
