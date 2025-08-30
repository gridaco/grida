import { GridaLogo } from "@/components/grida-logo";
import {
  Footer as _Footer,
  FooterColumn,
  FooterBottom,
  FooterContent,
} from "@/www/ui/footer";
import { GitHubLogoIcon } from "@radix-ui/react-icons";
import { XLogoIcon } from "@/components/logos/x";

import Link from "next/link";
import { sitemap } from "./data/sitemap";
import { SlackIcon } from "lucide-react";

export default function Footer() {
  return (
    <div>
      <footer className="w-full px-4 container mx-auto">
        <div className="mx-auto max-w-container">
          <_Footer className="border-t pt-8 bg-transparent">
            <FooterContent className="sm:grid-cols-2 md:grid-cols-3">
              <FooterColumn className="col-span-2 flex-row items-center justify-between gap-8 pb-8 md:col-span-1 md:flex-col md:items-start md:justify-start">
                <Link href="/home">
                  <div className="flex items-center gap-2">
                    <GridaLogo />
                    <h3 className="text-xl font-bold">Grida</h3>
                  </div>
                </Link>
                <div className="ml-2.5 flex gap-4 sm:ml-0">
                  <Link
                    href={sitemap.links.github}
                    className="text-muted-foreground"
                  >
                    <span className="sr-only">GitHub</span>
                    <GitHubLogoIcon className="size-5" />
                  </Link>
                  <Link
                    href={sitemap.links.x}
                    className="text-muted-foreground"
                  >
                    <span className="sr-only">X (Twitter)</span>
                    <XLogoIcon className="size-5" />
                  </Link>
                  <Link
                    href={sitemap.links.slack}
                    className="text-muted-foreground"
                  >
                    <span className="sr-only">Slack Community</span>
                    <SlackIcon className="size-5" />
                  </Link>
                </div>
              </FooterColumn>
              <FooterColumn>
                <h3 className="text-md pt-1 font-semibold">Product</h3>
                <Link
                  href={sitemap.links.downlaods}
                  className="text-xs md:text-sm text-muted-foreground"
                >
                  Downloads
                </Link>
                <Link
                  href={sitemap.links.changelog}
                  className="text-xs md:text-sm text-muted-foreground"
                >
                  Changelog
                </Link>
                <Link
                  href={sitemap.links.docs}
                  className="text-xs md:text-sm text-muted-foreground"
                >
                  Documentation
                </Link>
              </FooterColumn>
              <FooterColumn>
                <h3 className="text-md pt-1 font-semibold">Resources</h3>
                <Link
                  href={sitemap.links.library}
                  className="text-xs md:text-sm text-muted-foreground"
                >
                  Library
                </Link>
                <Link
                  href={sitemap.links.tools}
                  className="text-xs md:text-sm text-muted-foreground"
                >
                  Tools
                </Link>
                <Link
                  href={sitemap.links.fonts}
                  className="text-xs md:text-sm text-muted-foreground"
                >
                  Grida Fonts
                </Link>
                <Link
                  href={sitemap.links.ai_models}
                  className="text-xs md:text-sm text-muted-foreground"
                >
                  AI Models
                </Link>
                <Link
                  href={sitemap.links.packages}
                  className="text-xs md:text-sm text-muted-foreground"
                >
                  Packages
                </Link>
                <Link
                  href={sitemap.links.thebundle}
                  className="text-xs md:text-sm text-muted-foreground"
                >
                  The Bundle
                </Link>
                <Link
                  href={sitemap.links.corssh}
                  className="text-xs md:text-sm text-muted-foreground"
                >
                  CORS.SH
                </Link>
                <Link
                  href={sitemap.links.figma_vscode}
                  className="text-xs md:text-sm text-muted-foreground"
                >
                  Grida VSCode Extension
                </Link>
                <Link
                  href={sitemap.links.figma_assistant}
                  className="text-xs md:text-sm text-muted-foreground"
                >
                  Figma Assistant
                </Link>
                <Link
                  href={sitemap.links.figma_ci}
                  className="text-xs md:text-sm text-muted-foreground"
                >
                  Figma Ci
                </Link>
              </FooterColumn>
              <FooterColumn>
                <h3 className="text-md pt-1 font-semibold">Contact</h3>
                <Link
                  href={sitemap.links.contact}
                  className="text-xs md:text-sm text-muted-foreground"
                >
                  Contact us
                </Link>
                <Link
                  href={sitemap.links.slack}
                  className="text-xs md:text-sm text-muted-foreground"
                >
                  Slack
                </Link>
                <Link
                  href={sitemap.links.x}
                  className="text-xs md:text-sm text-muted-foreground"
                >
                  X
                </Link>
                <Link
                  href={sitemap.links.github}
                  className="text-xs md:text-sm text-muted-foreground"
                >
                  Github
                </Link>
                <Link
                  href={sitemap.links.blog}
                  className="text-xs md:text-sm text-muted-foreground"
                >
                  Blog
                </Link>
                <Link
                  href={sitemap.links.studio}
                  className="text-xs md:text-sm text-muted-foreground"
                >
                  Grida Studios
                </Link>
              </FooterColumn>
              <FooterColumn>
                <h3 className="text-md pt-1 font-semibold">Legal</h3>
                <Link
                  href={sitemap.links.privacy}
                  className="text-xs md:text-sm text-muted-foreground"
                >
                  Privacy policy
                </Link>
                <Link
                  href={sitemap.links.toc}
                  className="text-xs md:text-sm text-muted-foreground"
                >
                  Terms of Service
                </Link>
                <Link
                  href={sitemap.links.cookies}
                  className="text-xs md:text-sm text-muted-foreground"
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
