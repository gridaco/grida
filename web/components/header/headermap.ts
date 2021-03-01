type HeaderMap = {
    label: string,
    href?: string,
    child?: HeaderMap[]
}

const Products: HeaderMap = {
    label: "Products",
    child: []
}

const WhyBridged: HeaderMap = {
    label: "Why Bridged",
    child: []
}

export const HeaderMap: HeaderMap[] = [
    Products,
    WhyBridged,
    {
        label: "Pricing",
        href: "/pricing"
    },
    {
        label: "Docs",
        href: "/docs"
    },
    {
        label: "Blog",
        href: "/blog"
    },
    {
        label: "Github",
        href: "/github"
    }
]