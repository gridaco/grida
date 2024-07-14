import { GridaLogo } from "@/components/grida-logo";
import { SlotNode } from "../node";
import { TemplateBuilderWidgets } from "../widgets";

export function Header_001() {
  return (
    <div className="bg-transparent top-0 left-0 right-0 flex items-center justify-center p-4 z-10">
      <SlotNode node_id="logo" component={TemplateBuilderWidgets.Container}>
        <GridaLogo className="w-5 h-5" />
      </SlotNode>
    </div>
  );
}
