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
                    pages: "./pages",
                    public: "./public",
                },
            },
        ],
    ],
};