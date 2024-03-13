import { CraftElement, CraftNode } from "@code-editor/craft";
import { RadixIconRenderer } from "./radix-ui-icons-renderer";
import { HtmlCssVanillaRenderer } from "./htmlcss-vanilla-renderer";
import { CraftViewportRenderer } from "./craft-viewport-renderer";

export function CraftRenderPipeline({ target }: { target: CraftNode }) {
  if (!target) return <></>;
  switch (target.type) {
    case "@radix-ui/react-icons": {
      return <RadixIconRenderer target={target} />;
    }
    case "html": {
      return (
        <HtmlCssVanillaRenderer
          target={target}
          renderer={CraftRenderPipeline}
        />
      );
    }
    case "viewport": {
      return (
        <CraftViewportRenderer target={target} renderer={CraftRenderPipeline} />
      );
    }
  }
}
