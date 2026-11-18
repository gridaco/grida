export type WorkflowShowcase = {
  slug: string;
  sourceFolder: string;
  templateId?: string;
  title: string;
  input: string;
  output: string;
  preview: {
    image: string;
    description: string;
    motion?: {
      kind: "video" | "animated-image";
      src: string;
    };
  };
};

export function workflowShowcaseUrl(slug: string) {
  return `https://grida.co/fx/workflows/${slug}`;
}

// A pinned snapshot of the FX website's gallery, in its published order.
export const workflowShowcases: readonly WorkflowShowcase[] = [
  {
    slug: "parallax",
    sourceFolder: "looping-parallax",
    title: "Parallax background",
    input: "Concept image",
    output: "Three scrolling layers",
    preview: {
      image:
        "https://fx-cdn.grida.co/showcase/runs/abe44ccedb750bf05633886c052545079f97aee6e83f7161b2611295e4249d3d/artifacts/bfd17c5cbafbcb220da9b45be0e72a9733778feef0759d4cfe446cb56f5c893d.png",
      motion: {
        kind: "video",
        src: "https://fx-cdn.grida.co/showcase/runs/abe44ccedb750bf05633886c052545079f97aee6e83f7161b2611295e4249d3d/artifacts/ea4210c38afb6657b866ef08614e73b93cb11f6262262830b0fa343794c3c857.mp4",
      },
      description: "A meadow landscape scrolls in three layers",
    },
  },
  {
    slug: "pet",
    sourceFolder: "pet",
    templateId: "pet",
    title: "Pet",
    input: "Character picture and description",
    output: "Nine-state animated sprite sheet",
    preview: {
      image:
        "https://fx-cdn.grida.co/showcase/runs/2d2d37fc6940c7063dac776e6968ace48e83eff51ff7b7a9d8640599aaaf5c96/artifacts/90325f6ab29c3e61c4eb32d659c63b831abc2b02cc07e8919d396081b1b633f3.webp",
      motion: {
        kind: "video",
        src: "https://fx-cdn.grida.co/showcase/runs/2d2d37fc6940c7063dac776e6968ace48e83eff51ff7b7a9d8640599aaaf5c96/artifacts/6b2fd6ef4b512b984308a9ab80a1aea44443b6a4b1ca4b357fe40732d6e6981a.mp4",
      },
      description: "Coral, an animated pet, cycles through its sprite poses",
    },
  },
  {
    slug: "world",
    sourceFolder: "world",
    title: "Illustrated storyworld",
    input: "World concept",
    output: "Six illustrated entities",
    preview: {
      image:
        "https://fx-cdn.grida.co/showcase/showcases/412d71164da3e787e38babfa4d99c0497cac942bf796847b3ce6608a4c8c1835/world/cover.webp",
      description: "Illustrated assets from the Windward Meadow storyworld",
    },
  },
  {
    slug: "movie-sprite",
    sourceFolder: "movie-sprite",
    title: "Transparent sprite loop",
    input: "Character illustration",
    output: "Transparent idle loop",
    preview: {
      image:
        "https://fx-cdn.grida.co/showcase/showcases/412d71164da3e787e38babfa4d99c0497cac942bf796847b3ce6608a4c8c1835/movie-sprite/cover.webp",
      motion: {
        kind: "animated-image",
        src: "https://fx-cdn.grida.co/showcase/runs/c1ac112e0ea3c2800db925dafe671dda01538f45bc981235b203a0b73bb251c0/artifacts/4bc4339405b9f3c118be65283f10a3dfe30da928b64d8024d487eb0d89ffca2a.webp",
      },
      description: "A character idles and blinks on a transparent background",
    },
  },
  {
    slug: "portrait-motion",
    sourceFolder: "portrait-motion",
    title: "Facial animation patches",
    input: "High-resolution face image",
    output: "Six reusable face patches",
    preview: {
      image:
        "https://fx-cdn.grida.co/showcase/showcases/412d71164da3e787e38babfa4d99c0497cac942bf796847b3ce6608a4c8c1835/portrait-motion/cover.webp",
      motion: {
        kind: "animated-image",
        src: "https://fx-cdn.grida.co/showcase/runs/b35ef1984d95307e9bb16741640d5df33d7786a52fa7933d23502072347cabc1/artifacts/593f8553bd6526f4fb75af82c35e2b02371b871dda75fa44124764cd3de0deb4.webp",
      },
      description: "Eye and mouth patches animate an illustrated face",
    },
  },
  {
    slug: "character-3d",
    sourceFolder: "character-3d",
    title: "Rigged 3D character",
    input: "Character brief and reference",
    output: "Skinned GLB and six clips",
    preview: {
      image:
        "https://fx-cdn.grida.co/showcase/runs/ebf0befefd7d408fe27c07c942850e9d4c036158a6472a9a26f93824531b6aab/artifacts/7ca6a21a2eb3b0be310afcd1b52cce86de1f029d7feebd9e9da0c5e415243938.webp",
      motion: {
        kind: "video",
        src: "https://fx-cdn.grida.co/showcase/runs/ebf0befefd7d408fe27c07c942850e9d4c036158a6472a9a26f93824531b6aab/artifacts/6e6a07386447430242dc0af11787f8db3ed4cc59135d2c1f0d2c38153e91c506.mp4",
      },
      description: "A textured 3D character demonstrates its animation rig",
    },
  },
  {
    slug: "terrain",
    sourceFolder: "terrain",
    title: "47-tile terrain atlas",
    input: "Landscape direction",
    output: "47-tile terrain atlas",
    preview: {
      image:
        "https://fx-cdn.grida.co/showcase/runs/9e7658de4aa6d43d8774a7d5ab76b3ea8c29f883a1acab2be7fdab29765f32ca/artifacts/e103b0be751bf77a8a7e0c25925c341773f965aee4092f0f42760fb1d0023b42.webp",
      motion: {
        kind: "video",
        src: "https://fx-cdn.grida.co/showcase/runs/9e7658de4aa6d43d8774a7d5ab76b3ea8c29f883a1acab2be7fdab29765f32ca/artifacts/a4621731541667a062a752405e41814ff0040069ef6f4bbda02ee5eaa73308ff.mp4",
      },
      description: "Terrain tiles assemble into a meadow map",
    },
  },
  {
    slug: "ui-kit",
    sourceFolder: "ui-kit",
    title: "Nine-slice UI kit",
    input: "Visual direction",
    output: "Panel, button states, and icons",
    preview: {
      image:
        "https://fx-cdn.grida.co/showcase/showcases/412d71164da3e787e38babfa4d99c0497cac942bf796847b3ce6608a4c8c1835/ui-kit/cover.webp",
      description: "A matching interface panel, buttons, and icon sheet",
    },
  },
];
