module.exports = {
    presets: ["next/babel", "@emotion/babel-preset-css-prop"],
    plugins: [
        ["emotion"],
        [
            "module-resolver", {
                root: ["."],
                alias: {
                    components: "./components",
                    utils: "./utils",
                    layouts: "./layouts",
                    pages: "./pages",
                    public: "./public",
                },
            },
        ],
    ],
};