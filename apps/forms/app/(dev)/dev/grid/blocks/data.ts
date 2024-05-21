import { VIDEO_BLOCK_SRC_DEFAULT_VALUE } from "@/k/video_block_defaults";
import type { GridaBlock, GridaBlockType } from "./types";
import {
  ButtonIcon,
  ClockIcon,
  ImageIcon,
  Link2Icon,
  TextIcon,
  VideoIcon,
} from "@radix-ui/react-icons";

export const blockpresets = [
  {
    preset: "https://forms.grida.co/blocks/start-button.schema.json",
    label: "Start Form Button",
    icon: ButtonIcon,
  },
  {
    preset: "https://forms.grida.co/blocks/timer.schema.json",
    label: "Campaign Timer",
    icon: ClockIcon,
  },
  {
    preset: "https://forms.grida.co/blocks/gallery.schema.json",
    label: "Gallery",
    icon: ImageIcon,
  },
  {
    preset: "button",
    label: "Button",
    icon: ButtonIcon,
  },
  {
    preset: "text",
    label: "Text",
    icon: TextIcon,
  },
  // {
  //   preset: "h1",
  //   label: "Heading",
  //   icon: TextIcon,
  // },
  // {
  //   preset: "p",
  //   label: "Paragraph",
  //   icon: TextIcon,
  // },
  {
    preset: "link",
    label: "Link",
    icon: Link2Icon,
  },
  {
    preset: "image",
    label: "Image",
    icon: ImageIcon,
  },
  {
    preset: "video",
    label: "Video",
    icon: VideoIcon,
  },
] as const;

export type PresetID = (typeof blockpresets)[number]["preset"];

export function block_from_preset(block: PresetID): GridaBlock | undefined {
  switch (block) {
    case "button": {
      return {
        type: "button",
        label: "Button",
        href: "#",
      };
    }
    case "text":
    // case "h1": {
    //   return {
    //     type: "typography",
    //     tag: "h1",
    //     data: "Hello World",
    //     style: {},
    //   };
    // }
    // case "p": {
    //   return {
    //     type: "typography",
    //     tag: "p",
    //     data: "In hac habitasse platea dictumst. Duis egestas libero molestie elementum tempus. Aenean ante diam, tristique ac ligula eget, laoreet vulputate quam. Quisque molestie tortor ut nisi varius suscipit. Aliquam ut dignissim ante. Lorem ipsum dolor sit amet, consectetur adipiscing.",
    //     style: {},
    //   };
    // }
    // case 'link': {
    //   return {
    //     type: 'link',
    //     label: 'Link'
    //   }
    // }
    case "image": {
      return {
        type: "image",
        // unsplash random image
        src: "https://source.unsplash.com/random/375x375",
        style: {
          objectFit: "cover",
        },
      };
    }
    case "video": {
      return {
        type: "video",
        src: VIDEO_BLOCK_SRC_DEFAULT_VALUE,
      };
    }
    case "https://forms.grida.co/blocks/start-button.schema.json": {
      return {
        type: "https://forms.grida.co/blocks/start-button.schema.json",
        status: {
          ok: {
            label: "Start",
          },
          alreadyresponded: {
            label: "Already Responded",
          },
          formclosed: {
            label: "Form Closed",
          },
        },
      };
    }
    case "https://forms.grida.co/blocks/timer.schema.json": {
      return {
        type: "https://forms.grida.co/blocks/timer.schema.json",
      };
    }
    case "https://forms.grida.co/blocks/gallery.schema.json": {
      return {
        type: "https://forms.grida.co/blocks/gallery.schema.json",
        pictures: [
          {
            src: "https://source.unsplash.com/random/375x375",
          },
        ],
      };
    }
  }
}
