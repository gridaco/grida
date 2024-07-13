import { Button } from "@/components/ui/button";
import {
  GitHubLogoIcon,
  InstagramLogoIcon,
  LinkedInLogoIcon,
  TwitterLogoIcon,
} from "@radix-ui/react-icons";
import Link from "next/link";

export function Footer_001() {
  return (
    <div className="py-10 w-full flex flex-wrap justify-center items-center gap-2">
      <Link href="#">
        <Button variant="outline" size="icon" className="rounded-full">
          <TwitterLogoIcon />
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
    </div>
  );
}
