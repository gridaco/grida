import { Button } from "@/components/ui/button";
import {
  GitHubLogoIcon,
  GlobeIcon,
  InstagramLogoIcon,
  LinkedInLogoIcon,
  TwitterLogoIcon,
} from "@radix-ui/react-icons";
import Link from "next/link";
import { TemplateBuilderWidgets } from "../widgets";
import { SlotNode } from "../node";

export function Footer_001() {
  return (
    <div className="py-10 w-full">
      <SlotNode
        node_id={"footer-flex"}
        component={TemplateBuilderWidgets.Flex}
        defaultProps={{
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          gap: 2,
        }}
      >
        <Link href="#">
          <Button variant="outline" size="icon" className="rounded-full">
            <GlobeIcon />
          </Button>
        </Link>
        <Link href="#">
          <Button variant="outline" size="icon" className="rounded-full">
            <InstagramLogoIcon />
          </Button>
        </Link>
        <Link href="#">
          <Button variant="outline" size="icon" className="rounded-full">
            <TwitterLogoIcon />
          </Button>
        </Link>
        <Link href="#">
          <Button variant="outline" size="icon" className="rounded-full">
            <GitHubLogoIcon />
          </Button>
        </Link>
        <Link href="#">
          <Button variant="outline" size="icon" className="rounded-full">
            <LinkedInLogoIcon />
          </Button>
        </Link>
      </SlotNode>
    </div>
  );
}
