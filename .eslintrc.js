module.exports = {
    parser: "@typescript-eslint/parser",
    extends: ["plugin:prettier/recommended"],
    parserOptions: {
        ecmaVersion: 2018,
        sourceType: "module",
        ecmaFeatures: {
            jsx: true,
        },
    },
    plugins: [
        "prettier",
        "react",
        "@typescript-eslint",
        "react-hooks",
        "import-helpers",
    ],
    rules: {
        "react-hooks/rules-of-hooks": "error",
        "import-helpers/order-imports": [
            "error", {
                // example configuration
                newlinesBetween: "always",
                groups: [
                    ["module", "/^lodash-es/"],
                    [
                        "/^components/",
                        "/^pages/",
                        "/^public/",
                        "/^utils/",
                    ],
                    ["parent", "sibling", "index"],
                ],
                alphabetize: {
                    order: "asc",
                    ignoreCase: true
                },
            },
        ],
    },
    settings: {
        react: {
            version: "detect",
        },
    },
};