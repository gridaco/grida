import { Struct } from "../../../packages/editor-ui/lib";

export const MockStructData: Struct[] = [
  {
    id: "lay1",
    title: "layer name",
    type: "layout",
    child: [
      {
        id: "lay2",
        title: "layer name",
        type: "layout",
        child: [
          {
            id: "lay3",
            title: "layer name",
            type: "layout",
          },
          {
            id: "lay4",
            title: "layer name",
            type: "layout",
            child: [
              {
                id: "lay5",
                title: "layer name",
                type: "layout",
              },
              {
                id: "lay6",
                title: "layer name",
                type: "layout",
              },
            ],
          },
        ],
      },
      {
        id: "lay7",
        title: "layer name",
        type: "layout",
      },
      {
        id: "lay8",
        title: "layer name",
        type: "layout",
      },
    ],
  },
];
