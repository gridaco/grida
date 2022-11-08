import React from "react";
import {
  PropertyLine,
  PropertyGroup,
  PropertyGroupHeader,
  PropertyLines,
} from "@editor-ui/property";
import { useTargetContainer } from "hooks/use-target-node";
import type { BlurEffect, ShadowEffect, Effect } from "@design-sdk/figma";
import styled from "@emotion/styled";
import { ReadonlyProperty } from "components/inspector";
import { ColorChip } from "@code-editor/property";
import * as css from "@web-builder/styles";
import { BoxShadowManifest, Offset } from "@reflect-ui/core";
import { copy } from "utils/clipboard";

/**
 * Layer effects
 * - shadow (inner, outer)
 * - blur (layer, background)
 */
export function EffectsSection() {
  const { target } = useTargetContainer();

  const effects = target?.effects?.filter(Boolean).filter((e) => e.visible);

  if (!effects || effects.length === 0) {
    return <></>;
  }

  const blurs: Array<BlurEffect> = effects.filter(
    (e) => e.type === "LAYER_BLUR" || e.type === "BACKGROUND_BLUR"
  ) as Array<BlurEffect>;

  const shadows: Array<ShadowEffect> = effects.filter(
    (e) => e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW"
  ) as Array<ShadowEffect>;

  return (
    <PropertyGroup>
      <PropertyGroupHeader>
        <h6>Effects</h6>
      </PropertyGroupHeader>
      <PropertyLines>
        <EffectPreview effects={effects} />
      </PropertyLines>
      {/* TODO: support blur effects */}
      {/* {!!blurs.length && <ListBlurs blurs={blurs} />} */}
      {!!shadows.length && <ListShadows shadows={shadows} />}
    </PropertyGroup>
  );
}

function ListBlurs({ blurs }: { blurs: Array<BlurEffect> }) {
  return (
    <>
      {blurs.map((b) => {
        return <div>blur: {b.radius}</div>;
      })}
    </>
  );
}

function ListShadows({ shadows }: { shadows: Array<ShadowEffect> }) {
  return (
    <PropertyLines>
      {shadows.map(({ offset, radius, spread, color }, i) => {
        const onclick = (e) => {
          const cssstr = css.boxshadow({
            color: color,
            blurRadius: radius,
            offset: new Offset(offset.x, offset.y),
            spreadRadius: spread,
          });
          copy(cssstr, { notify: true });
        };

        return (
          <div key={i}>
            <PropertyLine label={"Shade #" + (i + 1)} onClick={onclick}>
              <ReadonlyProperty prefix={"X"} value={offset.x} />
              <ReadonlyProperty prefix={"Y"} value={offset.x} />
              <ReadonlyProperty prefix={"S."} value={spread ?? 0} />
              <ReadonlyProperty prefix={"B."} value={radius} />
            </PropertyLine>
            <div style={{ height: 8 }} />
            <PropertyLine label=" " key={i}>
              <ColorChip
                color={{
                  r: color.r,
                  g: color.g,
                  b: color.b,
                  o: color.a,
                }}
              />
              <span
                style={{
                  color: "rgba(255, 255, 255, 0.3)",
                  fontSize: 9,
                  alignSelf: "center",
                }}
              >
                {css.color(color)}
              </span>
            </PropertyLine>
          </div>
        );
      })}
    </PropertyLines>
  );
}

function EffectPreview({ effects }: { effects: Array<Effect> }) {
  const shadows: ShadowEffect[] = effects.filter(
    (e) => e.type === "DROP_SHADOW"
  ) as ShadowEffect[];

  const boxshadows: BoxShadowManifest[] = shadows
    .map((e) => {
      return {
        color: e.color,
        blurRadius: e.radius,
        offset: new Offset(e.offset.x, e.offset.y),
        spreadRadius: e.spread,
      } as BoxShadowManifest;
      // todo
      // ref: box-shadow: none|h-offset v-offset blur spread color |inset;
    })
    .filter(Boolean);

  const style = {
    boxShadow: css.boxshadow(...boxshadows),
  };

  const onclick = () => {
    copy(`box-shadow: ${style.boxShadow};`, { notify: true });
  };

  return (
    <EffectsPreviewContainer padding={14} onClick={onclick}>
      <span
        className="application"
        style={{
          width: 40,
          height: 40,
          ...style,
          backgroundColor: "white",
        }}
      />
    </EffectsPreviewContainer>
  );
}

const EffectsPreviewContainer = styled.div<{ padding: number }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: white;
  border-radius: 4px;
  padding: ${(p) => p.padding}px;

  .application {
    border-radius: 4px;
  }
`;
