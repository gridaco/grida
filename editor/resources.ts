// ───────────────────────────────────────────────────────────────────────────
// Resources — symbolic references to assets under /public, organized to
// mirror the directory tree. Like Android's R class: callsites use
// `Resources.assets.<...>` instead of hardcoded paths so the asset layout
// stays the single source of truth.
//
// Layout mirrors /public/* exactly. To add a new asset, drop the file under
// /public/<path> and register a leaf here in the matching namespace.
// ───────────────────────────────────────────────────────────────────────────

export namespace Resources {
  // TODO: brand kit. 8 files referenced by app/(www)/(brand)/brand/page.tsx.
  // Uncomment + adopt at callsite in a follow-up PR.
  // export const brand = {
  //   symbol: {
  //     light: {
  //       png: "/brand/grida-symbol-240.png",
  //       svg: "/brand/grida-symbol-240.svg",
  //     },
  //     dark: {
  //       png: "/brand/grida-symbol-240-dark.png",
  //       svg: "/brand/grida-symbol-240-dark.svg",
  //     },
  //   },
  //   wordmark: {
  //     light: {
  //       png: "/brand/grida-wordmark-400.png",
  //       svg: "/brand/grida-wordmark-400.svg",
  //     },
  //     dark: {
  //       png: "/brand/grida-wordmark-400-dark.png",
  //       svg: "/brand/grida-wordmark-400-dark.svg",
  //     },
  //   },
  // } as const;

  // TODO: brand logos. Referenced from navbar-logo, favicon, template samples.
  // export const logos = {
  //   grida: "/logos/grida.png",
  //   gridaDark: "/logos/grida-dark.png",
  //   gridaFavicon: "/logos/grida-favicon.png",
  //   gridaFaviconDark: "/logos/grida-favicon-dark.png",
  //   thebundle: "/logos/thebundle.png",
  //   thebundleDark: "/logos/thebundle-dark.png",
  // } as const;

  // TODO: misc product imagery. `abstractPlaceholder` is the hot one — 7 callers.
  // export const images = {
  //   abstractPlaceholder: "/images/abstract-placeholder.jpg",
  //   customerSupportCeo: "/images/customer-support-ceo.png",
  //   customerSupportCeoWink: "/images/customer-support-ceo-wink.png",
  //   download: "/images/download.png",
  // } as const;

  // TODO: dummy media (audio/image/video) for the canvas + media-player demos.
  // export const dummy = {
  //   audio: {
  //     mp3: "/dummy/audio/mp3/mp3-40s-700kb.mp3",
  //   },
  //   image: {
  //     png: "/dummy/image/png/png-square-transparent-1k.png",
  //   },
  //   video: {
  //     mp4: "/dummy/video/mp4/mp4-30s-5mb.mp4",
  //   },
  // } as const;

  // TODO: West (referral sub-product) marketing assets. 3 callers.
  // export const west = {
  //   logoWithType: "/west/logo-with-type.png",
  //   poster: "/west/poster.png",
  // } as const;

  export namespace assets {
    export namespace macos {
      export const icons = {
        finder: "/assets/macos/icons/finder.webp",
        safari: "/assets/macos/icons/safari.webp",
        messages: "/assets/macos/icons/messages.webp",
        maps: "/assets/macos/icons/maps.webp",
        notes: "/assets/macos/icons/notes.webp",
        reminders: "/assets/macos/icons/reminders.webp",
        freeform: "/assets/macos/icons/freeform.webp",
        music: "/assets/macos/icons/music.webp",
        logicPro: "/assets/macos/icons/logic-pro.webp",
        xcode: "/assets/macos/icons/xcode.webp",
        vscode: "/assets/macos/icons/vscode.webp",
        figma: "/assets/macos/icons/figma.webp",
        blender: "/assets/macos/icons/blender.webp",
        notion: "/assets/macos/icons/notion.webp",
        grida: "/assets/macos/icons/grida.webp",
        trashEmpty: "/assets/macos/icons/trash-empty.webp",
        trashFull: "/assets/macos/icons/trash-full.webp",
      } as const;

      export const wallpapers = {
        tahoeBeach: "/assets/macos/wallpapers/tahoe-beach.webp",
      } as const;
    }
  }
}
