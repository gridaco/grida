export default {
  routes: [
    {
      title: "Documentation",
      heading: true,
      routes: [
        {
          title: "Getting Started",
          path: "/docs/getting-started",
        },
        {
          title: "Assistant",
          open: true,
          routes: [
            {
              title: "Design Assistant",
              path: "/docs/assistant/design-assistant",
              routes: [
                {
                  title: "Icons loader",
                  path:
                    "https://blog.grida.co/bridged-assistant-update-2021-0-1f1-meet-powerful-bridged-design-assistants-icon-loader-552b452396a4",
                },
              ],
            },
            // {
            //   title: "Components View",
            //   path: "/docs/assistant/components-view",
            // },
            // {
            //   title: "Code View",
            //   path: "/docs/assistant/code-view",
            // },
            // {
            //   title: "Quick look",
            //   path: "/docs/assistant/quicklook",
            // },
            // {
            //   title: "Click to copy",
            //   path: "/docs/assistant/click-to-copy",
            // },
            // {
            //   title: "Design Linting",
            //   path: "/docs/assistant/linter",
            // },
            // {
            //   title: "Preferences",
            //   path: "/docs/assistant/preferences",
            // },
            // {
            //   title: "Environment Variables",
            //   path: "/docs/assistant/environment-variables",
            // },
          ],
        },
        // {
        //   title: "Conventions",
        //   routes: [
        //     {
        //       title: "Introduction",
        //       path: "/docs/conventions/index",
        //     },
        //     {
        //       title: "Naming conventions",
        //       routes: [
        //         {
        //           title: "Routes",
        //           path: "/docs/conventions/routes",
        //         },
        //         {
        //           title: "Dynamic Routes",
        //           path: "/docs/conventions/dynamic-routes",
        //         },
        //       ],
        //     },
        //   ],
        // },

        // @designto-code
        {
          title: "Design to code",
          routes: [
            // {
            //   title: "Introduction",
            //   path: "/docs/@designto-code/index",
            // },
            {
              title: "Components allowed property",
              path: "/docs/@designto-code/component-allowed-property",
            },
            {
              title: "Components multi proxied property",
              path: "/docs/@designto-code/component-multi-proxied-property",
            },
            {
              title: "Nested Components",
              path: "/docs/@designto-code/component-nested",
            },
            {
              title: "Components property defaults",
              path: "/docs/@designto-code/component-property-default-value",
            },
            {
              title: "Components Interfacing",
              routes: [
                {
                  title: "Automatic interfacing strategy",
                  path:
                    "/docs/@designto-code/component-property-interfacing-auto",
                },
              ],
            },
            {
              title: "CSS",
              routes: [
                {
                  title: "Introduction",
                  path: "/docs/@designto-code/css",
                },
                {
                  title: "Box Sizing",
                  path: "/docs/@designto-code/css-box-sizing",
                },
                {
                  title: "Clip path",
                  path: "/docs/@designto-code/css-clip-path",
                },
                {
                  title: "Mask",
                  path: "/docs/@designto-code/css-mask",
                },
                {
                  title: "Positioning",
                  path: "/docs/@designto-code/css-position-absolute-vs-fixed",
                },
              ],
            },
            {
              title: "Figma",
              routes: [
                {
                  title: "Autolayout",
                  path: "/docs/@designto-code/figma-autolayout",
                },
                {
                  title: "Blur effects",
                  path: "/docs/@designto-code/figma-blur-effects",
                },
                {
                  title: "Boolean Operation",
                  path: "/docs/@designto-code/figma-boolean-operation",
                },
                {
                  title: "Constraints - center",
                  path: "/docs/@designto-code/figma-constraint-center",
                },
                {
                  title: "Constraints - scale",
                  path: "/docs/@designto-code/figma-constraint-scale",
                },
                {
                  title: "Constraints - stretch",
                  path: "/docs/@designto-code/figma-constraint-stretch",
                },
                {
                  title: "Line height",
                  path: "/docs/@designto-code/figma-line-height",
                },
                {
                  title: "Line",
                  path: "/docs/@designto-code/figma-line",
                },
                {
                  title: "Masking layer",
                  path: "/docs/@designto-code/figma-mask-layer",
                },
                {
                  title: "Rotation",
                  path: "/docs/@designto-code/figma-rotation",
                },
                {
                  title: "Scale",
                  path: "/docs/@designto-code/figma-scale",
                },
                {
                  title: "Strokes",
                  path: "/docs/@designto-code/figma-strokes",
                },
                {
                  title: "Text auto resize",
                  path: "/docs/@designto-code/figma-text-autoresize",
                },
                {
                  title: "Vector",
                  path: "/docs/@designto-code/figma-vector",
                },
                {
                  title: "Visibility",
                  path: "/docs/@designto-code/figma-visibility",
                },
              ],
            },
            {
              title: "Flutter",
              routes: [
                {
                  title: "Multiple decoration Boxdecoration",
                  path:
                    "/docs/@designto-code/flutter-box-decoration-multiple-visuals",
                },
                {
                  title: "Multiple gradients",
                  path: "/docs/@designto-code/flutter-multiple-gradients",
                },
                {
                  title: "Positioned vs Align",
                  path: "/docs/@designto-code/flutter-positioned-vs-align",
                },
                {
                  title: "SVG Support",
                  path: "/docs/@designto-code/flutter-svg-support",
                },
                {
                  title: "ConstrainedBox",
                  path:
                    "/docs/@designto-code/flutter-when-to-use-constrainedbox",
                },
              ],
            },
            {
              title: "Flags",
              path: "/docs/@designto-code/flags",
            },
            {
              title: "Icons",
              path: "/docs/@designto-code/icons",
            },
            {
              title: "Item order",
              path: "/docs/@designto-code/item-order",
            },
            {
              title: "Item overflow",
              path: "/docs/@designto-code/item-overflow",
            },
            {
              title: "Scrolling on Overflow",
              path: "/docs/@designto-code/overflow-layout-scroll",
            },
            {
              title: "Item spacing",
              path: "/docs/@designto-code/item-spacing",
            },
            {
              title: "Known issues",
              path: "/docs/@designto-code/known-issues",
            },
            {
              title: "JSX line break",
              path: "/docs/@designto-code/react-jsx-css-line-break",
            },
            {
              title: "Multi styles on Text",
              path: "/docs/@designto-code/text-multi-style",
            },
          ],
        },
        // {
        //   title: "GIT integration",
        //   path: "/docs/deployment.md",
        // },
        // {
        //   title: "Cloud Platform",
        //   path: "/docs/authentication.md",
        // },
        // {
        //   title: "Advanced Features",
        //   routes: [
        //     {
        //       title: "Preview Mode",
        //       path: "/docs/advanced-features/preview-mode.md",
        //     },
        //     {
        //       title: "Dynamic Import",
        //       path: "/docs/advanced-features/dynamic-import.md",
        //     },
        //     {
        //       title: "Automatic Static Optimization",
        //       path: "/docs/advanced-features/automatic-static-optimization.md",
        //     },
        //     {
        //       title: "Static HTML Export",
        //       path: "/docs/advanced-features/static-html-export.md",
        //     },
        //     {
        //       title: "Absolute Imports and Module Path Aliases",
        //       path: "/docs/advanced-features/module-path-aliases.md",
        //     },
        //   ],
        // },
        // {
        //   title: "Packages",
        //   routes: [
        //     {
        //       title: "Dynamic",
        //       path: "/docs/dynamic",
        //     },
        //     {
        //       title: "InApp Bridge",
        //       path: "/docs/inapp-bridge",
        //     },
        //   ],
        // },
        // {
        //   title: "Platforms",
        //   routes: [
        //     {
        //       title: "Figma",
        //       routes: [
        //         {
        //           title: "Introduction",
        //           path: "/docs/platforms/figma",
        //         },
        //       ],
        //     },
        //     {
        //       title: "XD",
        //       routes: [
        //         {
        //           title: "Introduction",
        //           path: "/docs/platforms/figma",
        //         },
        //       ],
        //     },
        //     {
        //       title: "Flutter",
        //       routes: [
        //         {
        //           title: "Introduction",
        //           path: "/docs/platforms/figma",
        //         },
        //       ],
        //     },
        //     {
        //       title: "React",
        //       routes: [
        //         {
        //           title: "Introduction",
        //           path: "/docs/platforms/react",
        //         },
        //       ],
        //     },
        //     {
        //       title: "Sketch",
        //       routes: [
        //         {
        //           title: "Introduction",
        //           path: "/docs/platforms/sketch",
        //         },
        //       ],
        //     },
        //     {
        //       title: "Vue",
        //       routes: [
        //         {
        //           title: "Introduction",
        //           path: "/docs/platforms/vue",
        //         },
        //       ],
        //     },
        //     {
        //       title: "HTML/CSS",
        //       routes: [
        //         {
        //           title: "Introduction",
        //           path: "/docs/platforms/vanilla-web",
        //         },
        //       ],
        //     },
        //   ],
        // },
        {
          title: "FAQ",
          path: "/docs/faq",
        },
      ],
    },
    // {
    //   title: "API Reference",
    //   heading: true,
    //   routes: [
    //     {
    //       title: "CLI",
    //       path: "/docs/api-reference/cli.md",
    //     },
    //     {
    //       title: "Create Next App",
    //       path: "/docs/api-reference/create-next-app.md",
    //     },
    //     {
    //       title: "next/router",
    //       path: "/docs/api-reference/next/router.md",
    //     },
    //     {
    //       title: "next/link",
    //       path: "/docs/api-reference/next/link.md",
    //     },
    //     {
    //       title: "next/image",
    //       path: "/docs/api-reference/next/image.md",
    //     },
    //     {
    //       title: "next/head",
    //       path: "/docs/api-reference/next/head.md",
    //     },
    //     {
    //       title: "next/amp",
    //       path: "/docs/api-reference/next/amp.md",
    //     },
    //     {
    //       title: "Data Fetching",
    //       routes: [
    //         {
    //           title: "getInitialProps",
    //           path: "/docs/api-reference/data-fetching/getInitialProps.md",
    //         },
    //       ],
    //     },
    //     {
    //       title: "Static Optimization Indicator",
    //       path:
    //         "/docs/api-reference/next.config.js/static-optimization-indicator.md",
    //     },
    //     {
    //       title: "next.config.js",
    //       routes: [
    //         {
    //           title: "Introduction",
    //           path: "/docs/api-reference/next.config.js/introduction.md",
    //         },
    //         {
    //           title: "Environment Variables",
    //           path:
    //             "/docs/api-reference/next.config.js/environment-variables.md",
    //         },
    //         {
    //           title: "Base Path",
    //           path: "/docs/api-reference/next.config.js/basepath.md",
    //         },
    //         {
    //           title: "Rewrites",
    //           path: "/docs/api-reference/next.config.js/rewrites.md",
    //         },
    //         {
    //           title: "Redirects",
    //           path: "/docs/api-reference/next.config.js/redirects.md",
    //         },
    //         {
    //           title: "Custom Headers",
    //           path: "/docs/api-reference/next.config.js/headers.md",
    //         },
    //         {
    //           title: "Custom Page Extensions",
    //           path:
    //             "/docs/api-reference/next.config.js/custom-page-extensions.md",
    //         },
    //         {
    //           title: "CDN Support with Asset Prefix",
    //           path:
    //             "/docs/api-reference/next.config.js/cdn-support-with-asset-prefix.md",
    //         },
    //         {
    //           title: "Custom Webpack Config",
    //           path:
    //             "/docs/api-reference/next.config.js/custom-webpack-config.md",
    //         },
    //         {
    //           title: "Compression",
    //           path: "/docs/api-reference/next.config.js/compression.md",
    //         },
    //         {
    //           title: "Runtime Configuration",
    //           path:
    //             "/docs/api-reference/next.config.js/runtime-configuration.md",
    //         },
    //         {
    //           title: "Disabling x-powered-by",
    //           path:
    //             "/docs/api-reference/next.config.js/disabling-x-powered-by.md",
    //         },
    //         {
    //           title: "Disabling ETag Generation",
    //           path:
    //             "/docs/api-reference/next.config.js/disabling-etag-generation.md",
    //         },
    //         {
    //           title: "Setting a custom build directory",
    //           path:
    //             "/docs/api-reference/next.config.js/setting-a-custom-build-directory.md",
    //         },
    //         {
    //           title: "Configuring the Build ID",
    //           path:
    //             "/docs/api-reference/next.config.js/configuring-the-build-id.md",
    //         },
    //         {
    //           title: "Configuring onDemandEntries",
    //           path:
    //             "/docs/api-reference/next.config.js/configuring-onDemandEntries.md",
    //         },
    //         {
    //           title: "Ignoring TypeScript Errors",
    //           path:
    //             "/docs/api-reference/next.config.js/ignoring-typescript-errors.md",
    //         },
    //         {
    //           title: "exportPathMap",
    //           path: "/docs/api-reference/next.config.js/exportPathMap.md",
    //         },
    //         {
    //           title: "Trailing Slash",
    //           path: "/docs/api-reference/next.config.js/trailing-slash.md",
    //         },
    //         {
    //           title: "React Strict Mode",
    //           path: "/docs/api-reference/next.config.js/react-strict-mode.md",
    //         },
    //       ],
    //     },
    //   ],
    // },
    {
      title: "Support",
      heading: true,
      routes: [
        {
          title: "Support Center",
          path: "/docs/support/index.mdx",
        },
        {
          title: "Privacy Poicy",
          path: "/docs/support/privacy-policy.mdx",
        },
        {
          title: "Terms and Conditions",
          path: "/docs/support/terms-and-conditions.mdx",
        },
        {
          title: "Cookie Policy",
          path: "/docs/support/cookie-policy.mdx",
        },
        {
          title: "Refund Policy",
          path: "/docs/support/refund-policy.mdx",
        },
      ],
    },
  ],
};
