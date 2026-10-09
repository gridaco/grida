import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import Header from "@/www/header";
import Footer from "@/www/footer";
import styles from "./page.module.css";

const title = "Grida FX — Grida";
const description =
  "Grida FX connects models, local tools, and checks into reusable asset workflows. Plan, run, inspect, and reuse every step.";

export const metadata: Metadata = {
  title,
  description,
  metadataBase: new URL("https://grida.co"),
  alternates: { canonical: "https://grida.co/fx" },
  openGraph: {
    title,
    description,
    url: "https://grida.co/fx",
    images: [
      {
        url: "/www/2026-10/wind-garden-repaint/preview.webp",
        alt: "A sunlit layered Wind Garden game background",
      },
    ],
  },
  twitter: { card: "summary_large_image" },
};

export default function FXPage() {
  return (
    <div className={styles.page} data-testid="fx-page">
      <Header />
      <main>
        <section className={styles.hero} aria-labelledby="fx-title">
          <div className={styles.intro}>
            <h1 id="fx-title" className={styles.wordmark}>
              <span className={styles.grida}>Grida </span>
              <span className={styles.fx}>FX</span>
            </h1>
            <div className={styles.copy}>
              <h2>Go with the flow.</h2>
              <p>
                Connect models, local tools, and checks. Turn a brief into
                assets you can use.
              </p>
              <div className={styles.actions}>
                <Link href="/downloads" className={styles.download}>
                  Download Grida <ArrowRight aria-hidden="true" />
                </Link>
                <Link href="/ai/models" className={styles.models}>
                  Explore models <ArrowUpRight aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>

          <figure className={styles.workflow}>
            <svg
              className={styles.connection}
              viewBox="0 0 1120 460"
              fill="none"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path d="M220 230H408C444 230 452 198 488 198H630C670 198 680 230 720 230H900" />
              <path
                className={styles.flow}
                d="M220 230H408C444 230 452 198 488 198H630C670 198 680 230 720 230H900"
              />
            </svg>
            <div className={styles.reference}>
              <div className={styles.referenceArt}>
                <Image
                  src="/www/2026-10/wind-garden-repaint/source.webp"
                  alt="Five prepared Wind Garden landscape layers before their seams are repainted"
                  fill
                  priority
                  sizes="(max-width: 700px) 42vw, 300px"
                  draggable={false}
                />
              </div>
              <span className={styles.label}>Source layers</span>
            </div>
            <div className={styles.function} aria-hidden="true">
              <span>
                f<span className={styles.parenthesis}>(</span>x
                <span className={styles.parenthesis}>)</span>
              </span>
            </div>
            <div className={styles.result}>
              <div className={styles.resultArt}>
                <Image
                  src="/www/2026-10/wind-garden-repaint/preview.webp"
                  alt="The Wind Garden background composed from five seamless layers exported by Grida FX"
                  fill
                  priority
                  sizes="(max-width: 700px) 42vw, 420px"
                  draggable={false}
                />
              </div>
              <span className={styles.label}>Looping background</span>
            </div>
            <figcaption className={styles.caption}>
              Plan. Run. Inspect. Reuse.
            </figcaption>
          </figure>
        </section>
      </main>
      <Footer className="border-0" />
    </div>
  );
}
