import { CraftElement } from "@code-editor/craft/core";
import { RadixIconRenderer } from "./radix-ui-icons-renderer";
import { HtmlCssVanillaRenderer } from "./htmlcss-vanilla-renderer";

export function CraftRenderPipeline({ target }: { target: CraftElement }) {
  if (!target) return <></>;
  switch (target.type) {
    case "@radix-ui/react-icons": {
      return <RadixIconRenderer name={target.name} />;
    }
    case "html": {
      return <HtmlCssVanillaRenderer target={target} />;
    }
  }
}
