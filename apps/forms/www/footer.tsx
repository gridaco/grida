import { GridaLogo } from "@/components/grida-logo";
import {
  Footer as _Footer,
  FooterColumn,
  FooterBottom,
  FooterContent,
} from "@/components/ui/footer";
import { GitHubLogoIcon, TwitterLogoIcon } from "@radix-ui/react-icons";

import Link from "next/link";

const links = {
  x: "https://x.com/grida_co",
  github: "https://github.com/gridaco",
  slack: "/join-slack",
  docs: "/docs",
  privacy: "/privacy",
  toc: "/terms",
  cookies: "/cookies",
};

export default function Footer() {
  return (
    <div>
      <footer className="w-full px-4 container mx-auto">
        <div className="mx-auto max-w-container">
          <_Footer className="border-t pt-8 bg-transparent">
            <FooterContent className="sm:grid-cols-2 md:grid-cols-3">
              <FooterColumn className="col-span-2 flex-row items-center justify-between gap-8 border-b pb-8 md:col-span-1 md:flex-col md:items-start md:justify-start md:border-b-0">
                <Link href="/">
                  <div className="flex items-center gap-2">
                    <GridaLogo />
                    <h3 className="text-xl font-bold">Grida</h3>
                  </div>
                </Link>
                <div className="ml-2.5 flex gap-4 sm:ml-0">
                  <Link href={links.github} className="text-muted-foreground">
                    <span className="sr-only">GitHub</span>
                    <GitHubLogoIcon className="h-5 w-5" />
                  </Link>
                  <Link href={links.x} className="text-muted-foreground">
                    <span className="sr-only">Twitter</span>
                    <TwitterLogoIcon className="h-5 w-5" />
                  </Link>
                </div>
              </FooterColumn>
              <FooterColumn>
                <h3 className="text-md pt-1 font-semibold">Product</h3>
                <a href="#" className="text-sm text-muted-foreground">
                  Changelog
                </a>
                <Link
                  href={links.docs}
                  className="text-sm text-muted-foreground"
                >
                  Documentation
                </Link>
              </FooterColumn>
              <FooterColumn>
                <h3 className="text-md pt-1 font-semibold">Company</h3>
                <a href="#" className="text-sm text-muted-foreground">
                  About
                </a>
                <a href="#" className="text-sm text-muted-foreground">
                  Careers
                </a>
                <a href="#" className="text-sm text-muted-foreground">
                  Blog
                </a>
              </FooterColumn>
              <FooterColumn>
                <h3 className="text-md pt-1 font-semibold">Contact</h3>
                <a href={links.slack} className="text-sm text-muted-foreground">
                  Slack
                </a>
                <a href={links.x} className="text-sm text-muted-foreground">
                  Twitter
                </a>
                <a
                  href={links.github}
                  className="text-sm text-muted-foreground"
                >
                  Github
                </a>
              </FooterColumn>
              <FooterColumn>
                <h3 className="text-md pt-1 font-semibold">Legal</h3>
                <Link
                  href={links.privacy}
                  className="text-sm text-muted-foreground"
                >
                  Privacy policy
                </Link>
                <Link
                  href={links.toc}
                  className="text-sm text-muted-foreground"
                >
                  Terms of Service
                </Link>
                <Link
                  href={links.cookies}
                  className="text-sm text-muted-foreground"
                >
                  Cookie Policy
                </Link>
              </FooterColumn>
            </FooterContent>
            <FooterBottom className="border-0">
              <div>
                © {new Date().getFullYear()} Grida Inc. All rights reserved.
              </div>
            </FooterBottom>
          </_Footer>
        </div>
      </footer>
    </div>
  );
}
