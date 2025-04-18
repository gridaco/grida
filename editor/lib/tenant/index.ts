export namespace Tenant.www.metadata {
  export function getOpenGraphImages(src: string | null) {
    const images = [];

    if (src) {
      images.push({
        url: src,
        width: 1200,
        height: 630,
      });
    }

    return images;
  }

  export function getFavicons(src: string | null, srcDark?: string | null) {
    const icons = [];

    if (src) {
      icons.push({
        rel: "icon",
        url: src,
        media: "(prefers-color-scheme: light)",
      });
    }

    if (srcDark) {
      icons.push({
        rel: "icon",
        url: srcDark,
        media: "(prefers-color-scheme: dark)",
      });
    }

    if (!src && !srcDark) {
      icons.push({
        rel: "icon",
        url: "/favicon.ico",
      });
    }

    return icons;
  }
}
