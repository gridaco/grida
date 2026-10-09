"use client";

// CLEANUP IF DEADCODE: portrait study retained while the world demo is active.

import { useEffect, useRef, type CSSProperties } from "react";
import Image from "next/image";
import { PortraitMotionStory } from "./portrait-motion-story";
import styles from "./fx-portrait-section.module.css";

// Existing Stage Gen demonstration assets, not newly generated brand artwork.
// The WebP patches share the portrait’s native crop coordinates.
const art = "/www/2026-10/portrait-motion";
const patches = [
  {
    feature: "left",
    state: "half",
    file: "patch-eyes_half-canvas_left_eye.webp",
  },
  {
    feature: "right",
    state: "half",
    file: "patch-eyes_half-canvas_right_eye.webp",
  },
  {
    feature: "left",
    state: "closed",
    file: "patch-eyes_closed-canvas_left_eye.webp",
  },
  {
    feature: "right",
    state: "closed",
    file: "patch-eyes_closed-canvas_right_eye.webp",
  },
  { feature: "mouth", state: "o", file: "patch-mouth_o-mouth.webp" },
  { feature: "mouth", state: "a", file: "patch-mouth_a-mouth.webp" },
] as const;

const expressions = [
  { label: "Half blink", eyes: "half", mouth: "rest", x: -1, y: -1 },
  { label: "Blink", eyes: "closed", mouth: "rest", x: 1, y: -1 },
  { label: "O", eyes: "open", mouth: "o", x: -1, y: 1 },
  { label: "A", eyes: "open", mouth: "a", x: 1, y: 1 },
] as const;

/** The scroll composition and local expression player are independent of FX runs. */
export default function FXPortraitSection() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const story = new PortraitMotionStory(sectionRef.current!);
    return () => story.dispose();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="fx-world"
      aria-labelledby="fx-portrait-heading"
      data-testid="home-fx-portrait-story"
      className={styles.section}
    >
      <div className={styles.stage} data-portrait-stage>
        <div className={styles.intro}>
          <h2 id="fx-portrait-heading">
            Give your characters <span>expression.</span>
          </h2>
          <p>From artwork to expression.</p>
        </div>
        <p className="sr-only">
          An illustrated portrait workflow finds a character’s face, generates
          eye and mouth states, and aligns them back onto the original artwork.
          Try the prepared expressions using Blink, Wink, and Talk. Talk cycles
          mouth shapes without audio.
        </p>

        <div className={styles.visual} aria-hidden="true">
          <div className={styles.source}>
            <Image
              src={`${art}/input.webp`}
              alt=""
              width={506}
              height={900}
              unoptimized
              draggable={false}
            />
            <svg className={styles.faceFocus} viewBox="0 0 100 100" fill="none">
              <path d="M 0 20 V 0 H 20 M 80 0 H 100 V 20 M 100 80 V 100 H 80 M 20 100 H 0 V 80" />
            </svg>
            <span>Original artwork</span>
          </div>

          <svg
            className={styles.connections}
            viewBox="0 0 1440 900"
            preserveAspectRatio="none"
            fill="none"
          >
            <path d="M 418 378 H 588 Q 630 378 630 420 V 470 Q 630 513 675 513 H 724 M 944 513 H 1015 M 1015 422 V 602 M 1015 422 H 1058 M 1015 602 H 1058" />
            <circle cx="630" cy="444" r="3" />
          </svg>

          <div className={styles.portrait}>
            <div className={styles.workspace}>
              <FaceRig />
            </div>
            <div className={styles.livePortrait}>
              <FaceRig live />
            </div>
            <span className={styles.workspaceLabel}>Face workspace</span>
          </div>

          <div className={styles.expressions}>
            {expressions.map(({ label, eyes, mouth, x, y }) => (
              <figure
                key={label}
                className={styles.expression}
                style={{ "--state-x": x, "--state-y": y } as CSSProperties}
              >
                <div className={styles.expressionArt}>
                  <FaceRig eyes={eyes} mouth={mouth} />
                </div>
                <figcaption>{label}</figcaption>
              </figure>
            ))}
          </div>
        </div>

        <div className={styles.steps} aria-hidden="true">
          <span data-step="source">Artwork</span>
          <i />
          <span data-step="workspace">Face workspace</span>
          <i />
          <span data-step="states">Expressions</span>
          <i />
          <span data-step="portrait">Motion</span>
        </div>

        <div className={styles.result}>
          <div
            className={styles.controls}
            data-portrait-controls
            role="group"
            aria-label="Try portrait expressions"
          >
            <button type="button" data-expression-action="blink">
              Blink
            </button>
            <button type="button" data-expression-action="wink">
              Wink
            </button>
            <button
              type="button"
              data-expression-action="talk"
              aria-pressed="false"
            >
              Talk
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function FaceRig({
  eyes = "open",
  mouth = "rest",
  live = false,
}: {
  eyes?: "open" | "half" | "closed";
  mouth?: "rest" | "o" | "a";
  live?: boolean;
}) {
  return (
    <div className={styles.rig} data-live-portrait={live || undefined}>
      <Image
        src={`${art}/rig-rest.webp`}
        alt=""
        fill
        unoptimized
        draggable={false}
      />
      {patches.map(({ feature, state, file }) => (
        <div
          key={file}
          className={styles.patch}
          data-feature={feature}
          data-expression={state}
          data-enabled={
            !live && (feature === "mouth" ? mouth === state : eyes === state)
          }
          style={{
            left: `${(141 / 988) * 100}%`,
            top: `${(141 / 988) * 100}%`,
            width: `${(706 / 988) * 100}%`,
            height: `${(706 / 988) * 100}%`,
          }}
        >
          <Image
            src={`${art}/${file}`}
            alt=""
            fill
            unoptimized
            draggable={false}
          />
        </div>
      ))}
    </div>
  );
}
