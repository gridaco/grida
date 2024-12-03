import { Button } from "@/components/ui/button";
import { NodeElement } from "../../nodes/node";
import { IconWidget } from "../widgets/icon";
import Link from "next/link";

export function Footer_001() {
  return (
    <NodeElement
      // className={"py-10 w-full"}
      node_id={"footer-flex"}
      // component={TemplateBuilderWidgets.container}
      style={{
        flexWrap: "wrap",
        // justifyContent: "center",
        // alignItems: "center",
        // gap: 2,
      }}
    >
      <Link href="#">
        <Button variant="outline" size="icon" className="rounded-full">
          <IconWidget repository="radix-ui/icons" name="GlobeIcon" />
        </Button>
      </Link>
      <Link href="#">
        <Button variant="outline" size="icon" className="rounded-full">
          <IconWidget repository="radix-ui/icons" name="InstagramLogoIcon" />
        </Button>
      </Link>
      <Link href="#">
        <Button variant="outline" size="icon" className="rounded-full">
          <IconWidget repository="radix-ui/icons" name="TwitterLogoIcon" />
        </Button>
      </Link>
      <Link href="#">
        <Button variant="outline" size="icon" className="rounded-full">
          <IconWidget repository="radix-ui/icons" name="GitHubLogoIcon" />
        </Button>
      </Link>
      <Link href="#">
        <Button variant="outline" size="icon" className="rounded-full">
          <IconWidget repository="radix-ui/icons" name="LinkedInLogoIcon" />
        </Button>
      </Link>
    </NodeElement>
  );
}
