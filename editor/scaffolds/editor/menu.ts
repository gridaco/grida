import type { ResourceTypeIconName } from "@/components/resource-type-icon";

export type TMenuData<T extends Record<string, any> = Record<string, any>> = T;

/**
 *
 * @example
 *
 * ```ts
 * const pages_example: {
 *   pages1: Menu[];
 *   pages2: Menu[];
 * } = {
 *   pages1: [
 *     {
 *       type: "group",
 *       label: "Design",
 *       children: [
 *         {
 *           type: "folder",
 *           label: "Campaign",
 *           layout: true,
 *           children: [
 *             {
 *               type: "item",
 *               label: "Cover",
 *             },
 *             {
 *               type: "item",
 *               label: "Main",
 *             },
 *             {
 *               type: "item",
 *               label: "Ending",
 *             },
 *           ],
 *         },
 *       ],
 *     },
 *     {
 *       type: "group",
 *       label: "Results",
 *       children: [
 *         {
 *           type: "item",
 *           label: "Results",
 *           layout: true,
 *           children: [{ label: "Responses" }],
 *         },
 *       ],
 *     },
 *   ],
 *   pages2: [
 *     {
 *       type: "group",
 *       label: "Pages",
 *       children: [
 *         {
 *           type: "folder",
 *           label: "blogs",
 *           children: [
 *             {
 *               type: "item",
 *               label: "page",
 *             },
 *           ],
 *         },
 *         {
 *           type: "folder",
 *           label: "components",
 *           children: [
 *             {
 *               type: "item",
 *               label: "ui",
 *             },
 *             {
 *               type: "item",
 *               label: "button",
 *             },
 *             {
 *               type: "item",
 *               label: "card",
 *             },
 *           ],
 *         },
 *         {
 *           type: "item",
 *           label: "header",
 *         },
 *         {
 *           type: "item",
 *           label: "footer",
 *         },
 *       ],
 *     },
 *   ],
 * };
 * ```
 */
export type Menu<T extends TMenuData = TMenuData> = MenuGroup<T> | MenuItem<T>;

export type MenuLink = {
  href: string;
  target?: string;
};

export type MenuItem<T extends TMenuData = TMenuData> =
  | ({
      type: "folder";
      label: string;
      children: MenuItem<T>[];
      disabled?: boolean;
      icon?: ResourceTypeIconName;
      link?: MenuLink;
      layout?: boolean;
      defaultOpen?: boolean;
    } & T)
  | ({
      type: "item";
      label: string;
      disabled?: boolean;
      icon?: ResourceTypeIconName;
      link?: MenuLink;
    } & T);

export type MenuSeparator = {
  type: "separator";
};

export type MenuGroup<T extends TMenuData = TMenuData> = {
  type: "group";
  label: string;
  children: (MenuItem<T> | MenuSeparator)[];
  icon?: ResourceTypeIconName;
  link?: MenuLink;
};
