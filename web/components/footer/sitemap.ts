export type Sitemap = {
    label: string;
    href: string;
    child?: Sitemap[]
}

export const Products: Sitemap = {
    label: "Products",
    href: "/product",
    child: [
        {
            label: "Cloud",
            href: "/product/cloud",
        },
        {
            label: "Globalization",
            href: "/product/g11n",
        },
        {
            label: "Reflect",
            href: "/product/reflect",
        },
        {
            label: "Surf",
            href: "/product/surf",
        },
        {
            label: "Assistant",
            href: "/product/assistant",
        },
        {
            label: "Console",
            href: "/product/console",
        },
        {
            label: "Appbox",
            href: "/product/appbox",
        }
    ]
}

export const Solutions: Sitemap = {
    label: "Solutions",
    href: "/solution",
    child: [
        {
            label: "Handoff",
            href: "/solution/handoff",
        },
        {
            label: "Get Started",
            href: "/solution/getstart",
        },
        {
            label: "API Docs",
            href: "/solution/api",
        },
        {
            label: "Papers",
            href: "/solution/papers",
        },
        {
            label: "Blogs",
            href: "/solution/blogs",
        },
        {
            label: "Showcase",
            href: "/solution/showcase",
        }
    ]
}

export const Resources: Sitemap = {
    label: "Resources",
    href: "/resource",
    child: [
        {
            label: "Docs",
            href: "/resource/docs",
        },
        {
            label: "Get Started",
            href: "/resource/getstart",
        },
        {
            label: "API Docs",
            href: "/resource/api",
        },
        {
            label: "Papers",
            href: "/resource/papers",
        },
        {
            label: "Blogs",
            href: "/resource/blogs",
        },
        {
            label: "Showcase",
            href: "/resource/showcase",
        }
    ]
}

export const Platforms: Sitemap = {
    label: "Platforms",
    href: "/platform",
    child: [
        {
            label: "Figma",
            href: "/platform/figma",
        },
        {
            label: "Sketch",
            href: "/platform/sketch",
        },
        {
            label: "XD",
            href: "/platform/xd",
        },
        {
            label: "React",
            href: "/platform/react",
        },
        {
            label: "Flutter",
            href: "/platform/flutter",
        },
        {
            label: "Vue",
            href: "/platform/vue",
        },
        {
            label: "Svelte",
            href: "/platform/svelte",
        },
        {
            label: "HTML/CSS",
            href: "/platform/pureweb",
        },
        {
            label: "Reflect",
            href: "/platform/reflect",
        }
    ]
}

export const Together: Sitemap = {
    label: "Together",
    href: "/together",
    child: [
        {
            label: "Let's create together",
            href: "/together/create",
        },
        {
            label: "How to contribute",
            href: "/together/contribute",
        },
        {
            label: "Github",
            href: "/together/github",
        },
        {
            label: "Projects",
            href: "/together/projects",
        },
        {
            label: "Join us on Slack",
            href: "/together/slack",
        },
        {
            label: "Meetups",
            href: "/together/meetup",
        },
        {
            label: "Reddit",
            href: "/together/reddit",
        }
    ]
}

export const Sitemap: Sitemap[] = [
    Products,
    Solutions,
    Resources,
    Platforms,
    Together
]