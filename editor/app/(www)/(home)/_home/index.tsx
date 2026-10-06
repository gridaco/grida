import Header from "@/www/header";
import Footer from "@/www/footer";
import Link from "next/link";
import Image from "next/image";
import { brands } from "@/www/data/brands";
import { headers } from "next/headers";
import { BookOpenIcon, TerminalIcon } from "lucide-react";
import { downloads } from "../../(downloads)/downloads/downloads";
import { PrimaryDownloadButton } from "../../(downloads)/downloads/download-button";
import { sitemap } from "@/www/data/sitemap";
import { CanvasStory, HeroCanvas } from "./canvas-story";
import FXSection from "./fx-section";
import FXWorldSection from "./fx-world-section";
import ModelsSection from "./models-section";
import OwnershipSection from "./ownership-section";
import HomeMotion, { CreativeChapter, Reveal } from "./home-motion";
import styles from "./home.module.css";

const heroBrands = [
  brands.bytedance,
  brands.polestar,
  brands.replit,
  brands.figma,
  brands.toss,
  brands.zomato,
  brands.freshworks,
  brands.cyberagent,
];

export default async function HomePage() {
  const headersList = await headers();
  const os = downloads.getDesktopOS(headersList.get("user-agent") ?? "");
  const links = os ? await downloads.getLinksForPage(os) : null;
  const downloadButtonProps = {
    os,
    defaultUrl: links?.default?.url ?? null,
    macX64Url: links?.mac_dmg_x64 ?? null,
    fallbackUrl: sitemap.items.downloads.href,
    fallbackLabel: "Download for desktop",
    showShortcut: false,
  };

  return (
    <HomeMotion>
      <main className={styles.home}>
        <Header className={styles.header} />
        <section className={styles.hero} aria-labelledby="home-heading">
          <h1 id="home-heading">
            Make room<span>for your ideas.</span>
          </h1>
          <p>Design, create, and explore on an open canvas.</p>
          <PrimaryDownloadButton
            {...downloadButtonProps}
            className={styles.heroDownload}
          />
        </section>
        <HeroCanvas />
        <div className={styles.heroBrands}>
          <p className={styles.heroBrandsLabel}>Trusted by people at</p>
          <ul className={styles.heroBrandsLogos}>
            {heroBrands.map((brand) => (
              <li key={brand.name}>
                {brand.name === brands.figma.name && (
                  <Image
                    src={brands.figma.outlineSymbol.src}
                    width={brands.figma.outlineSymbol.width}
                    height={brands.figma.outlineSymbol.height}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    unoptimized
                    className={styles.heroFigmaSymbol}
                  />
                )}
                {brand.name === brands.polestar.name && (
                  <Image
                    src={brands.polestar.symbol.src}
                    width={brands.polestar.symbol.width}
                    height={brands.polestar.symbol.height}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    unoptimized
                    className={styles.heroPolestarSymbol}
                  />
                )}
                <Image
                  src={brand.logo.src}
                  width={brand.logo.width}
                  height={brand.logo.height}
                  alt={brand.name}
                  draggable={false}
                  unoptimized
                />
              </li>
            ))}
          </ul>
        </div>
        <CanvasStory />
        <CreativeChapter>
          <FXSection />
          <FXWorldSection />
          <ModelsSection />
        </CreativeChapter>
        <OwnershipSection />
        <Reveal>
          <section
            aria-labelledby="get-started-heading"
            className={styles.closing}
          >
            <h2 id="get-started-heading">Start creating.</h2>
            <div className={styles.closingActions}>
              <PrimaryDownloadButton
                {...downloadButtonProps}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <Link
                href="/docs/cli"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-muted px-6 text-sm font-medium transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <TerminalIcon aria-hidden="true" className="size-4" />
                Install CLI
              </Link>
              <Link
                href={sitemap.items.docs.href}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-muted px-6 text-sm font-medium transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <BookOpenIcon aria-hidden="true" className="size-4" />
                Documentation
              </Link>
            </div>
          </section>
        </Reveal>
        <Footer className="border-0" />
      </main>
    </HomeMotion>
  );
}
