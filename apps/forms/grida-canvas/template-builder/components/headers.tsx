import { GridaLogo } from "@/components/grida-logo";
import { NodeElement } from "../../nodes/node";
import { ReactNodeRenderers } from "../../nodes";

export function Header_001({ logo }: { logo?: string }) {
  return (
    <NodeElement
      // name="Header"
      node_id="header"
      // component={TemplateBuilderWidgets.flex}
      fill={{ type: "solid", color: { r: 0, g: 0, b: 0, a: 0 } }}
      style={
        {
          // right: 0,
          // justifyContent: "center",
          // alignItems: "center",
          // padding: 16,
          // zIndex: 10,
        }
      }
    >
      <NodeElement
        node_id="logo"
        // name="Logo"
        // component={TemplateBuilderWidgets.container}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="logo" className="w-full h-5 object-contain" />
      </NodeElement>
    </NodeElement>
  );
}
