module.exports = {
  presets: ["next/babel", "@emotion/babel-preset-css-prop"],
  plugins: [
    ["emotion"],
    [
      "module-resolver",
      {
        root: ["."],
        alias: {
          components: "./components",
          utils: "./utils",
          features: "./features",
          apis: "./apis",
          services: "./services",
          public: "./public",
        },
      },
    ],
  ],
};
