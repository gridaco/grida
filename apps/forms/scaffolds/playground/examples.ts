const HOST = process.env.NEXT_PUBLIC_HOST_NAME || "http://localhost:3000";

export const examples = [
  {
    id: "001-hello-world",
    name: "Hello World",
    template: {
      schema: {
        src: `${HOST}/schema/examples/001-hello-world/form.json`,
      },
    },
  },
  {
    id: "002-iphone-pre-order",
    name: "iPhone Pre-Order",
    template: {
      schema: {
        src: `${HOST}/schema/examples/002-iphone-pre-order/form.json`,
      },
    },
  },
  {
    id: "003-fields",
    name: "Fields",
    template: {
      schema: {
        src: `${HOST}/schema/examples/003-fields/form.json`,
      },
    },
  },
] as const;
