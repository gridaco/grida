module.exports = {
    theme: {
        typography: {
            default: {
                css: {
                    color: '#333',
                    a: {
                        color: '#3182ce',
                        '&:hover': {
                            color: '#2c5282',
                        },
                    },
                },
            },
        },
    },
    plugins: [
        require('@tailwindcss/typography'),
        // ...
    ],
}