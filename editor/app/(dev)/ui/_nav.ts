export type NavItem = { name: string; href: string };
export type NavGroup = { label: string; items: NavItem[] };

export const uiNavGroups: NavGroup[] = [
  {
    label: "Foundations",
    items: [{ name: "Icons", href: "/ui/icons" }],
  },
  {
    label: "Components",
    items: [
      { name: "AI Chat", href: "/ui/components/ai-chat" },
      { name: "AI Chat Tool Cards", href: "/ui/components/ai-chat/tools" },
      {
        name: "AI Response Markdown",
        href: "/ui/components/ai-chat/markdown",
      },
      { name: "Degree Control", href: "/ui/components/degree" },
      { name: "Spinner", href: "/ui/components/spinner" },
      { name: "Progress", href: "/ui/components/progress" },
      { name: "Composer", href: "/ui/components/composer" },
      { name: "Rich Text Editor", href: "/ui/components/rich-text-editor" },
      { name: "Code Editor (CodeMirror)", href: "/ui/components/codemirror" },
      { name: "Timeline", href: "/ui/components/timeline" },
      { name: "Property Controls", href: "/ui/components/property" },
      { name: "Flex Align", href: "/ui/components/controls-flex-align" },
    ],
  },
  {
    label: "Packages",
    items: [
      { name: "@grida/hud", href: "/packages/@grida/hud" },
      { name: "@grida/tree-view", href: "/packages/@grida/tree-view" },
    ],
  },
  {
    label: "Forms",
    items: [
      { name: "Email Challenge", href: "/ui/components/email-challenge" },
      { name: "Tag Input", href: "/ui/components/tags" },
      { name: "Phone Input", href: "/ui/components/phone-input" },
    ],
  },
  {
    label: "Showcases",
    items: [
      { name: "Multiplayer", href: "/ui/multiplayer" },
      { name: "Gradient Editor", href: "/ui/gradient-editor" },
      { name: "Media Player", href: "/ui/media-player" },
      { name: "Lasso", href: "/ui/lasso" },
      { name: "Frames", href: "/ui/frames" },
      { name: "Floating Window", href: "/ui/floating-window" },
      { name: "Nested Property Picker", href: "/ui/nested-property-picker" },
      { name: "Themes", href: "/ui/themes" },
    ],
  },
];
