import cmath from "@grida/cmath";
import { NodeElement } from "../../nodes/node";

export function Header_001({ logo }: { logo?: string }) {
  return (
    <NodeElement
      // name="Header"
      node_id="header"
      // component={TemplateBuilderWidgets.flex}
      fill={{
        type: "solid",
        color: cmath.colorformats.RGB888A32F.TRANSPARENT,
        active: true,
      }}
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
