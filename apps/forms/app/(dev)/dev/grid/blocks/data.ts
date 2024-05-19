import { VIDEO_BLOCK_SRC_DEFAULT_VALUE } from "@/k/video_block_defaults";
import type { GridaBlock } from "./types";

export function create_initial_grida_block(block: any): GridaBlock | undefined {
  switch (block) {
    case "button": {
      return {
        type: "button",
        label: "Button",
      };
    }
    case "text":
    case "typography": {
      return {
        type: "typography",
        element: "h1",
        data: "Hello World",
      };
    }
    case "h1": {
      return {
        type: "typography",
        element: "h1",
        data: "Hello World",
      };
    }
    case "p": {
      return {
        type: "typography",
        element: "p",
        data: "In hac habitasse platea dictumst. Duis egestas libero molestie elementum tempus. Aenean ante diam, tristique ac ligula eget, laoreet vulputate quam. Quisque molestie tortor ut nisi varius suscipit. Aliquam ut dignissim ante. Lorem ipsum dolor sit amet, consectetur adipiscing.",
      };
    }
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
      };
    }
    case "video": {
      return {
        type: "video",
        src: VIDEO_BLOCK_SRC_DEFAULT_VALUE,
      };
    }
  }
}
