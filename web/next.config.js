// @ts-check

const withTM = require("next-transpile-modules");

module.exports = withTM({
    webpack: function(config, {
        isServer
    }) {
        config.module.rules.push({
            test: /\.(eot|woff|woff2|ttf|svg|png|jpg|gif)$/,
            use: {
                loader: "url-loader",
                options: {
                    limit: 100000,
                    name: "[name].[ext]",
                },
            },
        });
        config.module.rules.push({
            test: /\.md$/,
            use: 'raw-loader',
        })
        if (!isServer) {
            config.node = {
                fs: 'empty',
            }
        }
        return config;
    },
    transpileModules: ["lodash-es"],
});