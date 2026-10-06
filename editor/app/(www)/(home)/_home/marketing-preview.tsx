"use client";

import Image from "next/image";
import { Check, GitBranch, ImageIcon } from "lucide-react";
import WorkflowEdgesView from "./workflow-edges-view";
import type { WorkflowEdge } from "./workflow-edges";
import styles from "./marketing-preview.module.css";

const product = "/www/2026-10/fx-campaign/headphones.webp";

/** Finished campaign media, connected as an illustrative FX workflow. */
const edges = [
  { from: "source", to: "process" },
  { from: "process", to: "poster" },
  { from: "process", to: "social", route: "above" },
  { from: "process", to: "story", route: "above" },
] as const satisfies readonly WorkflowEdge[];

export default function MarketingPreview() {
  return (
    <div className={styles.stage} data-testid="home-fx-marketing-preview">
      <div className={styles.intro}>
        <h3>One product. A whole campaign.</h3>
        <p>Keep the idea. Adapt everything around it.</p>
      </div>
      <div className={styles.composition}>
        <WorkflowEdgesView edges={edges} />
        <div className={styles.workflow}>
          <div className={styles.source} data-workflow-node="source">
            <span className={styles.nodeLabel}>
              <ImageIcon />
              Product image
            </span>
            <div className={styles.sourceImage}>
              <ProductImage />
            </div>
            <span className={styles.filename}>headphones.png</span>
          </div>
          <div className={styles.nodeGap} />
          <div className={styles.process} data-workflow-node="process">
            <span className={styles.nodeLabel}>
              <GitBranch />
              Build a campaign
            </span>
            <p>
              Quiet sound.
              <br />A little space for yourself.
            </p>
            <div
              className={styles.palette}
              aria-label="Campaign palette: ice blue, charcoal, and white"
            >
              <i />
              <i />
              <i />
            </div>
            <span className={styles.ready}>
              <Check />3 formats, one direction
            </span>
          </div>
        </div>

        <div className={styles.outputs}>
          <figure className={styles.poster} data-workflow-node="poster">
            <div className={styles.posterArt}>
              <Image
                src="/www/2026-10/fx-campaign/poster-v1.webp"
                alt="hush. headphone launch poster: Less noise. More you."
                fill
                sizes="(max-width: 900px) 240px, 340px"
                draggable={false}
                className={styles.deliverable}
              />
            </div>
            <figcaption>
              <span>Poster</span>
              <span>2:3</span>
            </figcaption>
          </figure>
          <figure className={styles.social} data-workflow-node="social">
            <div className={styles.socialArt}>
              <Image
                src="/www/2026-10/fx-campaign/social-v1.webp"
                alt="hush. square social creative: Find your off switch."
                fill
                sizes="(max-width: 900px) 240px, 340px"
                draggable={false}
                className={styles.deliverable}
              />
            </div>
            <figcaption>
              <span>Social</span>
              <span>1:1</span>
            </figcaption>
          </figure>
          <figure className={styles.story} data-workflow-node="story">
            <div className={styles.storyArt}>
              <video
                src="/www/2026-10/fx-campaign/motion-v2.mp4"
                poster="/www/2026-10/fx-campaign/motion-v2-poster.webp"
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                disablePictureInPicture
                draggable={false}
                aria-label="hush. vertical campaign film: Make room for you. Silver headphones turn slowly in a slate-blue studio."
                className={styles.deliverable}
              />
            </div>
            <figcaption>
              <span>Motion</span>
              <span>9:16</span>
            </figcaption>
          </figure>
        </div>
      </div>
    </div>
  );
}

function ProductImage() {
  return (
    <Image
      src={product}
      alt="Silver over-ear headphones with charcoal cushions"
      fill
      sizes="(max-width: 900px) 280px, 420px"
      draggable={false}
      className={styles.productImage}
    />
  );
}
