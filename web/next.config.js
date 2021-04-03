const FIREBASE_ENV_VARS = {
    FIREBASE_API_KEY: process.env.FIREBASE_API_KEY,
    FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN,
    FIREBASE_DATABASE_URL: process.env.FIREBASE_DATABASE_URL,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_STORAGE_BUKET: process.env.FIREBASE_STORAGE_BUKET,
    FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID,
    FIREBASE_APP_ID: process.env.FIREBASE_APP_ID,
    FIREBASE_MEASUREMENT_ID: process.env.FIREBASE_MEASUREMENT_ID
}

module.exports = ({
    webpack: function(config) {
        config.module.rules.push({
            test: /\.(eot|woff|woff2|ttf|svg|png|jpg|gif)$/,
            use: {
                loader: "url-loader",
                options: {
                    limit: 100000,
                    name: "[name].[ext]",
                },
            },
        })
        config.module.rules.push({
            test: /\.md$/,
            use: 'raw-loader',
        })
        config.module.rules.push({
            test: /\.ts(x?)$/,
            use: 'babel-loader',
        })
        return config;
    },
    env: {
        ...FIREBASE_ENV_VARS
    },

    // USE WEBPACK5, 
    // ref : https://nextjs.org/docs/messages/webpack5
    future: {
        webpack5: true,
    },
});